// MusingsofMaksudTV for Mac: runs the MusingsofMaksudTV server inside the app and shows it in a native window,
// with ffmpeg bundled so every file plays with sound.
const { app, BrowserWindow, shell, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Fixed port so the window's saved state (watch history, preferences) survives restarts.
const PORTS = [47913, 47914, 47915, 47916];

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
nativeTheme.themeSource = 'light';

const unpacked = (p) => p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

function listen(server) {
  return new Promise((resolve, reject) => {
    const tryPort = (i) => {
      server.once('error', (e) => (e.code === 'EADDRINUSE' && i + 1 < PORTS.length ? tryPort(i + 1) : reject(e)));
      server.listen(PORTS[i], '127.0.0.1', () => resolve(server.address().port));
    };
    tryPort(0);
  });
}

let win = null;
let baseUrl = '';

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 840, minWidth: 760, minHeight: 500,
    backgroundColor: '#f6efe4',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 22 },
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL(baseUrl);
  win.once('ready-to-show', () => win.show());
  // Links (e.g. "get a TMDB key") open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(baseUrl)) { e.preventDefault(); shell.openExternal(url); } });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  process.env.FFMPEG_PATH = unpacked(require('ffmpeg-static'));
  process.env.FFPROBE_PATH = unpacked(require('ffprobe-static').path);
  process.env.CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
  // Downloads are a Mac-app feature: movies go to ~/Downloads/MusingsofMaksudTV and play offline.
  process.env.DOWNLOAD_DIR = path.join(app.getPath('downloads'), 'MusingsofMaksudTV');
  globalThis.__revealInFinder = (dir) => { fs.mkdirSync(dir, { recursive: true }); shell.openPath(dir); };
  const webDir = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'web');
  const { server } = await import(pathToFileURL(path.join(webDir, 'server.js')).href);
  const port = await listen(server);
  baseUrl = `http://127.0.0.1:${port}/`;
  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
