import numpy as np
from PIL import Image, ImageFilter, ImageDraw

rng = np.random.default_rng(3)
src = Image.open('badge_src.webp').convert('RGBA')
W, H = src.size

# 1. erase the old lettering with a matching dark plate (in original orientation)
x0, y0, x1, y1 = 745, 302, 1430, 582
pw, ph = x1 - x0, y1 - y0
base = np.zeros((ph, pw, 3), float) + (26, 18, 12)
blot = Image.fromarray((rng.random((ph // 20, pw // 20)) * 255).astype(np.uint8)).resize((pw, ph), Image.BICUBIC)
base *= (0.75 + 0.5 * np.asarray(blot) / 255)[..., None]
base += rng.normal(0, 6, (ph, pw))[..., None]
yy = np.arange(ph)[:, None]; xx = np.arange(pw)[None, :]
# faint sand drift across the lower plate, continuing the dune from the planet
wave = ph * 0.80 + 30 * (xx / pw) ** 1.5 - 14 * np.sin(xx / pw * np.pi)
band = np.clip(1 - np.abs(yy - wave) / (6 + 22 * (1 - xx / pw)), 0, 1) * (1 - xx / pw) ** 0.7
grain = rng.random((ph, pw))
base += (band * (grain > 0.45) * (110 + 90 * grain))[..., None] * np.array([1.0, 0.6, 0.28])
patch = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert('RGBA')
mask = Image.new('L', (pw, ph), 0)
ImageDraw.Draw(mask).rectangle([14, 6, pw - 14, ph - 6], fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(9))
src.paste(patch, (x0, y0), mask)

# 2. flip: planet on the right, point on the left
src = src.transpose(Image.FLIP_LEFT_RIGHT)
src.save('badge.png')
# text box centre (flipped coordinates) for the HTML overlay
print('text box x', W - x1, W - x0, 'y', y0, y1, 'size', W, H)
