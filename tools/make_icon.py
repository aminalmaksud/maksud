"""Draws the app icon (1024x1024 PNG): a waveform with word-timing brackets."""
import math
import sys

from PIL import Image, ImageDraw, ImageFilter

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
# macOS icon grid: 824px rounded square centred, soft shadow
shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((100, 112, 924, 936), 185, fill=(0, 0, 0, 110))
img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))

grad = Image.new("RGBA", (S, S))
gd = ImageDraw.Draw(grad)
top, bot = (20, 132, 255), (101, 46, 214)
for y in range(S):
    t = y / S
    gd.line([(0, y), (S, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bot)) + (255,))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((100, 100, 924, 924), 185, fill=255)
img.paste(grad, (0, 0), mask)

d = ImageDraw.Draw(img)
# waveform bars, grouped into three "words"
cx, cy = 512, 470
groups = [(-280, 6), (-80, 8), (170, 5)]
for gx, n in groups:
    for i in range(n):
        x = cx + gx + i * 26
        h = 40 + 150 * abs(math.sin(i * 1.3 + gx)) * (1 - abs(i - n / 2) / n)
        d.rounded_rectangle((x - 8, cy - h, x + 8, cy + h), 8, fill=(255, 255, 255, 255))
# timing brackets under each word
for gx, n in groups:
    x0, x1 = cx + gx - 14, cx + gx + (n - 1) * 26 + 14
    y = 720
    d.rounded_rectangle((x0, y, x1, y + 14), 7, fill=(255, 255, 255, 215))
    for xx in (x0, x1 - 14):
        d.rounded_rectangle((xx, y - 34, xx + 14, y + 14), 7, fill=(255, 255, 255, 215))
img.save(sys.argv[1] if len(sys.argv) > 1 else "icon.png")
