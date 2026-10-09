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
   | `heroColor` | Optional. Forces the hero-name colour (`#E23636`, `#F7C948` or `#F5F3EE`); leave out to let the picker choose | `"#F5F3EE"` |
   | `mh` | Optional. Overrides the number on the MH badge; leave out and it follows `day` | `7` |
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

| `pos` | Title block | MH badge | Good when |
|---|---|---|---|
| `bottom-left` | bottom, left | bottom-right | Default. Face in the upper or centre area. Used for Days 1 to 5 and the opening |
| `bottom-right` | bottom, right-aligned | moves to bottom-left | Subject sits low-left, face upper-left |
| `bottom` | bottom, centred (kept narrow to clear the badge) | bottom-right | Face upper-centre, wide empty bottom |
| `top-left` | below the badges, left | bottom-right | Face low or on the right |
| `top-right` | below the badges, right-aligned | bottom-right | Face low or on the left |
| `middle` | centred, on a dark band | bottom-right | Face in the top third and the body below is empty |

The top and middle positions darken the art behind the title, so only use them when the face
is somewhere else. Render once and look: the face and mouth must be fully visible.
Long Bangla lines shrink first, then wrap onto two lines (the opening post does this).

### Hero-name colour

The hero name changes colour so it contrasts with the art behind it. `render.js` samples the area
behind the name and `template/pick_color.py` picks one of three palette colours from the art's
dominant hue:

| Art behind the name | Colour | Why |
|---|---|---|
| Cool: green, teal, blue, purple | red `#E23636` | red clashes with nothing there |
| Red or pink | yellow `#F7C948` | red on red would vanish |
| Warm and dark: orange, brown | yellow `#F7C948` | glows against the dark |
| Warm and light: orange, brown | paper white `#F5F3EE` | pops against the tan |
| Gold, amber, olive | red `#E23636` | distinct from gold |
| Almost no colour | yellow on dark, red on light | |

A pick under 3:1 contrast against the real background is swapped for the best-contrasting colour.
To force a colour, set `"heroColor": "#F5F3EE"` (any of the three) in the post's JSON.
`MH_DEBUG=1 node ...render.js ...` prints what the picker measured.

### Bottom bar and MH badge

- The yellow follow bar (`template/assets/follow-bar.webp`) closes the bottom 150 px of every card:
  FOLLOW, YouTube, Instagram and Facebook icons, `WWW.MUSINGSOFMAKSUD.COM`, `@MUSINGSOFMAKSUD`.
  It is fixed. The website text is set in `template/post.html` (`SITE`). The bar replaces the old
  signature and link text.
- The MH badge (`template/assets/mh-badge.png`, "MH" in the art, number drawn on top) sits bottom-right
  just above the bar and shows the post number: `MH 0` for the opening, then `MH 1`, `MH 2` and so on.
  It follows `day`; set `"mh"` in the JSON only to override. With `pos: "bottom-right"` it moves to the bottom-left.
- The title block now sits above the bar, about 150 px higher than before the bar existed. Check faces.

## Image heading rules

The image heading from each post is written as `MAIN / sub-line`. On the card:

- **MAIN** = the hero name in English (`hero`). Comic Book Bold Italic, all caps, hero red
  black stroke and hard 10 px offset shadow, colour picked from the background (see above).
  Long names shrink automatically.
- **sub-line** = the Bangla line (`tagline`). Dabanol, comic paper `#F5F3EE`, on a night navy
  `#1B2A4A` caption box with a halftone-yellow left bar.
- Top-left badge: `ARC N` (yellow) + arc name. Top-right badge: `DAY N OF 100` (red).
- Bottom: the follow bar and the MH badge (see above). Do not change them per day.
- No em dashes or en dashes anywhere on the card. Proper nouns stay in English.
- Rotate the shape of the Bangla sub-line from day to day (a fact, a quote, a single noun,
  a question). At most one mirrored "[A]-এর X, [B]-এর Y" line per batch of four.

## Palette and fonts (Marvel "Comic ink" style)

| Role | Hex | Used for |
|---|---|---|
| bg | `#0B0B0D` | background, strokes, hard shadows, frame |
| surface | `#1B2A4A` | Bangla caption box |
| title | `#E23636` | day badge; one of the three hero-name colours |
| accent | `#F7C948` | arc badge, rule, inner frame, halftone dots; one of the three hero-name colours |
| text | `#F5F3EE` | Bangla sub-line; one of the three hero-name colours |

Fonts live in `template/fonts/`: Comic Book Bold Italic (hero name), Comic Book Bold (badges),
Dabanol (Bangla). The bar and the MH badge are supplied artwork and bring their own blue, cream and black;
do not add other colours.

## Check before delivering

- The render prints no "fonts failed to load" warning.
- Bangla conjuncts are shaped (zoom in on words like প্রায়শ্চিত্ত, ক্ষ, ন্ত্র).
- The hero's face is clear of the badges, the title block and the bottom fade. The MH number matches the day.
- The hero-name colour reads clearly against the art; the website text on the bar has room either side.
- At 320x180 the hero name still reads.
- No dashes, no off-palette colours, no Marvel logo or wordmark on the card.
