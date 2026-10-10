# Batch posts

Makes finished 1920x1080 WebP posts (under 200 KB) from a spreadsheet and a folder of
paintings, in the same design as `middle-earth-history/post-000`.

## What you provide

Make a folder `batches/<name>/` (for example `batches/posts-001-100/`) with:

- `images/`: the paintings, any common format (PNG, JPG, WebP), ideally 16:9.
- `posts.csv`: one row per post, saved as UTF-8 (Google Sheets: File > Download > CSV).
  Start from `post-batch/posts-template.csv`.

| Column | Required | Example |
|---|---|---|
| `post` | yes | `1` (shown as "Post 1 of 220") |
| `english_title` | yes | `The Music of the Ainur` |
| `bangla_subtitle` | yes | `গানের ভেতর দিয়ে জগতের জন্ম` |
| `image` | yes | `post-001.png` (file name inside `images/`) |
| `english_kicker` | no | Small line above the title. Left empty, a long title is split at "of" when that gives a short main line, like "The Complete History of / Middle-earth". |
| `position` | no | `left`, `middle` or `right` to fix the title position yourself. Left empty, it is chosen for you. |

Then ask Claude: "Run the post batch in `batches/<name>`".

## What happens

1. **Choice sheets** (script, no AI): for every post, a sheet showing the bare painting
   with the three title areas outlined, plus the post with the title at top-left,
   top-middle and top-right. The script also scores how busy each area is.
2. **Position** (Sonnet): `post-placement` reviewers look at each sheet once and choose the
   position that hides nothing important (figures, ships, cities, the main light, the
   focal subject). Several run in parallel, 10 posts each.
3. **Final posts** (script, no AI): 1920x1080 WebP at the highest quality under 200 KB.

## What you get, in `batches/<name>/out/`

- `post-NNN-<title>.webp`: the finished posts.
- `review/review-NN.webp`: 20 posts per page to scan. Posts outlined in red with
  **CHECK** need a look.
- `report.csv`: position, who chose it (you, reviewer or auto), WebP quality, file size,
  flags and the reviewer's note.

A post is flagged when its title is still more than two lines at the smallest size, when
the chosen area is much busier than the quietest one, or when the WebP quality had to drop
below 60 to fit 200 KB.

To change a post, put `left`, `middle` or `right` in its `position` column (or shorten its
title) and run the final step again: it takes seconds and needs no AI.

## Running the scripts yourself

```
python3 post-batch/batch.py candidates --csv batches/<name>/posts.csv --images batches/<name>/images --out batches/<name>/out
python3 post-batch/batch.py final      --csv batches/<name>/posts.csv --images batches/<name>/images --out batches/<name>/out
```

Needs Python with Pillow and NumPy, Node with Playwright, and the fonts from the
universe-style-system skill (found automatically, or set `UNIVERSE_FONTS` to its
`assets/fonts` folder). `--total` changes the "of 220" in the badge.
