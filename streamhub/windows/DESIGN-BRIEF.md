# StreamHub: design brief for Claude Design

> **Status:** the resulting design is in [`design/`](design/) and is built into the app (`web/public/streamhub.css`). See `design/README.md` for what's done and what's still to come.

Paste this into Claude Design to start the StreamHub (Windows) UI redesign. The result gets built into the
shared `streamhub/web/public/` (plain HTML/CSS/JS, no framework), so keep designs implementable as web pages.

## Product
StreamHub is a Netflix-style home media app for Windows PCs. It finds movies, TV series and anime on the
ISP's BDIX media servers (FTP-style "Index of /" and h5ai sites, e.g. DhakaFlix), and soon on local folders.
It shows them as posters with TMDB artwork and plays them with full audio/subtitle control.
It's the Windows sibling of the Mac app "Musings of Maksud TV", and both share one UI codebase.

**Audience:** home users in Bangladesh on BDIX ISPs. They're bilingual, so Bangla text must look good (current font: Hind Siliguri).
They have mid-range Windows 10/11 laptops and desktops, sometimes connected to a TV.

## Brand
- New name for Windows: **StreamHub**. We need a wordmark and an app icon that work at 16, 32 and 256 px, and in light and dark.
- Keep the warm heritage of the current look (parchment, maroon `#7a1820`, gold `#d4a33f`, crimson gradient
  panels, Oswald display + Plus Jakarta Sans body), or propose an evolution. Show both a light and a dark theme.
  Today these are called "Parchment" and "Night".
- Open question for the designer: should the Mac app adopt StreamHub too, or stay "Musings of Maksud TV"?

## Feel at home on Windows 11
- Native title bar (min/max/close on the right), or a custom title bar that respects Snap Layouts.
- Mica/acrylic-style surfaces where it suits, rounded corners (8 px for controls), Segoe UI Variable for
  system text if it fits the brand, and visible focus rings for keyboard use.
- Keyboard first, with mouse and touch too: Ctrl+F search, arrow keys in rows, Esc to go back or shrink the player.
- Window sizes: design at **1320×840** (default) and check it at **760×500** (minimum) and at 1920×1080 on a TV.

## Screens to design (all exist today; redesign them)
1. **Welcome / first run**: "Use DhakaFlix servers" or "Add my own server".
2. **Home**: featured slideshow (backdrop, title, meta, overview, Play / More info / My List), then rows:
   Continue watching (with progress and a remove ×), My List, then one row per category per section
   (English Movies, Hindi Movies, TV & Web Series, Anime…). Posters fall back to a drawn cover with the title, year and quality.
3. **Top bar**: back, logo, section tabs, search across all servers, refresh, settings, ⬇ Downloads.
4. **Title details**: backdrop, poster, rating, year, runtime, genres, plot, Play / Resume, Quality choice (1080p/720p when a title is on two servers), Download, My List, Remove from Continue watching.
5. **Series**: seasons and episode list with progress, ↺ to clear progress, and auto next episode.
6. **Player**: big video with controls (play, ±10 s, seek bar with time, volume, speed, PiP, full screen, ⬇, next episode).
   It has an **audio menu** (tracks/dubs, audio sync ±0.1/0.5 s) and a **CC menu** (track list, load .srt, sync,
   style: font incl. Bangla, colour, outline/shadow/glow, background, position, size).
7. **Mini player**: the video shrinks to a corner while you browse; click to expand, × to stop.
8. **Downloads**: in progress (speed, %), finished (watch offline, delete), "Show in Explorer".
9. **Settings**: libraries (one "Label | address" per line), username/password, TMDB key, theme.

## Coming next (design these as concepts so the system scales)
- **Libraries of different types**: Movies/TV, Music, Audiobooks, Books (PDF/EPUB/comics), Live TV (M3U/IPTV).
- **Music player**: albums and artists, queue, and a persistent mini bar that keeps playing while you browse.
- **Book reader**: PDF/EPUB/comic pages, remembered position, reading themes.
- **Live TV**: channel grid with logos and groups, Now/Next from the EPG, favourites.
- **Profiles**: "Who's watching?" picker; each person has their own Continue watching and My List.
- **Local folders**: "Add folder…" in Settings, with a badge on titles that come from this PC.
- **Jellyfin sharing**: a toggle with an address/QR so phones and TVs (Streamyfin, Jellyfin apps) can connect.

## Constraints for the handoff
- Plain HTML/CSS/vanilla JS: the screens above are rendered by `app.js` into `index.html`.
  Give components with clear states (hover, focus, selected, disabled, loading, empty, error).
- Bundle the fonts with the app. Today they load from Google Fonts, which fails offline; offline viewing of downloads is a feature.
- Keep the existing keyboard shortcuts working (Space, ← →, ↑ ↓, F, M, C, A, [ ], N, 0–9, Esc).
- Deliver: design tokens (colours, type, spacing, radii, shadows) for both themes, the screens above at 1320×840,
  the 760×500 layouts of Home and Player, and the StreamHub logo and icon as SVG.
