// Builds the sidecar programs the Windows app ships with, into src-tauri/binaries/:
//   mmtv-server-<triple>.exe  the web/ server as a single program (Node "single executable application")
//   ffmpeg-<triple>.exe, ffprobe-<triple>.exe
// Run it on Windows or Linux with Node NODE_VERSION, after `npm ci` with npm_config_platform=win32 so
// ffmpeg-static fetches the Windows ffmpeg.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const NODE_VERSION = 'v24.22.1'; // the blob only runs on the exact Node version that made it
const TRIPLE = 'x86_64-pc-windows-msvc';
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'build');
const bins = path.join(root, 'src-tauri', 'binaries');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(bins, { recursive: true });

if (process.version !== NODE_VERSION) {
  console.error(`Run this with Node ${NODE_VERSION} (this is ${process.version}): the server blob must match the bundled node.exe.`);
  process.exit(1);
}

const isWindowsExe = (file) => fs.readFileSync(file).subarray(0, 2).toString() === 'MZ';
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The official node.exe, checked against nodejs.org's published checksums. Cached in build/. */
async function nodeExe() {
  const file = path.join(out, `node-${NODE_VERSION}-win-x64.exe`);
  const sums = (await download(`https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`)).toString();
  const want = /^([0-9a-f]{64})\s+win-x64\/node\.exe$/m.exec(sums)?.[1];
  if (!want) throw new Error('win-x64/node.exe is missing from SHASUMS256.txt');
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== want) {
    const exe = await download(`https://nodejs.org/dist/${NODE_VERSION}/win-x64/node.exe`);
    if (sha256(exe) !== want) throw new Error('node.exe checksum mismatch');
    fs.writeFileSync(file, exe);
  }
  return file;
}

// 1. web/serve.js and the modules it imports, as one CommonJS file (single executables run CommonJS).
await build({
  entryPoints: [path.join(root, '..', 'web', 'serve.js')],
  outfile: path.join(out, 'server.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  logOverride: { 'empty-import-meta': 'silent' }, // server.js uses WEB_ROOT instead when bundled
});

// 2. The single-executable blob, injected into a copy of node.exe.
const seaConfig = path.join(out, 'sea-config.json');
fs.writeFileSync(seaConfig, JSON.stringify({
  main: path.join(out, 'server.cjs'),
  output: path.join(out, 'server.blob'),
  disableExperimentalSEAWarning: true,
}));
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' });
const server = path.join(bins, `mmtv-server-${TRIPLE}.exe`);
fs.copyFileSync(await nodeExe(), server);
execFileSync(process.execPath, [
  path.join(root, 'node_modules', 'postject', 'dist', 'cli.js'),
  server, 'NODE_SEA_BLOB', path.join(out, 'server.blob'), '--sentinel-fuse', SEA_FUSE,
], { stdio: 'inherit' });

// 3. ffmpeg and ffprobe, the same versions the Mac app bundles.
const ffmpeg = path.join(root, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const ffprobe = path.join(root, 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe');
for (const [from, name] of [[ffmpeg, 'ffmpeg'], [ffprobe, 'ffprobe']]) {
  if (!fs.existsSync(from) || !isWindowsExe(from)) {
    throw new Error(`${from} isn't a Windows program. Reinstall with npm_config_platform=win32 npm_config_arch=x64 npm ci`);
  }
  fs.copyFileSync(from, path.join(bins, `${name}-${TRIPLE}.exe`));
}

for (const f of fs.readdirSync(bins)) console.log(`${f}  ${(fs.statSync(path.join(bins, f)).size / 1e6).toFixed(1)} MB`);
