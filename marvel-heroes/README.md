# Marvel Heroes: 100-day post image series

One 1080x1080 post card per day. Day 1 is `posts/day-001-spider-man.png`.
Every later day reuses the same template, so only a small JSON file and the art change.

## Making a new day (instructions for whoever builds days 2 to 100)

1. Put the day's art in `images/` as `day-NNN-hero-name.<ext>` (Midjourney output, `--ar 1:1`).
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
   | `art` | Art placement on the 1080 canvas | see below |
   | `output` | PNG file name, written next to the JSON | `"day-002-iron-man.png"` |

3. Render: `node marvel-heroes/template/render.js marvel-heroes/posts/day-NNN.json`
4. Open the PNG and check it (checklist below).

### Art placement (`art`)

- Square 1:1 art (the normal case): `{ "width": 1080, "left": 0, "top": 0 }`.
- Wide art (like Day 1, 2000x1120): scale it so the whole figure fits across 1080 and
  centre the figure. Day 1 uses `{ "width": 1440, "left": -180, "top": 0 }`.
- Optional `scrimHeight` (default 560) makes the dark fade at the bottom taller or shorter.
  Keep the hero's face above the fade.

## Image heading rules

The image heading from each post is written as `MAIN / sub-line`. On the card:

- **MAIN** = the hero name in English (`hero`). Comic Book Bold Italic, all caps, hero red
  `#E23636`, black stroke and hard 9 px offset shadow. Long names shrink automatically.
- **sub-line** = the Bangla line (`tagline`). Dabanol, comic paper `#F5F3EE`, on a night navy
  `#1B2A4A` caption box with a halftone-yellow left bar.
- Top-left badge: `ARC N` (yellow) + arc name. Top-right badge: `DAY N OF 100` (red).
- Bottom-right: `Musings of মাকসুদ` signature.
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
Dabanol (Bangla). Do not add colours outside this table.

## Check before delivering

- The render prints no "fonts not loaded" warning.
- Bangla conjuncts are shaped (zoom in on words like প্রায়শ্চিত্ত, ক্ষ, ন্ত্র).
- The hero's face is clear of the badges and the bottom fade.
- At 168x168 the hero name still reads.
- No dashes, no off-palette colours, no Marvel logo or wordmark on the card.
