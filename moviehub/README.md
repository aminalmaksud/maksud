# MovieHub

Watch the movies on your ISP's media server (FTP/BDIX-style "Index of /" HTTP server) on:

- **Android TV**, a native app (`android-tv/`) with ExoPlayer that plays MKV, MP4, AVI and more
- **Mac**, a browser app (`web/`). It is a web page served by a tiny local helper. It is **not** an APK and needs no install beyond Node.js.

Both apps let you browse folders, play movies, pick up where you stopped, and load
`.srt`/`.vtt` subtitles automatically when they sit next to the movie with the same name.

## What the apps expect from the server

Open your ISP server in a browser. If you see a plain page titled **"Index of /…"** with
clickable folders and files, it will work. Copy the address of the folder that holds the
movies, for example `http://10.16.100.244/Movies/`. That address is the **server address**
for both apps. If the server needs a login, enter it in Settings.

## Mac (browser app)

1. Install Node.js (LTS) from https://nodejs.org.
2. Double-click `web/start.command`. (On first run, right-click it, choose **Open**, and confirm.)
   Or run it in Terminal: `cd moviehub/web && node server.js`
3. Your browser opens at http://localhost:8080. Click **⚙ Settings** and paste the server address.

Keys while playing: Space = pause, ← / → = 10 s back/forward, F = fullscreen, Esc = close.

**Formats:** Chrome plays most MKV/MP4 files with H.264 video and AAC audio. Safari won't play MKV.
Files with AC3/DTS audio or HEVC video may not play in any browser. Play those on the TV app.

Why a local helper? Browsers block web pages from reading another server's folder
listing (CORS). The helper fetches the listings and streams the video through, with
seeking supported. By default it listens only on your Mac. To use it from other devices
at home, start it with `HOST=0.0.0.0 node server.js`.

Run the tests with `node test.js`.

## Android TV

### Get the APK
- **Easiest:** every push to GitHub builds it. Open the repo → **Actions** → **MovieHub TV APK** →
  the latest run → download **MovieHub-TV-apk** (a zip holding `app-debug.apk`).
- **Or** open `android-tv/` in Android Studio and click Run with your TV connected over ADB.

### Install it on the TV
- Copy the APK to a USB stick and open it with a file manager on the TV (allow "Install unknown apps"), or
- Use the **Send Files to TV** app, or
- Run `adb connect <tv-ip>` and then `adb install app-debug.apk` (turn on Developer options → USB/Network debugging on the TV).

Open **MovieHub** from the TV home screen and enter the server address in Settings.

Remote: OK = play/pause and show controls, ◀ / ▶ = skip 10 s, Back = up one folder / leave the player.
