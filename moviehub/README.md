# MusingsofMaksudTV

<img src="web/public/logo.svg" width="96" alt="MusingsofMaksudTV logo">

Watch the movies, TV series and anime on your ISP's media servers (BDIX / FTP-style "Index of /"
or h5ai servers) on:

- **Mac**: a real app (`mac/`). You don't need a browser or anything else installed, because ffmpeg is built in.
- **Android TV**: a native app (`android-tv/`).

The Mac app looks like Netflix: a slideshow of featured titles at the top, then a row of posters for every
category on every server (English Movies, Hindi Movies, TV & Web Series, Anime…). Movie folders open straight
to the movie, seasons open as episode lists, and the search box searches every server at once.

- **One section per kind of library.** Libraries whose names differ only by quality ("Movies" and
  "Movies 1080p") are shown as one *Movies* section. Matching folders are joined by name, so "English Movies"
  and "English Movies (1080p)", or "(2024)" and "(2024) 1080p", appear once. A movie on both servers shows
  once, with a **Quality** choice (1080p / 720p) on its page. This works for any server you add.
- **My List.** Press **+** on any poster, **My List** on a movie's page or the featured panel, or **+** in the player.
- **Continue watching.** Hover a title and press **×** to remove it, or use *Remove from Continue watching* on
  its page. In an episode list, hover an episode and press ↺ to clear its progress.
- **Mini player.** Back / Esc shrinks the video to a corner so you can keep browsing. Click it to make it big
  again, or press × to stop.
- Titles without a poster get a cover in the website's colours with the title, year and quality.

Both apps support:
- **Multiple libraries.** Movies, TV series and anime are often on different servers. Add them all.
- **Resume.** Each video continues where you stopped. The Mac app also has a *Continue watching* row.
- **Audio track menu** for picking a language or dub, with sound for AC3 / DTS / E-AC3 files.
- **Subtitles menu.** It lists `.srt`/`.vtt` files on the server and subtitles built into the file. You can also change the size.
- **Next episode.** The Mac app plays the next episode automatically.

## Settings (both apps)

**DhakaFlix users:** click **Use DhakaFlix servers** on the welcome screen (Mac) or in Settings (TV).
That sets up Movies, Movies 1080p, TV & Web Series and Anime & Cartoons in one go.

**Libraries**: one server address per line, each with a name before it:

```
Movies | http://172.16.50.7/
TV Series | http://172.16.50.12/
Anime | http://172.16.50.14/
```

To find the right addresses, open your ISP's media portal in a browser. Copy the address of each
server or folder that holds videos.

**TMDB API key** (Mac app, recommended): adds real posters, backdrops, ratings and plot summaries. To get one for free,
create an account at themoviedb.org, then go to Settings → API. Without a key the app still uses any
poster images it finds on the server (`poster.jpg`, `folder.jpg`, …) and draws a colored card otherwise.

## Mac app

### Install
1. On GitHub, open **Actions → MusingsofMaksudTV Mac app**, then the latest green run. Download
   **MusingsofMaksudTV-mac-apple-silicon** (M1/M2/M3/M4 Macs) or **MusingsofMaksudTV-mac-intel** (older Macs).
   To check which one you need, open  → About This Mac. It says "Chip: Apple…" or "Processor: Intel…".
2. Unzip, open the `.dmg`, and drag **MusingsofMaksudTV** into **Applications**.
3. The first time, macOS blocks it because the app isn't from the App Store or a registered developer.
   Open it once, then go to **System Settings → Privacy & Security** and click **Open Anyway**.
   On older macOS versions, right-click the app and choose **Open** instead.

### Using it
- Click a movie to see its details, then **Play** or **Resume**.
- The player has an **audio** button (🎵) for tracks/dubs and a **CC** button for subtitles, timing,
  size and loading your own `.srt`. There's also a speed button, picture-in-picture and full screen.
