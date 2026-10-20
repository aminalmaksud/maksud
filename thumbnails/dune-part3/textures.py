import numpy as np
from PIL import Image, ImageFilter

rng = np.random.default_rng(7)

def sand_fill(w, h, top, mid, bot, path):
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(0, 1, w)[None, :]
    def lerp(a, b, t): return a + (b - a) * t
    top, mid, bot = (np.array(c, float) for c in (top, mid, bot))
    t = np.clip(y * 2, 0, 1)[..., None]
    t2 = np.clip(y * 2 - 1, 0, 1)[..., None]
    base = np.where(y[..., None] < .5, lerp(top, mid, t), lerp(mid, bot, t2))
    base = np.broadcast_to(base, (h, w, 3)).copy()
    # wind ripples
    rip = np.sin((x * 38 + y * 9 + np.sin(y * 20) * .4) * np.pi) * 0.5 + 0.5
    base *= (0.9 + 0.12 * rip)[..., None]
    # coarse blotches
    blot = Image.fromarray((rng.random((h // 16, w // 16)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    base *= (0.85 + 0.25 * np.asarray(blot) / 255)[..., None]
    # fine grain
    g = rng.normal(0, 1, (h, w))
    base += (g * 22)[..., None]
    # dark and bright speckles
    sp = rng.random((h, w))
    base[sp < .025] *= .45
    base[sp > .985] = base[sp > .985] * .3 + 255 * .7
    Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).save(path)

sand_fill(1400, 300, (255, 233, 190), (232, 168, 92), (150, 78, 30), 'sand_title.png')
sand_fill(1400, 200, (255, 244, 220), (240, 200, 140), (196, 128, 62), 'sand_bn.png')

# blowing sand overlay (transparent)
W, H = 1280, 720
ov = np.zeros((H, W, 4), float)
n = 5000
xs, ys = rng.integers(0, W, n), rng.integers(0, H, n)
for x, y in zip(xs, ys):
    r = rng.random()
    c = (230, 170, 100) if r < .7 else (255, 225, 180)
    a = rng.uniform(.25, .9)
    L = 1 if rng.random() < .8 else rng.integers(2, 7)
    for k in range(L):
        xx, yy = x + k, y + k // 3
        if 0 <= xx < W and 0 <= yy < H:
            ov[yy, xx] = (*c, a * 255 * (1 - k / (L + 1)))
img = Image.fromarray(ov.astype(np.uint8), 'RGBA')
# soft wind streaks
streak = np.zeros((H, W), float)
for _ in range(60):
    y0 = rng.integers(0, H); x0 = rng.integers(-200, W)
    ln = rng.integers(150, 600); th = rng.integers(2, 10)
    streak[y0:y0 + th, max(0, x0):max(0, x0 + ln)] = rng.uniform(.05, .18)
s = Image.fromarray((streak * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))
sa = np.asarray(s)
sl = np.zeros((H, W, 4), np.uint8); sl[..., 0] = 225; sl[..., 1] = 160; sl[..., 2] = 95; sl[..., 3] = sa
out = Image.alpha_composite(Image.fromarray(sl, 'RGBA'), img)
out.save('sand_overlay.png')
