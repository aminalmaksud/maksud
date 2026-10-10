Paste everything below the line into the new Claude Code session.

---

You are taking over a 100-day Marvel Heroes image series for my Facebook/YouTube channel "Musings of মাকসুদ". Each day is one 16:9 post card (1920x1080, lossless WebP). The card system is already built. Your job is to set it up here, then make one card per day when I give you the art and heading.

## 1. Set up

The system lives in the GitHub repo `aminalmaksud/maksud`, branch `claude/funny-turing-kit5gw`, in the folder `marvel-heroes/`. Get that folder into this project (clone the branch, or add the repo and copy the folder). If you cannot reach the repo, stop and tell me; do not rebuild the design from memory.

The folder contains:
- `README.md`: the full rules. Read it first and follow it.
- `template/post.html`: the card design (HTML/CSS, filled from a JSON file).
- `template/render.js`: renders the card with Playwright/Chromium and saves lossless WebP. It also picks the hero-name colour (see section 3).
- `template/pick_color.py`: the colour picker that `render.js` calls.
- `template/assets/mh-badge.png`: the MH starburst, without its number.
- `template/fonts/`: Comic Book Bold Italic, Comic Book Bold, Dabanol. All fonts are bundled, so nothing else is needed.
- `posts/day-001.json` and `posts/day-001-spider-man.webp`: the finished Day 1 example. Use it as the reference for how every card must look.
- `images/`: the source art.

Requirements: Node with Playwright and Chromium, and Python 3 with Pillow and NumPy (WebP and the colour picker). `render.js` loads Playwright from `/opt/node22/lib/node_modules/playwright`; if it lives elsewhere, set the `PLAYWRIGHT` environment variable to its path. Do not run `playwright install` if a Chromium is already present.

Check the setup by running `node marvel-heroes/template/render.js marvel-heroes/posts/day-001.json` and confirming the output matches the Day 1 card (1920x1080, MH 1 sticker after the hero name, signature block bottom-right, no "fonts failed to load" warning).

## 2. Making each day

I will send, for each day: the 16:9 art (Midjourney, `--ar 16:9`), the hero name, the Bangla sub-line, the arc number and arc name, and the day number.

1. Save the art to `marvel-heroes/images/day-NNN-hero-name.<ext>` (NNN is three digits).
2. Copy `posts/day-001.json` to `posts/day-NNN.json` and edit only: `day`, `arc`, `arcName`, `hero`, `tagline`, `image`, `art`, `output`. Keep `total` at 100. Set `output` to `day-NNN-hero-name.webp`.
3. Set `art` so the art covers the whole 1920x1080 canvas (exact 16:9 art is `{ "width": 1920, "left": 0, "top": 0 }`; the README has the formulas for other sizes). Set `pos` to where the title block goes: `bottom-left` (default), `bottom-right`, `bottom`, `top-left`, `top-right` or `middle`. The title block must never cover the hero's face or mouth, so look at the art and pick the position that keeps the face clear; the README has a table of what each position is good for. Only the opening post uses `dayLabel` (it replaces the "Day N of 100" badge). The MH badge number follows `day` automatically, so the opening (day 0) shows MH 0.
4. Render: `node marvel-heroes/template/render.js marvel-heroes/posts/day-NNN.json`
5. Open the result and check it (see section 4). Fix and re-render until it passes. Lossless WebP of detailed art takes about 40 seconds, so run the render in the background if your shell times out. Use a `.png` output name for quick position tests.
6. Show me the finished image. Commit and push only when I ask.

For many days at once (the rest of the series), use the bulk tools described in the README section "Doing many days at once": `headings.txt`, `inbox/`, `tools/prepare.py`, `tools/sheet.py`, `tools/render_all.py`.

Never edit `post.html` or `render.js` for a single day. If you think the template itself needs a change, tell me first, because every day must look the same.

## 3. What the card looks like (do not change)

- Size 1920x1080, saved as lossless WebP (pixel-identical to the PNG render).
- Style: Marvel "comic ink". Colours only from this list: bg `#0B0B0D`, surface `#1B2A4A`, title red `#E23636`, accent yellow `#F7C948`, text `#F5F3EE`. Nothing off-palette.
- Top-left badge: `ARC N` (yellow) plus the arc name. Top-right badge: `DAY N OF 100` (red).
- Default position, lower-left (see `pos`): the hero name in English (Comic Book Bold Italic, all caps, black stroke and hard offset shadow), a short yellow rule, then the Bangla sub-line (Dabanol, on a navy box with a yellow left bar).
- Hero-name colour changes with the background. `render.js` picks red, yellow or paper white from the artwork's colour (rules are in `pick_color.py` and the README). Do not hard-code a colour unless I ask; if I do, set `heroColor` in the post's JSON to one of `#E23636`, `#F7C948`, `#F5F3EE`.
- Bottom-right, stacked: `Musings of মাকসুদ`, `www.musingsofmaksud.com`, `https://www.youtube.com/@MusingsofMaksud`. These are fixed in the template and must stay identical on every day. There is no footer bar; do not add one.
- The MH starburst badge is stuck to the end of the hero name like a comic sticker (tilted slightly). It shows the post number (`MH 0` for the opening, then `MH 1`, `MH 2` and so on) and follows `day` automatically.
- Art is full-bleed, fading into black at the bottom, with a thin yellow inner frame.

## 4. Check before showing me

- The render prints no "fonts failed to load" warning.
- Zoom in on the Bangla line. Joined letters must be shaped correctly (for example প্রায়শ্চিত্ত, ক্ষ, ন্ত্র).
- The hero name, the MH badge and the Bangla line do not touch the signature block, and nothing is cut off.
- The MH number matches the day.
- The hero-name colour reads clearly against the art behind it.
- The hero's face is not covered by a badge, the title block, the MH sticker or the bottom fade.
- At roughly 320x180 the hero name still reads.
- No em dashes or en dashes anywhere on the card. Proper nouns stay in English. No Marvel logo or wordmark.
- File is 1920x1080 and ends in `.webp`.

## 5. Text rules for the heading

- Heading format is `HERO NAME / Bangla sub-line`. The hero name is English; the sub-line is Bangla.
- Do not rewrite my Bangla sub-line unless I ask. If it looks too long (the template shrinks it, but very long lines get small), tell me instead of cutting it.
- When I ask you to suggest sub-lines: vary the shape from day to day (a fact, a short quote, a single noun, a question). Use a mirrored "[A]-এর X, [B]-এর Y" pattern at most once per batch of four. No dashes of any kind.

Start with section 1 and tell me when the Day 1 check passes. Then wait for Day 2.
