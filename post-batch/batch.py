#!/usr/bin/env python3
"""Batch pipeline for Middle-earth history posts.

Step 1, choice sheets (no model needed):
  python3 post-batch/batch.py candidates --csv posts.csv --images images/ --out out/

  For every post, writes out/candidates/post-NNN.png: the bare painting with the three
  title-panel areas outlined, plus the post rendered with the panel at top-left,
  top-middle and top-right. Also writes out/suggested.csv with an automatic suggestion
  (the least busy area) and the busyness score of each area.

Step 2, choose positions: a reviewer (the post-placement agent, or you) looks at the
  sheets and writes CSV files into out/decisions/ with columns post,position,note
  (position is left, middle or right).

Step 3, final images (no model needed):
  python3 post-batch/batch.py final --csv posts.csv --images images/ --out out/

  Renders every post at 1920x1080, saves out/post-NNN-<title>.webp at the highest
  quality that fits in 200 KB, writes out/report.csv, and makes review pages
  out/review/review-NN.webp (20 posts per page) with flagged posts marked.

  Position priority: a `position` column in posts.csv (you), then out/decisions/*.csv
  (reviewer), then the automatic suggestion.

posts.csv columns (UTF-8): post, english_title, bangla_subtitle
  Optional: image (file name in the images folder; left empty, the image whose name starts
  with the post number is used, e.g. 1.png or post-001.jpg), english_kicker (small line
  above the title), position (left/middle/right).
  If english_kicker is empty and a long title contains "of", the part up to the last
  "of" becomes the small line, as in "The Complete History of / Middle-earth".
"""
import argparse, csv, glob, io, json, os, re, subprocess, sys, unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
POSITIONS = ["left", "middle", "right"]
LAYOUT_W, LAYOUT_H = 2000, 1125
FINAL_SCALE = 0.96          # 2000x1125 layout -> 1920x1080
THUMB_SCALE = 0.4           # -> 800x450 for choice sheets
WEBP_LIMIT = 200_000        # bytes
# Panel boxes in layout px, used for scoring and outlines before the real height is known.
PANEL_X = {"left": 96, "middle": 700, "right": 1304}
PANEL_W, PANEL_TOP, PANEL_H = 600, 86, 290


def find_fonts():
    if os.environ.get("UNIVERSE_FONTS"):
        return Path(os.environ["UNIVERSE_FONTS"])
    hits = glob.glob("/root/.claude/skills/**/universe-style-system/assets/fonts", recursive=True)
    hits += glob.glob(str(Path.home() / ".claude/skills/**/universe-style-system/assets/fonts"), recursive=True)
    for h in hits:
        if (Path(h) / "middle-earth/Ringbearer.ttf").exists():
            return Path(h)
    sys.exit("Fonts not found. Set UNIVERSE_FONTS to the universe-style-system assets/fonts folder.")


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".tif", ".tiff", ".bmp"}


def images_by_number(images_dir):
    """Map post number -> image file, from names like 1.png, post-001.jpg or 001 Ainur.webp
    (the first number in the name)."""
    found = {}
    for f in sorted(Path(images_dir).iterdir()):
        m = re.search(r"\d+", f.stem)
        if f.suffix.lower() in IMAGE_EXTS and m:
            found.setdefault(int(m.group()), []).append(f)
    return found


