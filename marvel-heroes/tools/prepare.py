#!/usr/bin/env python3
"""Turn a headings list plus a folder of art into post configs, ready to render.

  python3 -I marvel-heroes/tools/prepare.py            # real run
  python3 -I marvel-heroes/tools/prepare.py --dry-run  # report only, change nothing
  python3 -I marvel-heroes/tools/prepare.py --root DIR # work on another copy (for tests)

Inputs (under the marvel-heroes folder, or --root):
  headings.txt  one heading per line, in the format the series already uses:
                  ARC 2 | Street level          (also: "Arc - 2 - Street level", "ARC 2: Street level")
                  DAY 11 — DAREDEVIL / বাংলা লাইন
                  OPENING — HERO / line   and   GOODBYE — HERO / line   (day 0 and day 101)
                The pasted two-line form also works: "Day 11 · VISION" then "VISION / line".
                An ARC line applies to every DAY line below it until the next ARC line.
  inbox/        the art. A file whose name starts with the day number (11.webp, 011.webp,
                day-11-anything.webp) is matched automatically. Other files are listed as
                "unmatched" and can be matched with map.txt (one line: filename = day).
  map.txt       optional, "filename = day" lines for files that do not start with a number.
  --sync-text   also refresh the text of days that already have a config (see below)
  layout.txt    optional, "day = position" lines (bottom-left, bottom-right, bottom, top-left,
                top-right, middle). Applied on every run, also to days that already exist.

What it does for each matched day that has no posts/day-NNN.json yet (or with --force):
  moves the art to images/day-NNN-hero.ext, writes posts/day-NNN.json with the art placed to
  cover the 1920x1080 canvas. Days that already have a config are left alone, so the finished
  opening and Days 1 to 10 are never touched.
"""
import argparse, json, math, re, shutil, sys
from pathlib import Path
from PIL import Image

IMG_EXT = {".webp", ".png", ".jpg", ".jpeg"}
POSITIONS = {"bottom-left", "bottom-right", "bottom", "top-left", "top-right", "middle"}
DASHES = "—–"


def parse_headings(path):
    """Accepts one-line entries (DAY 11 — HERO / line, OPENING — ..., GOODBYE — ...) and the pasted
    two-line form (a label line such as "Day 11 · VISION" or "Series Goodbye · MARVEL HEROES",
    followed by the "HERO / line" heading). ARC lines apply to every entry below them."""
    days, warns, arc, pending = {}, [], None, None
    SPECIAL = {"opening": (0, "Opening"), "goodbye": (101, "Goodbye")}

    def add(d, hero, tag, label, line_no):
        if any(c in tag for c in DASHES):
            warns.append(f"Day {d}: the Bangla line contains a dash, rewrite it: {tag}")
        if d in days:
            warns.append(f"Day {d} appears twice in headings.txt, the later line wins")
        days[d] = dict(hero=hero.strip(), tagline=tag.strip(), arc=arc, label=label)

    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith(("```", "#")):
            continue
        m = re.match(r"^arc\s*[-\u2014\u2013:/|]?\s*(\d+)\s*[-\u2014\u2013:/|]\s*(.+)$", line, re.I)
        if m:
            arc = (int(m.group(1)), m.group(2).strip())
            continue
        # label line of the two-line form
        m = re.match(r"^(?:series\s+(opening|goodbye)|day\s*(\d+))\s*[\u00b7\u2022]\s*.+$", line, re.I)
        if m and "/" not in line:
            pending = SPECIAL[m.group(1).lower()] + (None,) if m.group(1) else (int(m.group(2)), None, None)
            continue
        # one-line forms
        m = re.match(r"^(opening|goodbye)\s*[-\u2014\u2013:]\s*(.+?)\s*/\s*(.+)$", line, re.I)
        if m:
            d, label = SPECIAL[m.group(1).lower()]
            add(d, m.group(2), m.group(3), label, n)
            pending = None
            continue
        m = re.match(r"^day\s*(\d+)\s*[-\u2014\u2013:]\s*(.+?)\s*/\s*(.+)$", line, re.I)
        if m:
            add(int(m.group(1)), m.group(2), m.group(3), None, n)
            pending = None
            continue
        # heading line of the two-line form
        m = re.match(r"^(.+?)\s+/\s+(.+)$", line)
        if m and pending:
            add(pending[0], m.group(1), m.group(2), pending[1], n)
            pending = None
            continue
        warns.append(f"headings.txt line {n}: not understood, skipped: {line[:60]}")
    return days, warns


def parse_pairs(path):
    out = {}
    if path.exists():
        for raw in path.read_text(encoding="utf-8").splitlines():
            if "=" in raw and not raw.strip().startswith("#"):
                k, v = raw.split("=", 1)
                out[k.strip()] = v.strip()
    return out


