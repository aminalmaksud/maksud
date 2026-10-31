# Vintage look: design brief for Claude Design

> **Status:** the resulting design is in [`vintage/`](vintage/) and is built into the app (`web/public/style.css`). See `vintage/README.md` for what's done.

Paste this into Claude Design to refine the **Vintage** look of StreamHub / Musings of Maksud TV. Vintage is one of the
app's two looks; the other, **Contemporary**, already has its own design (`moviehub/windows/design/`). People switch
between them in **Settings → Look**, on both the Mac and the Windows app. The result gets built into the shared
`moviehub/web/public/` (plain HTML/CSS/vanilla JS, no framework), so keep designs implementable as web pages.

Attach a screenshot of the current Vintage home screen with this brief.

## Product
A Netflix-style home media app for Mac and Windows. It lists movies, TV series and anime from the ISP's BDIX media
servers (FTP-style "Index of /" and h5ai sites, e.g. DhakaFlix) and from **folders on the user's own computer**. It shows
them as posters with TMDB artwork and plays them with full audio/subtitle control.

**Audience:** home users in Bangladesh on BDIX ISPs. They're bilingual, so Bangla must look as good as English (Hind Siliguri).
They have Mac and Windows laptops and desktops, sometimes connected to a TV.

## What Vintage is (keep this soul)
Vintage is styled after **musingsofmaksud.com**: a warm, literary, heritage feel, like a well-loved bookshop or an old cinema
programme. It should feel crafted and ornamental where Contemporary is flat and quiet.
- **Parchment** background with a faint maroon dot grid and slowly drifting gold specks.
- **Maroon and gold** accents, and **crimson gradient panels** for the hero, the Continue watching row and page headers.
- **Display type in uppercase Oswald**, body in Plus Jakarta Sans, Bangla in Hind Siliguri, and serif monograms (Cinzel / Fraunces).
- **Book-jacket covers** for titles without a poster: a palette per title, a big outlined serif initial, a thin gold frame
  with ✦ ornaments, and year/quality tags.
- Soft, warm shadows, generous 18 px radii, and gold rings on hover and focus.
- Bilingual touches: "✦ আজকের বাছাই · Featured" and "মুসিংস অব মাকসুদ • টিভি".

## Current tokens
| Token | Parchment (light) | Night (dark) |
|---|---|---|
| Background | `#f6efe4` | `#17100c` |
| Surface / raised | `#fffcf7` / `#fbf5ec` | `#221812` / `#2c2019` |
| Line | `#eadbc8` | `#3c2c22` |
| Text / dim / faint | `#2b1a14` / `#6e5849` / `#9c8573` | `#f7ece0` / `#cdb8a4` / `#9a8471` |
| Maroon / maroon-2 | `#7a1820` / `#a3242f` | `#c43744` / `#e0505d` |
| Gold / gold-2 | `#d4a33f` / `#f5cf5b` | same |
| Pink accent | `#e23d6d` | same |
| Crimson panel | `linear-gradient(118deg, #2a070b, #561017 38%, #8a1b26 72%, #a52734)` | same |
| Radius | 18 px (cards), 26–30 px (panels), pill buttons | same |

Fonts: Oswald 500–700 (display), Plus Jakarta Sans 400–800 (body), Hind Siliguri 400–700 (Bangla), Fraunces and Cinzel 600–700 (monograms).

## What to improve
1. **Brand:** the project is now called **StreamHub**, but Vintage still shows the "Musings of Maksud TV" wordmark.
   Propose a **Vintage StreamHub wordmark and icon** in the parchment, maroon and gold language (it could keep "Musings
   of Maksud" as a byline), or argue for keeping the current mark.
2. **Contrast and accessibility:** gold on parchment and faint text on parchment are often too low in contrast. Bring every text
   and icon colour to WCAG AA in both Parchment and Night, and give clear keyboard focus states.
3. **Consistency:** buttons, pills, chips and menus have grown one by one. Define one set of components with states
   (default, hover, focus, pressed, selected, disabled, loading).
4. **Density:** make better use of wide and TV screens (1920×1080) and narrow windows (760 px).
5. **Night theme:** right now it's the parchment layout inverted. Give it its own character, like a dark wood-panelled
   cinema with candle-gold light.

## Screens (all exist today; redesign them in Vintage)
1. **Welcome / first run:** "Use DhakaFlix servers", "Add my own server", and now **"Add a folder from this computer"**.
2. **Home:** top bar (logo, section tabs, search, refresh, settings), the crimson featured hero with a tilted
   gold-framed poster, a Continue watching panel, My List, and one poster row per category with a coloured icon tile.
3. **Section / folder page:** a crimson header panel with breadcrumbs, a poster grid, an episode list for seasons, and badges for
   quality, watched and progress.
4. **Title details sheet:** backdrop, poster, title, meta, plot, the quality switch (1080p/720p), Play / Resume / Start over, My List,
   Download, All files, and Remove from Continue watching.
5. **Player:** controls (play, ±10 s, seek with buffer and tooltip, volume, time, next episode, PiP, full screen).
   - **Pills:** audio track, subtitles, speed, and **3D → 2D** (it appears for 3D movies).
   - **Menus:** audio (tracks, sync ±0.1/0.5 s) and subtitles, with tabs Tracks / Style / Sync. Style covers font, colour, edge,
     background, position and size.
   - **New:** a **Search online…** panel in the subtitles menu, with a search box, language chips (English, বাংলা, हिन्दी…) and a
     result list showing provider, language, "Exact match for this file" and download count.
6. **Mini player:** the video in a corner with a gold border while browsing.
7. **Downloads:** in-progress list (speed, %), finished list, "Show in Finder / Explorer".
8. **Settings:**
   - Libraries: a text list plus **Add folder…** and **Fill in DhakaFlix servers**
   - username/password, TMDB key
   - **Online subtitles:** OpenSubtitles key, username and password, plus SubDL key
   - **Look:** Vintage / Contemporary
   - **Theme:** Parchment / Night
   - the ffmpeg note

## Platform notes
- **Mac:** the window has a hidden title bar with the traffic lights at the top left (keep ~92 px clear in the top bar). The
  top bar also drags the window.
- **Windows:** native title bar. Use Ctrl shortcuts in hints (Mac shows ⌘).
- Both apps share this UI. Design at **1320×840**, and check **760×500** and **1920×1080**.

## Constraints for the handoff
- Plain HTML/CSS/vanilla JS. Keep the existing element IDs and the keyboard shortcuts (Space, ← →, ↑ ↓, F, M, C, A, [ ], N, 0–9,
  Esc, ⌘/Ctrl+F or K for search).
- **Bundle every font with the app**, because offline viewing of downloads and local folders is a feature. Today Vintage loads Oswald,
  Plus Jakarta Sans, Hind Siliguri, Fraunces and Cinzel from Google Fonts, so they fall back offline.
- Gradients, ornaments and shadows are welcome in Vintage, but keep them CSS-drawn (no heavy images) and keep the drifting
  specks subtle, with a reduced-motion version.
- Deliver:
  - tokens for Parchment and Night
  - the component sheet
  - the screens above at 1320×840, plus Home and Player at 760×500
  - the Vintage wordmark/icon as SVG (if you propose one)
