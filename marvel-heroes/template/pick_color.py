#!/usr/bin/env python3
"""Pick the hero-name colour that contrasts with the artwork behind it.

Usage: python3 pick_color.py faded_region.png art_region.png
Prints one hex colour from the Marvel palette: red, yellow or paper white.

  faded_region.png  the area behind the hero name as it really looks (dark fade included)
  art_region.png    the same area with the fades hidden: the artwork's own colour

The artwork's dominant hue (weighted by saturation and brightness) picks the family:

  cool scene   green, teal, blue, purple (70 to 300 deg)        -> red     (red clashes with nothing here)
  red scene    red, pink (340 to 12 deg)                        -> yellow  (red on red would vanish)
  warm, dark   orange, brown (12 to 35 deg), mean lum < .06     -> yellow  (glows against the dark)
  warm, light  orange, brown (12 to 35 deg), mean lum >= .06    -> paper white (pops against the tan)
  gold scene   amber, olive, gold (35 to 70 deg)                -> red     (distinct from gold)
  neutral      almost no colour                                 -> yellow on dark, red on light

A colour that falls under 3:1 median contrast against the faded region is replaced by the
best-contrasting colour of the three (the black outline and hard shadow carry the rest).
"""
import sys
import colorsys
import numpy as np
from PIL import Image

RED, YELLOW, PAPER = "#E23636", "#F7C948", "#F5F3EE"


def lin(c):
    c = c / 255.0
    return np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def luminance(rgb):
    return 0.2126 * lin(rgb[..., 0]) + 0.7152 * lin(rgb[..., 1]) + 0.0722 * lin(rgb[..., 2])


def load(path):
    return np.asarray(Image.open(path).convert("RGB")).reshape(-1, 3)[::3].astype(float)


def hue_stats(px):
    hsv = np.array([colorsys.rgb_to_hsv(*(p / 255.0)) for p in px])
    w = hsv[:, 1] * hsv[:, 2]  # grey and near-black pixels count for little
    ang = hsv[:, 0] * 2 * np.pi
    hue = (np.arctan2((np.sin(ang) * w).sum(), (np.cos(ang) * w).sum()) / (2 * np.pi)) % 1.0
    return hue * 360.0, float(w.mean())


def median_contrast(hexv, lum):
    c = np.array([int(hexv[i:i + 2], 16) for i in (1, 3, 5)], float)
    lc = float(luminance(c))
    return float(np.median((np.maximum(lum, lc) + 0.05) / (np.minimum(lum, lc) + 0.05)))


def family(hue, chroma, mean_lum):
    if chroma < 0.07:
        return "neutral", YELLOW if mean_lum < 0.2 else RED
    if 70 <= hue < 300:
        return "cool", RED
    if hue >= 340 or hue < 12:
        return "red", YELLOW
    if hue < 35:
        return ("warm dark", YELLOW) if mean_lum < 0.06 else ("warm light", PAPER)
    if hue < 70:
        return "gold", RED
    return "other", PAPER  # 300 to 340 deg, magenta and pink-purple: white is safe


def main(faded_path, art_path):
    faded, art = load(faded_path), load(art_path)
    hue, chroma = hue_stats(art)
    mean_lum = float(luminance(art).mean())
    name, pick = family(hue, chroma, mean_lum)
    lum = luminance(faded)
    contrasts = {c: median_contrast(c, lum) for c in (RED, YELLOW, PAPER)}
    print(f"art hue={hue:.0f}deg chroma={chroma:.3f} mean_lum={mean_lum:.3f} family={name} "
          f"pick={pick} contrast={contrasts[pick]:.2f}", file=sys.stderr)
    if contrasts[pick] < 3.0:
        pick = max(contrasts, key=contrasts.get)
        print(f"  contrast too low, using {pick}", file=sys.stderr)
    print(pick)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
