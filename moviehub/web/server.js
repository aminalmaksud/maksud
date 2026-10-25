// MusingsofMaksudTV: serves the UI and proxies the ISP media server. Used by the Mac app (mac/) and runnable on
// its own: `node server.js`, then open http://localhost:8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { parseListing, srtToVtt, extOf, canonPath, VIDEO_EXT } from './listing.js';
import { hasFfmpeg, probe, remux, extractSubtitle, keyframeBefore } from './media.js';
import { metaFor } from './meta.js';
import { downloadsEnabled, startDownload, cancelDownload, deleteDownloaded, listDownloads, localEntries, localFile } from './downloads.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(here, 'config.json');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1'; // set HOST=0.0.0.0 to open it to your home network

const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml', json: 'application/json', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime',
  avi: 'video/x-msvideo', ts: 'video/mp2t', mpg: 'video/mpeg', mpeg: 'video/mpeg', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
};

function splitServers(v) {
  return (Array.isArray(v) ? v : String(v || '').split(/[\n,]/)).map((x) => String(x).trim()).filter(Boolean);
}

function loadConfig() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { /* first run */ }
  return {
    servers: splitServers(process.env.SERVER_URL || c.servers || c.serverUrl), // SERVER_URL may be comma-separated
    username: process.env.SERVER_USER ?? c.username ?? '',
    password: process.env.SERVER_PASS ?? c.password ?? '',
    tmdbKey: process.env.TMDB_KEY ?? c.tmdbKey ?? '',
  };
}
let config = loadConfig();

/** A server line is "http://host/path/" or "Label | http://host/path/". */
const splitLabel = (s) => { const m = /^(.*?)\s*\|\s*(\S+)$/.exec(s); return m ? { label: m[1], url: m[2] } : { label: '', url: s }; };

function toBase(line) {
  const s = splitLabel(line).url;
  const u = new URL(/^https?:\/\//i.test(s) ? s : 'http://' + s);
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  u.search = ''; u.hash = '';
  return u;
}
const bases = () => config.servers.map(toBase);
const serverNames = () => config.servers.map((line, i) => splitLabel(line).label
  || decodeURIComponent(bases()[i].host + bases()[i].pathname).replace(/\/$/, '').replace(/\//g, ' / '));

const authValue = () => (config.username ? 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64') : '');
function upstreamHeaders(extra = {}) {
  const h = { 'user-agent': 'MovieHub/1.0', ...extra };
  if (config.username) h.authorization = authValue();
  return h;
}

/**
 * Client paths look like "<server index>/<path under that server's root>".
 * Resolve one against its server; refuse anything outside that server's library.
 */
function resolveUnderBase(rel) {
  const all = bases();
  if (!all.length) throw httpError(400, 'Server URL is not configured');
  const m = /^(\d+)\/(.*)$/s.exec(String(rel || '').replace(/^\/+/, ''));
  const idx = m ? Number(m[1]) : -1;
  const base = all[idx];
  if (!base) throw httpError(400, 'Unknown server');
  const u = new URL(m[2], base);
  if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname)) throw httpError(400, 'Path outside library');
  return { base, idx, url: u };
}

/** A playable item: a URL on a library server, or a downloaded file ("local/<name>"). */
function media(rel) {
  if (String(rel || '').startsWith('local/')) {
    const file = localFile(rel);
    if (!file) throw httpError(404, 'Downloaded file not found');
    return { src: file, auth: '', local: true, ext: extOf(file) };
  }
  const { url } = resolveUnderBase(rel);
  return { src: url.href, auth: authValue(), local: false, ext: extOf(url.pathname), url };
}

/** Serves a downloaded file with byte ranges (seeking). */
function serveFile(req, res, file) {
  const size = fs.statSync(file).size;
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  const type = MIME[extOf(file)] || 'application/octet-stream';
  if (!m) { res.writeHead(200, { 'content-length': size, 'accept-ranges': 'bytes', 'content-type': type }); return fs.createReadStream(file).pipe(res); }
  const a = Number(m[1]), b = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  res.writeHead(206, { 'content-range': `bytes ${a}-${b}/${size}`, 'content-length': b - a + 1, 'accept-ranges': 'bytes', 'content-type': type });
  fs.createReadStream(file, { start: a, end: b }).pipe(res);
}

function httpError(status, message) { return Object.assign(new Error(message), { status }); }
function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) { chunks.push(c); if (chunks.reduce((n, b) => n + b.length, 0) > 65536) throw httpError(413, 'Too large'); }
  return Buffer.concat(chunks).toString('utf8');
}

