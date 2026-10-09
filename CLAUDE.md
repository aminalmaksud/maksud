# Image exports

- Deliver post and graphic images as **WebP only**. No JPG or PNG deliverables.
- 16:9 posts are 1920x1080. Render the layout at that size (`render.js` draws the 2000x1125 layout at scale 0.96) so text stays sharp; don't shrink a larger image afterwards.
- Export at the highest WebP quality that fits in 200 KB (`method=6`), using `middle-earth-history/post-000/source/export_webp.py`.
