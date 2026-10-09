#!/usr/bin/env python3
"""Export a rendered 1920x1080 PNG as WebP at the highest quality that fits in 200 KB.

Usage:
  node render.js post.html render.png
  python3 export_webp.py render.png out.webp
"""
import io, sys
from PIL import Image

LIMIT = 200_000  # bytes


def encode(im, q):
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=q, method=6)
    return buf.getvalue()


def main(src, out):
    im = Image.open(src).convert("RGB")
    lo, hi, data, q = 1, 100, None, 0
    while lo <= hi:
        m = (lo + hi) // 2
        b = encode(im, m)
        if len(b) <= LIMIT:
            data, q, lo = b, m, m + 1
        else:
            hi = m - 1
    open(out, "wb").write(data)
    print(f"{out}: {im.width}x{im.height}, quality {q}, {len(data)} bytes")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