const listCache = new Map(); // dir rel -> { at, job }
const LIST_TTL = 5 * 60000;

function limiter(n) {
  let active = 0; const queue = [];
  const next = () => { if (active < n && queue.length) { active++; queue.shift()(); } };
  return (fn) => new Promise((resolve, reject) => {
    queue.push(() => fn().then(resolve, reject).finally(() => { active--; next(); }));
    next();
  });
}
const upstreamLimit = limiter(8); // be gentle with the ISP server when many posters load at once

const relOf = (idx, base, u) => `${idx}/${canonPath(u.pathname).slice(canonPath(base.pathname).length)}`;
const h5aiHosts = new Set(); // origins known to run h5ai

/**
 * h5ai file browsers (DhakaFlix and many BDIX servers) build their listing with JavaScript from a JSON
 * API. The API answers on the folder's own URL; older installs only on /_h5ai/public/index.php.
 */
async function h5aiApi(dir, body) {
  for (const target of [dir, new URL('/_h5ai/public/index.php', dir)]) {
    try {
      const up = await fetch(target, {
        method: 'POST',
        headers: upstreamHeaders({ 'content-type': 'application/json', accept: 'application/json' }),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      if (!up.ok) continue;
      const data = await up.json();
      if (data && typeof data === 'object') return data;
    } catch { /* try the next endpoint */ }
  }
  return null;
}

const linksHtml = (items) => (items || []).map((i) => `<a href="${String(i.href).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`).join('');

/** Entries of a folder, with paths in client form ("<idx>/..."). Cached briefly; posters reuse it. */
function listDir(rel) {
  if (rel === 'local/') return Promise.resolve({ path: 'local/', items: localEntries() });
  const hit = listCache.get(rel);
  if (hit && Date.now() - hit.at < LIST_TTL) return hit.job;
  const job = upstreamLimit(async () => {
    const { base, idx, url: dir } = resolveUnderBase(rel);
    if (!dir.pathname.endsWith('/')) dir.pathname += '/';
    let up;
    try { up = await fetch(dir, { headers: upstreamHeaders(), signal: AbortSignal.timeout(15000) }); }
    catch (e) { throw httpError(502, `Cannot reach the server: ${e.cause?.code || e.message}`); }
    if (up.status === 401) throw httpError(401, 'Server requires a username and password');
    if (!up.ok) throw httpError(502, `Server answered ${up.status}`);
    const html = await up.text();
    let items = null;
    if (html.includes('_h5ai')) {
      h5aiHosts.add(dir.origin);
      const data = await h5aiApi(dir, { action: 'get', items: { href: dir.pathname, what: 1 } });
      if (data?.items) items = parseListing(linksHtml(data.items), dir.href, base.href);
    }
    items ??= parseListing(html, dir.href, base.href);
    for (const it of items) it.path = `${idx}/${it.path}`;
    return { path: relOf(idx, base, dir), items };
  });
  listCache.set(rel, { at: Date.now(), job });
  job.catch(() => listCache.delete(rel));
  return job;
}

const libRoots = new Map(); // library index -> path after skipping wrapper folders

/**
 * Library roots on BDIX servers are often a lone wrapper folder ("DHAKA-FLIX-7/"). Step through those so
 * a library opens on its real categories.
 */
async function libraryRoot(idx) {
  if (libRoots.has(idx)) return libRoots.get(idx);
  let listing = await listDir(`${idx}/`);
  for (let depth = 0; depth < 3; depth++) {
    const dirs = listing.items.filter((i) => i.isDir), files = listing.items.filter((i) => i.kind === 'video');
    if (dirs.length !== 1 || files.length) break;
    listing = await listDir(dirs[0].path);
  }
  libRoots.set(idx, listing);
  return listing;
}

async function handleBrowse(url, res) {
  const all = bases();
  const servers = serverNames();
  if (!all.length) throw httpError(400, 'Server URL is not configured');
  let rel = url.searchParams.get('path') || '';
  if (rel === 'local/') return json(res, 200, { path: 'local/', items: localEntries(), servers, roots: [] });
  if (url.searchParams.get('refresh')) { listCache.delete(rel); libRoots.clear(); }
  const roots = await Promise.all(all.map((_, i) => libraryRoot(i).then((l) => l.path, () => `${i}/`)));
  if (!rel && all.length > 1) {
    return json(res, 200, { path: '', servers, roots, items: servers.map((name, i) => ({ name, path: roots[i], isDir: true, kind: 'dir' })) });
  }
  if (!rel) rel = '0/';
  if (!rel.endsWith('/')) rel += '/';
  const listing = /^\d+\/$/.test(rel) ? await libraryRoot(Number(rel.slice(0, -1))) : await listDir(rel);
  json(res, 200, { ...listing, servers, roots });
}

/** Search every library. h5ai servers search themselves; others are skipped (their folders can still be filtered). */
async function handleSearch(url, res) {
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return json(res, 200, { items: [] });
  const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '.*');
  const all = bases();
  await Promise.all(all.map((_, i) => libraryRoot(i).catch(() => null)));
  const results = await Promise.all(all.map(async (base, idx) => {
    if (!h5aiHosts.has(base.origin)) return [];
    const root = new URL(base);
    const data = await h5aiApi(root, { action: 'get', search: { href: root.pathname, pattern, ignorecase: true } });
    const found = [];
    for (const it of data?.search || []) {
      let u;
      try { u = new URL(String(it.href), root); } catch { continue; }
      const path = canonPath(u.pathname);
      if (u.origin !== base.origin || !path.startsWith(canonPath(base.pathname))) continue;
      const isDir = path.endsWith('/');
      const name = decodeURIComponent(path.replace(/\/$/, '').split('/').pop());
      const kind = isDir ? 'dir' : VIDEO_EXT.has(extOf(name)) ? 'video' : null;
      if (kind) found.push({ name, path: relOf(idx, base, u), isDir, kind, library: serverNames()[idx] });
    }
    return found;
  }));
  // Folders first (each movie usually lives in its own folder), then loose videos. A video whose folder
  // is already listed would just be the same movie twice.
  const flat = results.flat();
  const dirs = new Set(flat.filter((i) => i.isDir).map((i) => i.path));
  const items = flat.filter((i) => i.isDir || !dirs.has(i.path.replace(/[^/]+$/, '')))
    .sort((a, b) => Number(b.isDir) - Number(a.isDir)).slice(0, 120);
  json(res, 200, { items, searchable: all.some((b) => h5aiHosts.has(b.origin)) });
}

async function proxy(req, res, target, { cache } = {}) {
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  const range = req.headers.range;
  let up;
  try { up = await fetch(target, { headers: upstreamHeaders(range ? { range } : {}), signal: ac.signal }); }
  catch (e) { if (ac.signal.aborted) return; throw httpError(502, `Cannot reach server: ${e.cause?.code || e.message}`); }
  const headers = { 'accept-ranges': 'bytes', 'content-type': MIME[extOf(new URL(target).pathname)] || up.headers.get('content-type') || 'application/octet-stream' };
  for (const k of ['content-length', 'content-range', 'last-modified', 'etag']) if (up.headers.get(k)) headers[k] = up.headers.get(k);
  if (cache && up.ok) headers['cache-control'] = 'public, max-age=604800';
  res.writeHead(up.status, headers);
  if (!up.body || req.method === 'HEAD') return res.end();
  Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
}

async function handleSubs(url, res) {
  const m = media(url.searchParams.get('path'));
  let buf;
  if (m.local) buf = fs.readFileSync(m.src);
  else {
    const up = await fetch(m.src, { headers: upstreamHeaders(), signal: AbortSignal.timeout(15000) });
    if (!up.ok) throw httpError(404, 'Subtitle not found');
    buf = Buffer.from(await up.arrayBuffer());
  }
  let text = buf.toString('utf8');
  if (text.includes('�')) text = buf.toString('latin1'); // old SRTs are often Windows-1252
  res.writeHead(200, { 'content-type': 'text/vtt; charset=utf-8' });
  res.end(m.ext === 'srt' ? srtToVtt(text) : text);
}

async function handleProbe(url, res) {
  const m = media(url.searchParams.get('path'));
  if (!hasFfmpeg) return json(res, 200, { ffmpeg: false, direct: true, audio: [], subs: [], duration: 0 });
  try {
    json(res, 200, { ffmpeg: true, ...(await probe(m.src, m.auth)) });
  } catch (e) {
    throw httpError(502, `Could not read this file: ${e.message}`);
  }
}

async function handleRemux(url, res) {
  const m = media(url.searchParams.get('path'));
  if (!hasFfmpeg) throw httpError(501, 'ffmpeg is not installed');
  const info = await probe(m.src, m.auth);
  const p = remux(m.src, m.auth, {
    start: Number(url.searchParams.get('t')) || 0,
    audio: Number(url.searchParams.get('audio')) || 0,
    audioDelay: clampDelay(url.searchParams.get('adelay')),
    format: url.searchParams.get('fmt') === 'mp4' ? 'mp4' : 'mkv',
    info,
  });
  let err = '';
  p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  res.on('close', () => p.kill('SIGKILL'));
  p.on('close', (code) => { if (code && !res.writableEnded) console.error('ffmpeg:', err.trim()); });
  res.writeHead(200, { 'content-type': url.searchParams.get('fmt') === 'mp4' ? 'video/mp4' : 'video/webm', 'cache-control': 'no-store' });
  p.stdout.pipe(res);
}

/** Where a converted stream asked to start at ?t= will really start (see keyframeBefore). */
const clampDelay = (v) => Math.max(-20, Math.min(20, Number(v) || 0));

async function handleSeekPoint(url, res) {
  const m = media(url.searchParams.get('path'));
  const t = Math.max(0, Number(url.searchParams.get('t')) || 0);
  if (!hasFfmpeg) return json(res, 200, { start: t });
  const info = await probe(m.src, m.auth);
  json(res, 200, { start: info.video && !info.video.transcode ? await keyframeBefore(m.src, m.auth, t) : t });
}

async function handleEmbeddedSub(url, res) {
  const m = media(url.searchParams.get('path'));
  if (!hasFfmpeg) throw httpError(501, 'ffmpeg is not installed');
  try {
    const from = Math.max(0, Number(url.searchParams.get('from')) || 0);
    const dur = Math.max(0, Math.min(3600, Number(url.searchParams.get('dur')) || 0));
    const vtt = await extractSubtitle(m.src, m.auth, Number(url.searchParams.get('index')) || 0, from, dur);
    res.writeHead(200, { 'content-type': 'text/vtt; charset=utf-8' });
    res.end(vtt);
  } catch (e) {
    throw httpError(502, `Could not read subtitles: ${e.message}`);
  }
}

async function handleMeta(url, res) {
  const rel = url.searchParams.get('path') || '';
  if (!rel.startsWith('local/')) resolveUnderBase(rel);
  const m = await metaFor(rel, async (dir) => (await listDir(dir)).items, config.tmdbKey);
  json(res, 200, m);
}

/** Mac app downloads: POST {path} starts one, GET lists, DELETE ?id= cancels, DELETE ?name= removes a file. */
async function handleDownloads(req, url, res) {
  if (!downloadsEnabled()) throw httpError(404, 'Downloads are available in the Mac app');
  if (req.method === 'POST') {
    const { path: rel } = JSON.parse((await readBody(req)) || '{}');
    const { url: target } = resolveUnderBase(rel);
    const name = decodeURIComponent(String(rel).split('/').pop());
    const stem = name.replace(/\.[^.]+$/, '').toLowerCase();
    let extras = [];
    try {
      const parent = String(rel).replace(/[^/]+$/, '');
      extras = (await listDir(parent)).items.filter((i) => i.kind === 'sub' && i.name.toLowerCase().startsWith(stem))
        .map((i) => ({ url: resolveUnderBase(i.path).url.href, name: i.name }));
    } catch { /* subtitles are a bonus */ }
    const job = startDownload({ id: rel, url: target.href, name, headers: upstreamHeaders(), extras });
    return json(res, 200, { ok: true, name: job.name });
  }
  if (req.method === 'DELETE') {
    if (url.searchParams.get('id')) cancelDownload(url.searchParams.get('id'));
    if (url.searchParams.get('name')) deleteDownloaded(url.searchParams.get('name'));
  }
  json(res, 200, listDownloads());
}

async function handleTmdbImage(req, url, res) {
  const m = /^\/tmdb\/(w\d+|original)\/([\w-]+\.(?:jpg|png))$/.exec(url.pathname);
  if (!m) throw httpError(404, 'Not found');
  const up = await fetch(`https://image.tmdb.org/t/p/${m[1]}/${m[2]}`, { signal: AbortSignal.timeout(15000) });
  if (!up.ok) throw httpError(up.status, 'Image not found');
  res.writeHead(200, { 'content-type': up.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public, max-age=2592000' });
  Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
}

async function handleConfig(req, res) {
  if (req.method === 'POST') {
    const b = JSON.parse((await readBody(req)) || '{}');
    const servers = splitServers(b.servers ?? b.serverUrl);
    for (const s of servers) { try { toBase(s); } catch { throw httpError(400, `Invalid server address: ${s}`); } }
    config = {
      servers,
      username: String(b.username || ''),
      password: b.keepPassword ? config.password : String(b.password || ''),
      tmdbKey: b.tmdbKey === undefined ? config.tmdbKey : String(b.tmdbKey).trim(),
    };
    listCache.clear(); libRoots.clear();
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  json(res, 200, { servers: config.servers, username: config.username, hasPassword: !!config.password, tmdbKey: config.tmdbKey, ffmpeg: hasFfmpeg, downloads: downloadsEnabled() });
}

function serveStatic(url, res) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, { 'content-type': MIME[extOf(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (p === '/api/browse') return await handleBrowse(url, res);
    if (p === '/api/search') return await handleSearch(url, res);
    if (p === '/api/config') return await handleConfig(req, res);
    if (p === '/api/meta') return await handleMeta(url, res);
    if (p === '/api/probe') return await handleProbe(url, res);
    if (p === '/api/seek-point') return await handleSeekPoint(url, res);
    if (p === '/api/embedded-sub') return await handleEmbeddedSub(url, res);
    if (p === '/api/downloads') return await handleDownloads(req, url, res);
    if (p === '/api/reveal') { globalThis.__revealInFinder?.(listDownloads().dir); return json(res, 200, { ok: true }); }
    if (p === '/stream') {
      const m = media(url.searchParams.get('path'));
      return m.local ? serveFile(req, res, m.src) : await proxy(req, res, m.src);
    }
    if (p === '/img') return await proxy(req, res, resolveUnderBase(url.searchParams.get('path')).url.href, { cache: true });
    if (p === '/remux') return await handleRemux(url, res);
    if (p === '/subs') return await handleSubs(url, res);
    if (p.startsWith('/tmdb/')) return await handleTmdbImage(req, url, res);
    serveStatic(url, res);
  } catch (e) {
    if (res.headersSent) return res.destroy();
    json(res, e.status || 500, { error: e.message });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => console.log(`MusingsofMaksudTV running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
}
export { server };
