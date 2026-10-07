---
name: fandom-overlay-pack
description: Builds a complete 16:9 transparent-PNG overlay pack for one of Maksud's numbered Facebook/YouTube fandom post series (Greek mythology, LOTR, Dune, Witcher, Star Wars, Harry Potter, DC, Marvel or any topic). The pack has 8 layouts with and without the @MusingsofMaksud follow bar, text-zone guides, per-piece layers, numbered series tags (HP1, LOTR1, DCV1...), themed frames, lines, motifs, action-line effects and social icons. Use this skill whenever the user asks for post overlays, image templates, frames, number stamps or tags, a follow bar, or a "package" or "pack" for a new post series, says "next series" or "new fandom", or names a fandom and wants the design kit for its posts, even if they don't say "overlay". It asks about the fandom, post count, series split and preferred fonts (choosing fitting fonts itself for anything left open), designs a look that fits that fandom (comic, epic, sci-fi HUD, manuscript, or a new custom look), shows a sample for approval, then builds and zips the pack.
---

# Fandom overlay pack

Maksud runs numbered Bangla post series about fandoms ("N days of posting about X").
Each post is a Midjourney image with overlays: two English lines at the top (an eyebrow
and a title), one Bangla line at the bottom, a series number tag such as HP1 or DCV1, and
a follow bar. This skill produces the overlay kit for a whole series. Maksud assembles each
post in their own editor.

These decisions are settled from earlier work, so don't reopen them unless the user asks:
- **Canvas 16:9**: design units 1920×1080, files rendered at 3840×2160. All files are transparent PNG.
- **Follow bar**: inside the bottom 84 px. It reads "FOLLOW", then the YouTube, Instagram and Facebook icons, then the handle (default @MusingsofMaksud).
- **8 layouts**, each with and without the bar, so text can avoid faces in full-bleed art:
  - centred;
  - caption panel on the left and on the right;
  - letterbox or strip;
  - a 16:9 image inside a framed window;
  - minimal;
  - side panel on the left and on the right.
  Each layout comes as a FULL_OVERLAY, a GUIDE_text_zones layer and separate pieces.
- **Numbered tags 1..N** for every series, in 4 styles.
- **Delivery**: zips of 28 MB or less, so each one can be sent in chat.

Every run is a fresh assessment. Ask about the topic each time, even if an earlier series
used this skill, because fandom, post count, split, fonts and look change between series.

## Workflow

### 1. Ask the kickoff questions
Ask these together in one message. Use AskUserQuestion if it is available, with the most likely answer first:
1. **Which fandom or topic?** Examples: Greek mythology, Lord of the Rings, Dune, Witcher, Star Wars, Harry Potter.
2. **How many posts?** This sets the tag count (1..N). Suggest 100 if they're unsure.
3. **One series or a split?** The default is one code per fandom (HP, LOTR, DUNE...). Offer the
   natural camps for that topic from `references/fandom_presets.md`, for example
   Gods / Heroes / Monsters for Greek mythology, or Jedi / Sith for Star Wars.
4. **Which fonts?** Ask for specific fonts for:
   - the English titles;
   - the tag numbers;
   - the @handle;
   - the Bangla line.
   The user can name fonts (any Google Font), upload TTF or OTF files, or leave it to you.
   Make clear that skipping is fine: if they don't name fonts, you'll choose ones that suit the fandom.

Don't ask about the look. You decide it once you know the fandom (step 2).
If the user already gave some answers, only ask about the rest. The handle stays
@MusingsofMaksud unless they change it.

### 2. Decide the look, fill the gaps and write the theme
**Look.** You choose the look for each fandom; the user doesn't pick from a list. The goal is a
style that feels like it belongs to that world. Four complete looks are built in:
- `comic`: halftone dots, action lines, outlined lettering. For superheroes, comics, cartoons and anime.
- `epic`: metal frames, soft shadows, engraved tags. For mythology, history and classic epics.
- `scifi`: HUD panels, glow lines, scanlines, hex grids. For space opera, Dune, cyberpunk and games.
- `manuscript`: torn parchment, ink borders, ribbons, wax seals. For medieval or literary fantasy.

`references/fandom_presets.md` gives the pick for the fandoms covered so far.

If none of the four truly fits (Egyptian, Japanese folklore, noir, art deco, steampunk, cosmic horror
and so on), design a new look as a plugin. `references/look_plugins.md` has the interface and the
rules. Prefer a custom look over forcing a fandom into a built-in that would look generic. A
built-in look that fits well is still the faster, safer choice.

