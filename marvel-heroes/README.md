# Marvel Heroes: 100-day post image series

One 1920x1080 (16:9) post card per day. Day 1 is `posts/day-001-spider-man.webp`; the opening post is `posts/day-000-opening.webp`. Cards are saved as lossless WebP (no quality loss).
Every later day reuses the same template, so only a small JSON file and the art change.

## Making a new day (instructions for whoever builds days 2 to 100)

1. Put the day's art in `images/` as `day-NNN-hero-name.<ext>`. Generate it 16:9: end the Midjourney
   prompt with `--ar 16:9` (not the `--ar 1:1` the older series used).
2. Copy `posts/day-001.json` to `posts/day-NNN.json` and edit it:

   | Field | Meaning | Example |
   |---|---|---|
   | `day` | Day number (Latin digits) | `2` |
   | `total` | Series length, always `100` | `100` |
   | `arc` | Arc number | `1` |
   | `arcName` | Arc name, English, no dashes | `"Avengers core"` |
   | `hero` | Hero name, English, as it should read (rendered in caps) | `"Iron Man"` |
   | `tagline` | Bangla sub-line from the image heading | `"..."` |
   | `image` | Path to the art, relative to the JSON file | `"../images/day-002-iron-man.png"` |
   | `pos` | Where the title block sits: `bottom-left` (default), `bottom-right`, `top-left`, `top-right`, `middle`, `bottom` | `"bottom-left"` |
   | `dayLabel` | Optional. Replaces the right badge text (used for the opening post: `"Opening"`). Leave out on normal days | `"Opening"` |
   | `art` | Art placement on the 1920x1080 canvas | see below |
   | `output` | File name, written next to the JSON. Use `.webp` (lossless); `.png` also works | `"day-002-iron-man.webp"` |

3. Render: `node marvel-heroes/template/render.js marvel-heroes/posts/day-NNN.json`
   (lossless WebP of detailed art takes about 40 seconds; run it in the background if your
   shell has a short timeout. For quick position tests, use a `.png` output name.)
4. Open the PNG and check it (checklist below).

### Art placement (`art`)

The art must cover the full 1920x1080 canvas.

- Exact 16:9 art: `{ "width": 1920, "left": 0, "top": 0 }`.
- Near 16:9 art: scale to cover, then centre. Day 1 (2000x1120) uses
  `{ "width": 1929, "left": -4, "top": 0 }`. Formula: `width = max(1920, 1080 * w / h)`,
  `left = (1920 - width) / 2`, and `top = (1080 - width * h / w) / 2` (0 or negative).
- Square art also works if needed: `{ "width": 1920, "left": 0, "top": -420 }` (shift `top`
  to keep the face in frame).
- Optional `scrimHeight` (default 520) makes the dark fade at the bottom taller or shorter.
  Keep the hero's face above the fade and out of the lower-left text block.

### Title position (`pos`)

The title block (hero name, rule, Bangla line) must never cover the hero's face or mouth.
Pick the position that keeps the face clear:

| `pos` | Title block | Links block | Good when |
|---|---|---|---|
| `bottom-left` | bottom, left | bottom-right | Default. Face in the upper or centre area. Used for Days 1 to 5 and the opening |
| `bottom-right` | bottom, right-aligned | moves to bottom-left | Subject sits low-left, face upper-left |
| `bottom` | bottom, centred | centred under the title | Face upper-centre, wide empty bottom |
| `top-left` | below the badges, left | bottom-right | Face low or on the right |
| `top-right` | below the badges, right-aligned | bottom-right | Face low or on the left |
| `middle` | centred, on a dark band | bottom-right | Face in the top third and the body below is empty |

The top and middle positions darken the art behind the title, so only use them when the face
is somewhere else. Render once and look: the face and mouth must be fully visible.
Long Bangla lines shrink first, then wrap onto two lines (the opening post does this).

## Image heading rules

The image heading from each post is written as `MAIN / sub-line`. On the card:

- **MAIN** = the hero name in English (`hero`). Comic Book Bold Italic, all caps, hero red
  `#E23636`, black stroke and hard 10 px offset shadow. Long names shrink automatically.
- **sub-line** = the Bangla line (`tagline`). Dabanol, comic paper `#F5F3EE`, on a night navy
  `#1B2A4A` caption box with a halftone-yellow left bar.
- Top-left badge: `ARC N` (yellow) + arc name. Top-right badge: `DAY N OF 100` (red).
- Bottom-right, stacked: `Musings of মাকসুদ`, then `www.musingsofmaksud.com` (globe icon),
  then `https://www.youtube.com/@MusingsofMaksud` (play icon). These are fixed in
  `template/post.html` (`SITE`, `YOUTUBE`); do not change them per day.
- No em dashes or en dashes anywhere on the card. Proper nouns stay in English.
- Rotate the shape of the Bangla sub-line from day to day (a fact, a quote, a single noun,
  a question). At most one mirrored "[A]-এর X, [B]-এর Y" line per batch of four.

## Palette and fonts (Marvel "Comic ink" style)

| Role | Hex | Used for |
|---|---|---|
| bg | `#0B0B0D` | background, strokes, hard shadows, frame |
| surface | `#1B2A4A` | Bangla caption box |
| title | `#E23636` | hero name, day badge |
| accent | `#F7C948` | arc badge, rule, inner frame, halftone dots |
| text | `#F5F3EE` | Bangla sub-line, signature |

Fonts live in `template/fonts/`: Comic Book Bold Italic (hero name), Comic Book Bold (badges),
Dabanol (Bangla), Barlow Bold (links). Do not add colours outside this table.

## Check before delivering

- The render prints no "fonts failed to load" warning.
- Bangla conjuncts are shaped (zoom in on words like প্রায়শ্চিত্ত, ক্ষ, ন্ত্র).
- The hero's face is clear of the badges and the bottom fade.
- At 320x180 the hero name still reads.
- No dashes, no off-palette colours, no Marvel logo or wordmark on the card.
