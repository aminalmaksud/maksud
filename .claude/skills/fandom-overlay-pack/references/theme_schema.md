# theme.json

`scripts/build.js` reads one theme file. Paths inside it are relative to the theme file
(fonts you downloaded) or to the skill folder (the bundled Bangla font).

```json
{
  "slug": "GreekMythology",
  "title": "Greek Mythology",
  "look": "epic",
  "family": "epic",
  "count": 100,
  "handle": "@MusingsofMaksud",
  "handleCase": "asis",
  "followText": "FOLLOW",
  "tagFooter": "MUSINGS OF MAKSUD",
  "motifs": ["meander", "leaves"],
  "colors": { "ink": "#0E0B09", "paper": "#F3E9D2", "metal": "#D4AF37", "hi": "#E8C766", "muted": "#B3A281" },
  "fonts": {
    "display": { "family": "Cinzel Decorative", "weight": 700, "file": "fonts/display.ttf" },
    "numbers": { "family": "Playfair Display", "weight": 900, "file": "fonts/numbers.ttf" },
    "handle":  { "family": "Cormorant Garamond", "weight": 700, "file": "fonts/handle.ttf" },
    "bangla":  { "family": "Somoyer Srot", "file": "assets/fonts/Somoyer_Srot_Unicode.ttf" }
  },
  "series": [
    { "code": "GG", "name": "GREEK GODS", "folder": "Greek_Gods", "accent": "#3E7CB1", "accentName": "gods_blue" }
  ],
  "sample": { "en1": "GREEK GODS", "en2": "ZEUS", "bn": "অলিম্পাসের বজ্রধারী রাজা" },
  "previewImage": "sample.png"
}
```

| Field | Meaning |
|---|---|
| `slug` | Used in the pack and zip names: `MusingsOfMaksud_<slug>_Overlay_Pack_16x9`. No spaces. |
| `look` | `comic`, `epic`, `scifi`, `manuscript`, or a path to a custom look plugin (for example `"egyptian.js"`, relative to theme.json). See look_plugins.md. |
| `family` | Text treatment: `comic` (outlined lettering with an offset shadow) or `epic` (clean text with a soft shadow). The `comic` look implies `comic`; every other look normally uses `epic`. |
| `count` | Tags are numbered 1..count for every series. Use the number of posts the user plans. |
| `handle`, `handleCase` | The follow-bar handle. `upper` uppercases it and colour-splits the words; use it when the handle font has no lowercase. |
| `followText`, `tagFooter` | Words on the bar and around the round tags. Defaults shown. |
| `motifs` | First entry is used inside the layouts; all of them are exported as lines. Options: `meander`, `waves`, `runes`, `leaves`, `lightning`, `stars`, `hud`, `zigzag`, `dots`. |
| `colors` | `ink` dark (and ink-on-parchment text), `paper` light text and panels, `metal` frames or glow lines, `hi` highlight, `muted` small labels. The manuscript look also reads `parchment`, `parchmentEdge` and `accentInk`. |
| `fonts.*` | `display` = English titles, codes and ring text. `numbers` = tag numbers. `handle` = the @handle. `bangla` defaults to the bundled Somoyer Srot. `file` may be TTF, OTF, WOFF or WOFF2. |
| `series[]` | `code` (DCV), `name` (shown on round tags), `folder` (output folder name), `accent` colour, optional `accentName` (used in file names such as `FULL_OVERLAY_villains_red.png`). |
| `sample` | Example text for the approval preview: `en1` eyebrow, `en2` title, `bn` Bangla line. |
| `previewImage` | Optional. One of the user's Midjourney images to place behind the preview. |

## What the full build makes
- `00_PREVIEW/`: LAYOUTS_SHEET_sample.png, LAYOUTS_SHEET_guides.png, per-layout samples, tags_sample.png, follow_bars_sample.png
- `01_Layouts/<layout>/{with_follow_bar,no_follow_bar}/`: FULL_OVERLAY (one per series accent where a piece uses the accent), GUIDE_text_zones.png, pieces/
- `02_Series_Tags/<series folder>/<style>/<CODE><n>.png`: 4 styles per look (comic: Badge_round, Burst, Caption_box, Slant_tag; epic: Stamp_round, Wax_seal, Plaque, Cartouche; others below)
- `03_Follow_Bar/`: 4 backgrounds (solid, glass, clear, feature) x 3 icon styles, as full-canvas and strip-only
- `04_Lines_and_Ornaments/` (+ `full_canvas/`): motifs, dividers, rules, accents, effects
- `05_Social_Icons/`: YouTube, Instagram, Facebook in theme, paper, ink and brand colours
- `README.txt`

Layouts per look:
- scifi: A_hologram, B_data_panel_left/right, C_cockpit, D_viewscreen, E_scanline, F_terminal_left/right. Tags: Hex_badge, HUD_ring, Chip, Barcode_label.
- manuscript: A_scroll, B_journal_left/right, C_ribbon, D_map_frame, E_burnt_edges, F_torn_side_left/right. Tags: Wax_seal, Ribbon, Parchment_label, Stamp_round.
- comic = A_cover, B_caption_left/right, C_strip, D_sunburst, E_halftone_edge, F_slash_left/right.
Epic = A_title_card, B_case_file_left/right, C_letterbox, D_framed_plate, E_minimal, F_side_panel_left/right.
