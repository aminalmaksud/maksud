# StreamHub design (from Claude Design)

These are the Claude Design source files for the StreamHub Windows UI. They're for reference only and the app
doesn't load them. To view them, serve this folder (`python3 -m http.server`) and open the `.dc.html` files.
`support.js` is Claude Design's preview runtime, and it loads React from unpkg.

- `StreamHub Windows App.dc.html`: clickable prototype of every screen
- `StreamHub Brand Pack.dc.html`: logo, colours, type, spacing and core components
- `assets/`: logo and app icon (also copied to `web/public/assets/`; the Windows icons in `src-tauri/icons/` come from `streamhub-icon.svg`)

## How it's built into the app
The app's UI lives in `web/public/` and is shared with the Mac app. The StreamHub look is `web/public/streamhub.css`,
and it applies only when the server runs with `BRAND=streamhub` (the Windows app sets this). The server then adds
`class="streamhub"` to the page. The Mac app keeps its own look.

| Design | In the app |
|---|---|
| Sidebar: search (Ctrl+K), Home, sections, My List, Downloads, Server, server status, theme, settings | Done. Sections come from your libraries, and the sidebar collapses to icons below 960 px |
| Home: featured panel, Continue watching, rows | Done |
| Library grid, title details, quality switch, episode list | Done, as a restyle of the existing screens |
| Player, audio/subtitle menus, mini player | Done (restyled) |
| Downloads | Done (restyled, no pause button: downloads can be cancelled and resumed) |
| Settings, theme System / Light / Dark | Done. "System" follows Windows |
| Server page | Done, with real data only: uptime, ffmpeg, address, and each library's response time |
| Watch on another device (QR, LAN address), streaming sessions, CPU | Not yet. This comes with the Jellyfin-compatible server |
| Tray menu, launch at startup, keep running in tray, hardware transcoding | Not yet |
| Custom title bar | Uses the native Windows title bar |
| Recent searches, filter chips and sort on library pages | Not yet |