def day_from_name(name):
    m = re.match(r"^(?:day[-_ ]?)?(\d{1,3})(?:\D|$)", Path(name).stem, re.I)
    return int(m.group(1)) if m else None


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "hero"


def art_for(w, h):
    width = max(1920, math.ceil(1080 * w / h))
    return {"width": width, "left": round((1920 - width) / 2), "top": round((1080 - width * h / w) / 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="rewrite configs that already exist")
    ap.add_argument("--sync-text", action="store_true",
                    help="update hero, Bangla line, arc and badge text of EXISTING configs from headings.txt "
                         "(position, art placement and everything else are kept)")
    a = ap.parse_args()
    root = Path(a.root)
    posts, images, inbox = root / "posts", root / "images", root / "inbox"
    for d in (posts, images, inbox):
        d.mkdir(exist_ok=True)

    days, warns = parse_headings(root / "headings.txt")
    manual = {k: int(v) for k, v in parse_pairs(root / "map.txt").items() if v.isdigit()}
    layout = {int(k): v for k, v in parse_pairs(root / "layout.txt").items() if k.isdigit()}

    matched, unmatched = {}, []
    for f in sorted(inbox.iterdir()):
        if f.suffix.lower() not in IMG_EXT:
            continue
        d = manual.get(f.name, day_from_name(f.name))
        if d is None:
            unmatched.append(f.name)
        elif d in matched:
            warns.append(f"Day {d}: two files claim it: {matched[d].name} and {f.name}")
        else:
            matched[d] = f

    made, kept = [], []
    for d, f in sorted(matched.items()):
        h = days.get(d)
        if not h:
            warns.append(f"{f.name}: day {d} has no line in headings.txt, skipped")
            continue
        cfg_path = posts / f"day-{d:03d}.json"
        if cfg_path.exists() and not a.force:
            kept.append(d)
            continue
        im = Image.open(f)
        w, hh = im.size
        if w / hh < 1.7:
            warns.append(f"{f.name}: {w}x{hh} is not 16:9, the art will be cropped to fit")
        arc = h["arc"] or (1, "Avengers core")
        name = f"day-{d:03d}-{slug(h['hero'])}"
        cfg = {"day": d, "total": 100, "arc": arc[0], "arcName": arc[1]}
        if h.get("label"):
            cfg["dayLabel"] = h["label"]
        cfg.update({"hero": h["hero"], "tagline": h["tagline"], "image": f"../images/{name}{f.suffix.lower()}",
                    "pos": "bottom-left", "art": art_for(w, hh), "output": f"{name}.webp"})
        made.append(d)
        if not a.dry_run:
            shutil.move(str(f), images / f"{name}{f.suffix.lower()}")
            cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    changed = []
    for d, pos in sorted(layout.items()):
        p = posts / f"day-{d:03d}.json"
        if pos not in POSITIONS:
            warns.append(f"layout.txt: day {d}: unknown position {pos}")
        elif p.exists() or (a.dry_run and d in made):
            if not a.dry_run:
                c = json.loads(p.read_text(encoding="utf-8"))
                if c.get("pos") != pos:
                    c["pos"] = pos
                    p.write_text(json.dumps(c, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                    changed.append(d)

    synced = []
    if a.sync_text:
        for cp in sorted(posts.glob("day-*.json")):
            d = int(cp.stem.split("-")[1])
            h = days.get(d)
            if not h:
                continue
            c = json.loads(cp.read_text(encoding="utf-8"))
            new = dict(c)
            new["hero"], new["tagline"] = h["hero"], h["tagline"]
            if h["arc"]:
                new["arc"], new["arcName"] = h["arc"]
            if h.get("label"):
                new["dayLabel"] = h["label"]
            if new != c:
                synced.append(d)
                if not a.dry_run:
                    cp.write_text(json.dumps(new, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    have_art = set(matched) | {int(p.stem.split("-")[1]) for p in posts.glob("day-*.json")}
    missing = [d for d in sorted(days) if d not in have_art]
    print(f"headings: {len(days)} days   art matched: {len(matched)}   new configs: {len(made)}   already existed: {len(kept)}")
    if a.sync_text:
        print("text updated for days:", ", ".join(map(str, synced)) or "none")
    if changed:
        print("position changed for days:", ", ".join(map(str, changed)))
    if unmatched:
        print(f"\n{len(unmatched)} files in inbox/ do not start with a day number (see map.txt):")
        for n in unmatched:
            print("  ", n)
    if missing:
        print(f"\n{len(missing)} headings have no art yet: " + ", ".join(map(str, missing)))
    for w in warns:
        print("WARNING:", w)
    if a.dry_run:
        print("\n(dry run, nothing was changed)")


if __name__ == "__main__":
    sys.exit(main())