def read_posts(csv_path, images_dir):
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    need = {"post", "english_title", "bangla_subtitle"}
    missing = need - set(rows[0].keys() if rows else [])
    if missing:
        sys.exit(f"{csv_path} is missing columns: {', '.join(sorted(missing))}")
    by_number = images_by_number(images_dir)
    posts, problems = [], []
    for i, r in enumerate(rows, start=2):
        r = {k.strip(): (v or "").strip() for k, v in r.items() if k}
        if not r["post"]:
            continue
        num = int(re.sub(r"\D", "", r["post"]) or 0)
        if r.get("image"):
            img = Path(images_dir) / r["image"]
            if not img.exists():
                problems.append(f"line {i}: image not found: {img}")
        else:
            matches = by_number.get(num, [])
            if len(matches) != 1:
                problems.append(f"line {i}: post {num}: " + (
                    "no image with that number in its name" if not matches else
                    "several images with that number: " + ", ".join(m.name for m in matches)))
                continue
            img = matches[0]
        pos = r.get("position", "").lower()
        if pos and pos not in POSITIONS:
            problems.append(f"line {i}: position must be left, middle or right, not {pos!r}")
        kicker, title = r.get("english_kicker", ""), r["english_title"]
        if not kicker:
            kicker, title = split_title(title)
        posts.append({"post": r["post"], "num": num,
                      "kicker": kicker, "title": title, "full_title": r["english_title"],
                      "bangla": r["bangla_subtitle"], "image": img.resolve(), "position": pos})
    if problems:
        sys.exit("Fix posts.csv first:\n  " + "\n  ".join(problems))
    return posts


def split_title(t):
    """Split "The Complete History of Middle-earth" into a small line and a big line, at an
    "of" that leaves a short big line (up to 24 characters) and a small line of up to 30."""
    if len(t) <= 22:
        return "", t
    for m in re.finditer(r"\bof\s+", t, re.I):
        kicker, rest = t[:m.end()].strip(), t[m.end():].strip()
        if len(rest) <= 24 and len(kicker) <= 30:
            return kicker, rest
    return "", t


def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
    return s[:60].rstrip("-") or "post"


def stem(p):
    return f"post-{p['num']:03d}"


def job_data(p, position, fonts, total):
    return {"image": p["image"].as_uri(), "fonts": fonts.as_uri(), "position": position,
            "kicker": p["kicker"], "title": p["title"], "bangla": p["bangla"],
            "post": p["post"], "total": total}


def run_jobs(jobs, work, workers):
    """Split jobs across several node processes; return {out_path: result}."""
    chunks = [jobs[i::workers] for i in range(workers) if jobs[i::workers]]

    def run(i_chunk):
        i, chunk = i_chunk
        jf = work / f"jobs-{i}.json"
        jf.write_text(json.dumps(chunk))
        r = subprocess.run(["node", str(HERE / "render.js"), str(jf)], capture_output=True, text=True)
        out = [json.loads(l) for l in r.stdout.splitlines() if l.startswith("{")]
        if r.returncode and not out:
            sys.exit(f"render.js failed:\n{r.stderr}")
        return out

    results = {}
    with ThreadPoolExecutor(len(chunks)) as ex:
        for out in ex.map(run, enumerate(chunks)):
            for o in out:
                results[o["out"]] = o
    errors = [f"{k}: {v['error']}" for k, v in results.items() if "error" in v]
    if errors:
        sys.exit("Render errors:\n  " + "\n  ".join(errors))
    return results


def cover(img, w, h):
    s = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    l, t = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((l, t, l + w, t + h))


def busyness(image_path):
    """How much detail sits under each panel area, relative to the painting as a whole.
    About 1.0 is average; open sky is usually well under 1, a figure or a city well over."""
    im = cover(Image.open(image_path).convert("RGB"), 1000, 562)  # half the layout size
    soft = im.filter(ImageFilter.GaussianBlur(1.5))   # ignore paper grain
    g = np.asarray(soft.convert("L"), dtype=np.float32)
    grad = np.abs(np.diff(g, axis=1))[:-1, :] + np.abs(np.diff(g, axis=0))[:, :-1]
    hsv = np.asarray(soft.convert("HSV"), dtype=np.float32)
    sat = hsv[..., 1][:-1, :-1]
    detail = grad / (grad.mean() + 1e-6) + 0.5 * np.abs(sat - sat.mean()) / (sat.std() + 1e-6)
    scores = {}
    for pos in POSITIONS:
        x0, y0 = PANEL_X[pos] // 2 - 10, PANEL_TOP // 2 - 10
        x1, y1 = (PANEL_X[pos] + PANEL_W) // 2 + 10, (PANEL_TOP + PANEL_H) // 2 + 10
        scores[pos] = float(detail[y0:y1, x0:x1].mean() / detail.mean())
    return scores


