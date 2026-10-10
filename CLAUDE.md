# Image exports

- Deliver post and graphic images as **WebP only**. No JPG or PNG deliverables.
- 16:9 posts are 1920x1080. Render the layout at that size (the 2000x1125 layout is drawn at scale 0.96) so text stays sharp; don't shrink a larger image afterwards.
- Export at the highest WebP quality that fits in 200 KB (`method=6`). `post-batch/batch.py` does this; for a one-off post use `middle-earth-history/post-000/source/export_webp.py`.

# Batch posts

When asked to run a post batch on `batches/<name>/` (see `post-batch/README.md`):

0. The user uploads through GitHub's web uploader, so first `git pull` the branch to get their images and `posts.csv`. If they paste titles in chat instead, write `posts.csv` (UTF-8) yourself.
1. Run `python3 post-batch/batch.py candidates --csv batches/<name>/posts.csv --images batches/<name>/images --out batches/<name>/out`. If it stops on CSV problems, report them to the user and stop.
2. Choose positions with Sonnet, not yourself: start `post-placement` agents (`.claude/agents/post-placement.md`, model sonnet; if that agent type isn't listed, use a general-purpose agent with model sonnet told to read and follow that file), 10 posts each, all in one message so they run in parallel. Posts that already have a `position` in posts.csv don't need a reviewer. Don't open the choice sheets yourself.
3. Run the same command with `final` instead of `candidates`.
4. Look at the `review/` pages and the flagged posts only, not every post. Show the user the review pages and list the flags with what you suggest for each. Don't change a reviewer's choice on your own; propose it.
5. Commit the finished WebPs, `report.csv`, `review/` and `decisions/`. `work/` and `candidates/` are gitignored.
