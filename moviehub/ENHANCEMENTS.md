# What's new on top of MusingsofMaksudTV

One line each. Part 1 is what Maksud's original app already had, so you can see where the additions start. Part 2 is what was added on top (the StreamHub work, version 1.0.5).

## 1. Maksud's original (the starting point)

1. A **Mac app** (Electron) with ffmpeg built in, so every file plays with sound.
2. An **Android TV app**, with its own poster rows, My List, mini player and subtitle styles.
3. The **Vintage look**: parchment and maroon, in Parchment and Night themes, styled after musingsofmaksud.com.
4. A Netflix-style home: featured slideshow, **Continue watching**, and a poster row for every category on every server.
5. **Several libraries at once**, with "Movies" and "Movies 1080p" joined into one section and a 1080p/720p quality choice.
6. **Search across all servers**, **My List**, a **mini player** that keeps the video in a corner while you browse, and **next episode** autoplay.
7. **Audio track and subtitle menus** (sound for AC3/DTS files, subtitle size and style, audio sync) and **resume** for every video.
8. **TMDB posters and backdrops**, a drawn cover for titles without a poster, and **downloads** to the Mac.
9. A one-click **DhakaFlix servers** setup.

## 2. Added on top

1. **Windows app, StreamHub** (Tauri), with its own installer, the server and ffmpeg built in, and every build published as a download on GitHub Releases.
2. **A second look, Contemporary** (sidebar, flat, light/dark/system), next to Vintage, with a switch in Settings on both Mac and Windows.
3. **Vintage redesigned** from Claude Design: StreamHub wordmark with Maksud's byline, readable colours in both themes, one set of buttons and controls, book-jacket covers, and fonts bundled so it works offline.
4. **Local folders as libraries** (`G:\Movie`, `G:\Serial`…) with an Add folder button, on Mac and Windows.
5. **Share my folders with my TV**: the computer serves its local folders so the Android TV app can play them while it's on.
6. **Online subtitle search** in the player, like VLC (OpenSubtitles and SubDL), with exact-file matches first.
7. **3D movies shown in 2D** (side-by-side and top-bottom), with a button in the player.
8. **Plots (synopsis) for every movie, series and episode**, with a note on how to turn them on when there's no TMDB key.
9. **Covers everywhere**: a cover beside each movie's and series' name, season posters, a still for every episode, and a drawn cover when nothing is found.
10. **Season tabs, "More in…" and a Resume button** on series pages, and episode lists with title, plot and length.
11. **Settings as a full page** (both looks), plus a welcome screen with Add a folder from this computer.
12. **Jellyfin-compatible API**, so Streamyfin and other Jellyfin apps can browse and play your libraries, with Movie/Series/Season/Episode items, Next Up, and subtitles and track numbers for mpv-based players.
13. **Books**: PDF, EPUB and comics (CBZ) in a built-in reader, with PDFs and comics as a page-turning flipbook and your place remembered.
14. **Music**: albums with a track list, and a player bar that keeps playing while you browse (shuffle, repeat, cover, media keys).
15. **Windows download warning fixed** (the app's bundled server no longer carries a broken signature).
16. **Smarter titles**: "Panchayat (TV Series 2020– )" and "Blade.Runner.2049.2017" now read correctly.
17. **A Server page** (Windows look) showing status, ffmpeg, the address and each library's response time, and a Ctrl+K search.
18. **Fixes along the way**: Username/Password alignment in Settings, the Vintage hero on PCs with animations turned off, and the Jellyfin API moving to the next port when a real Jellyfin already uses 8096.
19. **Live TV (IPTV)**: add M3U playlists (web address or file) and watch channels grouped, searchable, with logos and favourites; the server converts any stream so it plays with sound.
20. **Automated tests and builds**: tests for the server, Jellyfin API, books and music, and GitHub builds for Windows and both Mac versions on every change.

## 3. Not done yet

1. A **separate Android app** for phone, tablet and TV (planned last; Streamyfin through the Jellyfin API may make it unnecessary).
2. Per-person profiles, the Mac app on Tauri (a playback test on a Mac comes first), and Live TV in Jellyfin apps and a programme guide (EPG).
