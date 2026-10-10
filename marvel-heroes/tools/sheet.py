#!/usr/bin/env python3
"""Labelled contact sheets for reviewing art and finished cards (12 per sheet, 1920x810).

  python3 -I marvel-heroes/tools/sheet.py inbox --out DIR            # files not matched to a day yet
  python3 -I marvel-heroes/tools/sheet.py art   --days 11-22 --out DIR   # art with the planned title zone drawn
  python3 -I marvel-heroes/tools/sheet.py cards --days 11-22 --out DIR   # finished cards

The art sheets draw the zone the title block will cover for each day's position (red box), so a
face under the box is easy to spot. Positions can be changed in layout.txt and prepare.py re-run.
"""
import argparse, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

TW, TH, COLS, ROWS = 480, 270, 4, 3
# approximate title zones in 1920x1080 canvas pixels (x0, y0, x1, y1)
ZONES = {
    "bottom-left": (96, 640, 1300, 1002), "bottom-right": (620, 640, 1824, 1002),
    "bottom": (330, 470, 1590, 820), "top-left": (96, 306, 1300, 650),
    "top-right": (620, 188, 1824, 540), "middle": (330, 370, 1590, 710),
}


def parse_days(s):
    out = []
    for part in s.split(","):
        if "-" in part:
            a, b = part.split("-")
            out += range(int(a), int(b) + 1)
        elif part.strip():
            out.append(int(part))
    return out


def label(im, text, font):
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, im.width, 30), fill=(0, 0, 0))
    d.text((6, 3), text, fill=(247, 201, 72), font=font)


def sheets(items, out, prefix):
    out.mkdir(parents=True, exist_ok=True)
    per = COLS * ROWS
    paths = []
    for s in range(0, len(items), per):
        chunk = items[s:s + per]
        sheet = Image.new("RGB", (TW * COLS, TH * ((len(chunk) + COLS - 1) // COLS)), "black")
        for i, im in enumerate(chunk):
            sheet.paste(im, ((i % COLS) * TW, (i // COLS) * TH))
        p = out / f"{prefix}-{s // per + 1:02d}.png"
        sheet.save(p)
        paths.append(p)
    print("\n".join(str(p) for p in paths))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["inbox", "art", "cards"])
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--days")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    root, out = Path(a.root), Path(a.out)
    font = ImageFont.truetype(str(root / "template/fonts/ComicBook-Bold.otf"), 22)
    items = []
    if a.mode == "inbox":
        from prepare import day_from_name  # same folder
        manual = {}
        mp = root / "map.txt"
        if mp.exists():
            for l in mp.read_text(encoding="utf-8").splitlines():
                if "=" in l:
                    k, v = l.split("=", 1)
                    manual[k.strip()] = v.strip()
        files = [f for f in sorted((root / "inbox").iterdir())
                 if f.suffix.lower() in {".webp", ".png", ".jpg", ".jpeg"}
                 and f.name not in manual and day_from_name(f.name) is None]
        for n, f in enumerate(files, 1):
            im = Image.open(f).convert("RGB").resize((TW, TH), Image.LANCZOS)
            label(im, f"#{n}  {f.name[:34]}", font)
            items.append(im)
        sheets(items, out, "inbox")
        return
    for d in parse_days(a.days):
        cfg_p = root / "posts" / f"day-{d:03d}.json"
        if not cfg_p.exists():
            continue
        cfg = json.loads(cfg_p.read_text(encoding="utf-8"))
        if a.mode == "cards":
            src = cfg_p.parent / cfg["output"]
            if not src.exists():
                continue
            im = Image.open(src).convert("RGB").resize((TW, TH), Image.LANCZOS)
            label(im, f"{d}  {cfg['hero'].upper()}  {cfg.get('pos', '')}", font)
        else:
            src = (cfg_p.parent / cfg["image"]).resolve()
            full = Image.new("RGB", (1920, 1080), "black")
            art = Image.open(src).convert("RGB")
            a_ = cfg["art"]
            art = art.resize((a_["width"], round(a_["width"] * art.height / art.width)), Image.LANCZOS)
            full.paste(art, (a_["left"], a_["top"]))
            x0, y0, x1, y1 = ZONES[cfg.get("pos", "bottom-left")]
            ov = ImageDraw.Draw(full)
            for k in range(4):
                ov.rectangle((x0 + k, y0 + k, x1 - k, y1 - k), outline=(226, 54, 54))
            im = full.resize((TW, TH), Image.LANCZOS)
            label(im, f"{d}  {cfg['hero'].upper()}  {cfg.get('pos', 'bottom-left')}", font)
        items.append(im)
    sheets(items, out, a.mode)


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
