#!/usr/bin/env python3
"""Zip a built pack into parts that stay under a size limit (default 28 MB) for chat upload.
usage: zip_parts.py <pack_dir> [limit_mb]
Groups: layouts | follow bar + lines + icons | one group per series tag folder. A group that is
too big is split greedily by file into numbered parts. README and previews ride along in part 1."""
import os, sys, zipfile
pack = os.path.abspath(sys.argv[1]); limit = float(sys.argv[2] if len(sys.argv) > 2 else 28) * 1024 * 1024
base = os.path.dirname(pack); name = os.path.basename(pack)
def files(*rels):
    out = []
    for r in rels:
        p = os.path.join(pack, r)
        if os.path.isfile(p): out.append(p)
        for root, _, fs in os.walk(p):
            for f in sorted(fs): out.append(os.path.join(root, f))
    return out
groups = [("1_Layouts", files("README.txt", "00_PREVIEW", "01_Layouts")),
          ("2_FollowBar_Lines_Icons", files("README.txt", "03_Follow_Bar", "04_Lines_and_Ornaments", "05_Social_Icons"))]
tags = os.path.join(pack, "02_Series_Tags")
if os.path.isdir(tags):
    for s in sorted(os.listdir(tags)): groups.append((f"3_Tags_{s}", files(os.path.join("02_Series_Tags", s))))
made = []
for label, fl in groups:
    parts, cur, size = [], [], 0
    for f in fl:
        sz = os.path.getsize(f)
        if cur and size + sz > limit: parts.append(cur); cur, size = [], 0
        cur.append(f); size += sz
    if cur: parts.append(cur)
    for i, part in enumerate(parts, 1):
        zn = os.path.join(base, f"{name}_{label}" + (f"_part{i}" if len(parts) > 1 else "") + ".zip")
        with zipfile.ZipFile(zn, "w", zipfile.ZIP_DEFLATED) as z:
            for f in part: z.write(f, os.path.join(name, os.path.relpath(f, pack)))
        made.append((zn, os.path.getsize(zn)))
for zn, sz in made: print(f"{sz/1048576:6.1f} MB  {zn}")