def font(size, bold=False):
    for f in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def label(draw, xy, text, size=26):
    f = font(size, bold=True)
    x, y = xy
    l, t, r, b = draw.textbbox((x, y), text, font=f)
    draw.rectangle((l - 8, t - 6, r + 8, b + 6), fill=(0, 0, 0))
    draw.text((x, y), text, fill=(255, 255, 255), font=f)


def make_sheet(p, tiles, panels, out):
    """2x2 sheet: bare painting with the three areas outlined, then LEFT, MIDDLE, RIGHT."""
    W, H = 800, 450
    sheet = Image.new("RGB", (W * 2 + 12, H * 2 + 12), (255, 255, 255))
    art = cover(Image.open(p["image"]).convert("RGB"), W, H)
    d = ImageDraw.Draw(art)
    k = W / LAYOUT_W
    for pos in POSITIONS:
        l, t, r, b = panels[pos]
        d.rectangle((l * k, t * k, r * k, b * k), outline=(255, 0, 255), width=3)
        label(d, (l * k + 8, t * k + 8), pos.upper(), 20)
    label(d, (W // 2 - 190, H - 44), f"{stem(p)}: nothing covered")
    sheet.paste(art, (0, 0))
    for i, pos in enumerate(POSITIONS, start=1):
        tile = Image.open(tiles[pos]).convert("RGB")
        label(ImageDraw.Draw(tile), (W // 2 - 50, H - 44), f"{pos.upper()}")
        sheet.paste(tile, ((i % 2) * (W + 12), (i // 2) * (H + 12)))
    sheet.save(out)


def cmd_candidates(a):
    posts = read_posts(a.csv, a.images)
    fonts, out = find_fonts(), Path(a.out)
    work = out / "work" / "thumbs"
    (out / "candidates").mkdir(parents=True, exist_ok=True)
    (out / "decisions").mkdir(exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)
    jobs = [{"data": job_data(p, pos, fonts, a.total), "out": str(work / f"{stem(p)}-{pos}.png"),
             "scale": THUMB_SCALE} for p in posts for pos in POSITIONS]
    res = run_jobs(jobs, out / "work", a.workers)
    rows = []
    for p in posts:
        tiles = {pos: work / f"{stem(p)}-{pos}.png" for pos in POSITIONS}
        panels = {pos: res[str(tiles[pos])]["panel"] for pos in POSITIONS}
        make_sheet(p, tiles, panels, out / "candidates" / f"{stem(p)}.png")
        sc = busyness(p["image"])
        best = min(sc, key=sc.get)
        rows.append({"post": p["post"], "suggested": best,
                     **{f"score_{k}": f"{v:.2f}" for k, v in sc.items()},
                     "sheet": f"candidates/{stem(p)}.png"})
    with open(out / "suggested.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"{len(posts)} choice sheets in {out/'candidates'}; suggestions in {out/'suggested.csv'}")


def encode_webp(png_path, dest):
    im = Image.open(png_path).convert("RGB")
    lo, hi, best = 1, 100, None
    while lo <= hi:
        m = (lo + hi) // 2
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=m, method=6)
        if buf.tell() <= WEBP_LIMIT:
            best, lo = (m, buf.getvalue()), m + 1
        else:
            hi = m - 1
    q, data = best
    Path(dest).write_bytes(data)
    return q, len(data)


def read_decisions(out):
    dec = {}
    for f in sorted(glob.glob(str(out / "decisions" / "*.csv"))):
        with open(f, encoding="utf-8-sig", newline="") as fh:
            for r in csv.DictReader(fh):
                pos = (r.get("position") or "").strip().lower()
                num = re.sub(r"\D", "", r.get("post") or "")
                if pos in POSITIONS and num:
                    dec[int(num)] = (pos, (r.get("note") or "").strip())
    return dec


def cmd_final(a):
    posts = read_posts(a.csv, a.images)
    fonts, out = find_fonts(), Path(a.out)
    work = out / "work" / "final"
    work.mkdir(parents=True, exist_ok=True)
    (out / "review").mkdir(exist_ok=True)
    decisions = read_decisions(out)
    chosen = {}
    for p in posts:
        sc = busyness(p["image"])
        if p["position"]:
            pos, src, note = p["position"], "you", ""
        elif p["num"] in decisions:
            pos, note = decisions[p["num"]]
            src = "reviewer"
        else:
            pos, src, note = min(sc, key=sc.get), "auto", ""
        chosen[p["post"]] = (pos, src, note, sc)
    jobs = [{"data": job_data(p, chosen[p["post"]][0], fonts, a.total),
             "out": str(work / f"{stem(p)}.png"), "scale": FINAL_SCALE} for p in posts]
    res = run_jobs(jobs, out / "work", a.workers)

    report = []
    for p in posts:
        pos, src, note, sc = chosen[p["post"]]
        png = work / f"{stem(p)}.png"
        name = f"{stem(p)}-{slug(p['full_title'])}.webp"
        q, size = encode_webp(png, out / name)
        flags = list(res[str(png)]["warnings"])
        if sc[pos] > 1.3 * min(sc.values()):
            flags.append(f"busy area under the title (score {sc[pos]:.2f}, quietest {min(sc, key=sc.get)} {min(sc.values()):.2f})")
        if q < 60:
            flags.append(f"low WebP quality {q} to fit 200 KB")
        report.append({"post": p["post"], "file": name, "position": pos, "chosen_by": src,
                       "webp_quality": q, "bytes": size, "flags": "; ".join(flags), "note": note})
    with open(out / "report.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(report[0].keys()))
        w.writeheader(); w.writerows(report)

    # review pages: 4 x 5 grid, 20 posts per page, flagged posts outlined in red
    TW, TH, cols, rows_ = 480, 270, 4, 5
    for page in range(0, len(report), cols * rows_):
        items = report[page:page + cols * rows_]
        used_rows = -(-len(items) // cols)
        sheet = Image.new("RGB", (cols * (TW + 10) + 10, used_rows * (TH + 10) + 10), (40, 40, 40))
        for i, r in enumerate(items):
            p = next(x for x in posts if x["post"] == r["post"])
            t = Image.open(work / f"{stem(p)}.png").convert("RGB").resize((TW, TH), Image.LANCZOS)
            d = ImageDraw.Draw(t)
            label(d, (TW // 2 - 50, TH - 30), f"{r['post']} {r['position']}", 16)
            if r["flags"]:
                d.rectangle((0, 0, TW - 1, TH - 1), outline=(255, 0, 0), width=6)
                label(d, (TW // 2 - 40, 100), "CHECK", 22)
            sheet.paste(t, (10 + (i % cols) * (TW + 10), 10 + (i // cols) * (TH + 10)))
        sheet.save(out / "review" / f"review-{page // (cols * rows_) + 1:02d}.webp", quality=85, method=6)

    flagged = [r for r in report if r["flags"]]
    print(f"{len(report)} posts saved to {out}; {len(flagged)} flagged (see report.csv)")
    for r in flagged:
        print(f"  {r['post']}: {r['flags']}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("candidates", "final"):
        s = sub.add_parser(name)
        s.add_argument("--csv", required=True)
        s.add_argument("--images", required=True)
        s.add_argument("--out", required=True)
        s.add_argument("--total", default="220", help="series length shown in the badge")
        s.add_argument("--workers", type=int, default=4, help="parallel render processes")
    a = ap.parse_args()
    {"candidates": cmd_candidates, "final": cmd_final}[a.cmd](a)


if __name__ == "__main__":
    main()