- Keys: Space = pause · ← → = 10 s · Shift+← → = 30 s · ↑ ↓ = volume · F = full screen · M = mute ·
  C = subtitles on/off · A = audio tracks · [ ] = subtitle timing · N = next episode · 0–9 = jump to 0–90% · Esc = mini player

### Sound, sync and subtitles
Many movies use AC3/DTS audio and MKV files, which normal web players can't decode. The app converts the
sound on the fly with the bundled ffmpeg and leaves the picture untouched, so it uses very little CPU.

**How sync is kept:** the converted stream is Matroska with the movie's own timestamps, so picture and sound
stay exactly as aligned as in the original file, after any seek or resume. The browser engine ignores the
timing tricks MP4 streams rely on, which is why an earlier version drifted by up to ~10 s after seeking. This
is checked with test films that flash and beep at irregular moments, measured on screen and at the speakers
inside the app's own engine. Covered cases: AC3/E-AC3 MKV, audio starting late, gaps in the audio, MP4 sources,
seeks, and the sync controls.

- **Audio sync** (🎵 menu): move the sound earlier or later in 0.1 s / 0.5 s steps (up to ±20 s), saved per video.
- **Subtitle sync** (CC → Sync): 0.1 s / 1 s steps, or `[` `]` keys (Shift for 1 s), saved per video.
- **Subtitle style** (CC → Style): font (including Bangla), colour, outline/shadow/glow, background, position, size.
- **Built-in subtitles** load in a few seconds: only the next few minutes of the file are read, then it keeps
  reading ahead as you watch. Image subtitles (PGS/VobSub) can't be shown on the Mac; the TV app shows them.
- **Themes:** Parchment (default) or Night, in Settings.

### Downloads (Mac app only)
Press **⬇** in the player, or **Download** on a movie's page. Movies (with their subtitle files) are saved to
`Downloads/MusingsofMaksudTV` and appear under **⬇ Downloads** in the top bar, where you can watch them without
the internet, delete them, or open the folder in Finder. Interrupted downloads continue where they stopped.

### Running from source (developers)
`cd mac && npm install && npm start`. The Mac app is a small Electron wrapper around `web/`.
You can also run `web/` alone with `node web/server.js` and open http://localhost:8080 in a browser.
Install ffmpeg first (`brew install ffmpeg`) to get sound for every file. Tests: `node web/test.js`.

## Android TV

### Get the APK
- On GitHub, open **Actions → MusingsofMaksudTV Android TV APK**, then the latest green run, and download **MusingsofMaksudTV-AndroidTV-apk** (a zip
  containing `app-debug.apk`).
- Or open `android-tv/` in Android Studio and run it on the TV over ADB.

### Install it on the TV
- Copy the APK to a USB stick and open it with a file manager on the TV. You'll need to allow "Install unknown apps".
- Or use the **Send Files to TV** app.
- Or run `adb connect <tv-ip>` and then `adb install app-debug.apk`. Turn on Developer options → USB/Network debugging on the TV first.

### Using it
The TV app works like the Mac app: one *Movies* section for Movies + Movies 1080p, a featured slideshow,
*Continue watching* and *My List* rows, and drawn covers for titles without posters.

- **Hold OK** (or press **Menu**) on any title to: play a particular quality, **add to / remove from My List**,
  or **remove it from Continue watching** / mark it unwatched. The same works on episodes.
- A movie that's on two servers asks which quality to play (1080p, 720p…), starting with the one you were watching.
- **Back** in the player shrinks the video into the corner of the home screen and it keeps playing.
  **▶ Now playing** in the top bar makes it full screen again; **■ Stop** ends it. The remote's play/pause key works too.

### Remote
OK = play/pause and show controls · ◀ ▶ = skip 10 s · Back = up one folder / shrink the player to the corner.
While the controls are showing, press **Up** to reach the **Audio** and **Subtitles** buttons.
The remote's Menu, Audio and Captions keys open those menus directly. Your language choices are remembered.
