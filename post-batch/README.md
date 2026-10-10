# Batch posts

Makes finished 1920x1080 WebP posts (under 200 KB) from a spreadsheet and a folder of
paintings, in the same design as `middle-earth-history/post-000`.

## What you provide

A batch folder is ready at `batches/batch-01/`. Upload on GitHub in your browser
(drag the files in, then press **Commit changes**):

- Images: https://github.com/aminalmaksud/maksud/upload/claude/lotr-history-post-image-slhzfp/batches/batch-01/images
  Name each image with its post number: `1.png`, `post-002.jpg`, `003 Ainur.webp`.
  Up to 100 files and 25 MB per file in one upload.
- `posts.csv`: https://github.com/aminalmaksud/maksud/upload/claude/lotr-history-post-image-slhzfp/batches/batch-01
  Upload a file named exactly `posts.csv` (it replaces the empty one). From Google Sheets:
  File > Download > Comma-separated values, then rename it. Or paste the titles to Claude
  in chat and it will make the file.

`posts.csv` columns (start from `post-batch/posts-template.csv`):

| Column | Required | Example |
|---|---|---|
| `post` | yes | `1` (shown as "Post 1 of 220") |
| `english_title` | yes | `The Music of the Ainur` |
| `bangla_subtitle` | yes | `গানের ভেতর দিয়ে জগতের জন্ম` |
| `image` | no | File name inside `images/`. Left out, the image named with the post number is used. |
| `english_kicker` | no | Small line above the title. Left out, a long title is split at "of" when that gives a short main line, like "The Complete History of / Middle-earth". |
| `position` | no | `left`, `middle` or `right` to fix the title position yourself. Left out, it is chosen for you. |

For the next batch, ask Claude to make `batches/batch-02/` the same way.

Then ask Claude: "Run the post batch in `batches/batch-01`".

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
