#!/usr/bin/env python3
"""Render every post that has a config but no finished card yet, several at a time.

  python3 -I marvel-heroes/tools/render_all.py              # missing or out-of-date cards only
  python3 -I marvel-heroes/tools/render_all.py --force      # everything
  python3 -I marvel-heroes/tools/render_all.py --days 11-20 # a range, or a list like 11,14,30
  python3 -I marvel-heroes/tools/render_all.py --jobs 4

A card counts as out of date when its config, the template or the colour picker is newer than it.
Lossless WebP of detailed art takes about 40 seconds per card, so 90 cards take roughly
15 to 20 minutes with 4 jobs. Run it in the background and read the log.
"""
import argparse, json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def parse_days(s):
    out = set()
    for part in s.split(","):
        if "-" in part:
            a, b = part.split("-")
            out |= set(range(int(a), int(b) + 1))
        elif part.strip():
            out.add(int(part))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--days")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    a = ap.parse_args()
    root = Path(a.root)
    tpl = [root / "template" / n for n in ("post.html", "render.js", "pick_color.py")]
    tpl_time = max(p.stat().st_mtime for p in tpl)
    want = parse_days(a.days) if a.days else None

    todo = []
    for cfg in sorted((root / "posts").glob("day-*.json")):
        d = int(cfg.stem.split("-")[1])
        if want is not None and d not in want:
            continue
        out = cfg.parent / json.loads(cfg.read_text(encoding="utf-8"))["output"]
        stale = not out.exists() or out.stat().st_size == 0 or out.stat().st_mtime < max(cfg.stat().st_mtime, tpl_time)
        if a.force or stale:
            todo.append(cfg)
    print(f"{len(todo)} cards to render with {a.jobs} jobs", flush=True)
    t0, failed = time.time(), []

    def run(cfg):
        r = subprocess.run(["node", str(root / "template" / "render.js"), str(cfg)], capture_output=True, text=True)
        ok = r.returncode == 0 and "Saved" in r.stdout
        warn = [l for l in (r.stdout + r.stderr).splitlines() if "WARNING" in l]
        print(f"{'ok  ' if ok else 'FAIL'} {cfg.stem} {' '.join(warn)}", flush=True)
        if not ok:
            failed.append(cfg.stem)
            print((r.stderr or r.stdout)[-400:], flush=True)

    with ThreadPoolExecutor(a.jobs) as ex:
        list(ex.map(run, todo))
    print(f"done in {time.time() - t0:.0f}s, {len(todo) - len(failed)} rendered, {len(failed)} failed", flush=True)
    for p in (root / "posts").glob("*.tmp.png"):
        p.unlink()
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