In the brief, state the look you chose and one reason. The user sees it in the sample and can
ask for a different one.

**Design.** From the preset (or one you build the same way), set:
- the series codes and accent colours;
- the palette;
- the motifs that belong to the world, such as a Greek key, dunes, runes, elven leaves, lightning, stars or HUD lines.

**Fonts.**
- **Use whatever fonts the user named or uploaded.** Fetch Google Fonts with
  `bash scripts/get_font.sh "Family" <weight> <slug>/fonts/<role>.ttf`.
  If a named font isn't on Google Fonts or the download fails, ask for the file. If they don't send it, use your own pick for that role.
- **Fill every role they left open** with the preset's pick, or your own choice for the fandom.
  The Bangla font defaults to the bundled Somoyer Srot.
- **Check every font against "Font checks"** in the presets file, including fonts the user chose:
  - If the numbers font draws "1" like "I", tell the user and give the numbers a different font.
  - If the handle font has no lowercase, set `handleCase: "upper"` so the handle is colour-split and stays readable.
  Both problems happened before.

**Theme file.**
- Work in a fresh folder for this series (for example `<workdir>/<slug>/`).
- Write `<slug>/theme.json` following `references/theme_schema.md`.
- Fill `sample` with a realistic eyebrow, title and Bangla line for this fandom. The preview puts the first
  series' tag on every layout, so take the sample from that series. Write the Bangla in Maksud's voice
  if you know it; otherwise keep it short and neutral.
- If the user has a Midjourney image for this series, set it as `previewImage` so the sample
  shows real art. Don't wait for one; you can rebuild the preview when it arrives.

Go straight on to the sample. Don't send the brief as a separate step: the user wants to see the look.

### 3. Show the look and get approval
```bash
node scripts/build.js <slug>/theme.json <slug>/out --preview
```
This takes about 15 seconds. Send these files from `<slug>/out/<pack>/00_PREVIEW/`:
- `LAYOUTS_SHEET_sample.png`: all 8 layouts with sample text, a tag and the follow bar;
- `tags_sample.png`: every tag style for each series at 1, the middle number and N;
- `follow_bars_sample.png`.

Before sending, look at the images yourself. Check that text fits its zones, that tags read
correctly (DCV1, not DCVI), and that the motifs are visible. Fix problems before the user sees them.

With the images, send a short brief:
- the look you chose, with one reason (and, if you designed a new look, what it is made of);
- the series codes with their hex colours;
- the palette and motifs;
- the fonts, marking which ones the user picked and which you picked, with one line on why each of yours fits.

Ask for approval or changes. Typical changes are colours, fonts, codes, motif, or a different look.
Edit `theme.json` and rebuild the preview. Repeat until the user approves. Don't run the full
build before approval: it takes minutes and produces hundreds of files.

### 4. Build, zip and deliver
```bash
node scripts/build.js <slug>/theme.json <slug>/out --full
python3 scripts/zip_parts.py <slug>/out/<pack>
```
- The full build takes about 2 minutes per 600 files.
- If you made a custom look, also deliver its `.js` file so it can be reused for later series.
- Deliver every zip with the file-sending tool that's available (`present_files`, `SendUserFile` or similar).
  On claude.ai, write the zips to `/mnt/user-data/outputs/`.
- Tell the user to unzip all parts into the same place; they merge into one folder.

Close with a short summary:
- what's in the pack and the file count;
- the series codes;
- the fonts, and which one to use for the English text;
- the text-colour tip: use ink colour on yellow or cream panels, and cream or yellow on dark areas;
- the Midjourney tip: end prompts with `--ar 16:9`, and for side layouts add
  "subject on the right side of frame" (or "left").

## Requirements and troubleshooting
- **Software**: Node 18+ with Playwright and Chromium, Python 3, and curl.
  `build.js` looks for Playwright locally, globally and in common paths. If it's missing,
  run `npm i -g playwright && npx playwright install chromium`. If a Chromium is preinstalled
  elsewhere, set `CHROMIUM_PATH` to it.
- **Missing font file**: build.js stops and names the path. Fix `file` in theme.json.
- **Text overflow in the sample**: shorten `sample.en2`. Real titles are the user's to set,
  but long names may need two lines in the side-panel layouts.
- **New motif or layout**: extend `scripts/engine.js`. Motifs are small functions in `MOTIFS`.
  Layouts live in `layouts()`, with guides as `{role, label, x, y, w, h, align, ink, tag}`
  in 1920×1080 units. Keep new pieces inside the bottom bar limit `B` so the follow bar never covers them.
