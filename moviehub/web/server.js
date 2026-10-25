// MovieHub: serves the UI and proxies the ISP media server. Used by the Mac app (mac/) and runnable on
// its own: `node server.js`, then open http://localhost:8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { parseListing, srtToVtt, extOf } from './listing.js';
import { hasFfmpeg, probe, remux, extractSubtitle, keyframeBefore } from './media.js';
import { metaFor } from './meta.js';

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

/** Entries of a folder, with paths in client form ("<idx>/..."). Cached briefly; posters reuse it. */
function listDir(rel) {
  const hit = listCache.get(rel);
  if (hit && Date.now() - hit.at < LIST_TTL) return hit.job;
  const job = (async () => {
    const { base, idx, url: dir } = resolveUnderBase(rel);
    if (!dir.pathname.endsWith('/')) dir.pathname += '/';
    let up;
    try { up = await fetch(dir, { headers: upstreamHeaders(), signal: AbortSignal.timeout(15000) }); }
    catch (e) { throw httpError(502, `Cannot reach ${dir.host}: ${e.cause?.code || e.message}`); }
    if (up.status === 401) throw httpError(401, 'Server requires a username and password');
    if (!up.ok) throw httpError(502, `Server answered ${up.status}`);
    const html = await up.text();
    let items = parseListing(html, dir.href, base.href);
    if (!items.length && html.includes('_h5ai')) items = await h5aiListing(dir, base);
    for (const it of items) it.path = `${idx}/${it.path}`;
    return { path: `${idx}/${dir.pathname.slice(base.pathname.length)}`, items };
  })();
  listCache.set(rel, { at: Date.now(), job });
  job.catch(() => listCache.delete(rel));
  return job;
}

async function handleBrowse(url, res) {
  const all = bases();
  const servers = serverNames();
  let rel = url.searchParams.get('path') || '';
  if (!rel && all.length > 1) {
    return json(res, 200, { path: '', servers, items: servers.map((name, i) => ({ name, path: `${i}/`, isDir: true, kind: 'dir' })) });
  }
  if (!rel) rel = '0/';
  if (!rel.endsWith('/')) rel += '/';
  if (url.searchParams.get('refresh')) listCache.delete(rel);
  json(res, 200, { ...(await listDir(rel)), servers });
}

/** h5ai file browsers (common on BDIX servers) may build the listing in JS; ask their API instead. */
async function h5aiListing(dir, base) {
  try {
    const up = await fetch(new URL('/_h5ai/public/index.php', dir), {
      method: 'POST',
      headers: upstreamHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ action: 'get', items: { href: dir.pathname, what: 1 } }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await up.json();
    const links = (data.items || []).map((i) => `<a href="${String(i.href).replace(/"/g, '&quot;')}">`).join('');
    return parseListing(links, dir.href, base.href);
  } catch {
    return [];
  }
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
  const { url: target } = resolveUnderBase(url.searchParams.get('path'));
  const up = await fetch(target, { headers: upstreamHeaders(), signal: AbortSignal.timeout(15000) });
  if (!up.ok) throw httpError(404, 'Subtitle not found');
  const buf = Buffer.from(await up.arrayBuffer());
  let text = buf.toString('utf8');
  if (text.includes('�')) text = buf.toString('latin1'); // old SRTs are often Windows-1252
  res.writeHead(200, { 'content-type': 'text/vtt; charset=utf-8' });
  res.end(extOf(target.pathname) === 'srt' ? srtToVtt(text) : text);
}

async function handleProbe(url, res) {
  const { url: target } = resolveUnderBase(url.searchParams.get('path'));
  if (!hasFfmpeg) return json(res, 200, { ffmpeg: false, direct: true, audio: [], subs: [], duration: 0 });
  try {
    json(res, 200, { ffmpeg: true, ...(await probe(target.href, authValue())) });
  } catch (e) {
    throw httpError(502, `Could not read this file: ${e.message}`);
  }
}

async function handleRemux(url, res) {
  const { url: target } = resolveUnderBase(url.searchParams.get('path'));
  if (!hasFfmpeg) throw httpError(501, 'ffmpeg is not installed');
  const info = await probe(target.href, authValue());
  const p = remux(target.href, authValue(), {
    start: Number(url.searchParams.get('t')) || 0,
    audio: Number(url.searchParams.get('audio')) || 0,
    info,
  });
  let err = '';
  p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  res.on('close', () => p.kill('SIGKILL'));
  p.on('close', (code) => { if (code && !res.writableEnded) console.error('ffmpeg:', err.trim()); });
  res.writeHead(200, { 'content-type': 'video/mp4', 'cache-control': 'no-store' });
  p.stdout.pipe(res);
}

/** Where a converted stream asked to start at ?t= will really start (see keyframeBefore). */
async function handleSeekPoint(url, res) {
  const { url: target } = resolveUnderBase(url.searchParams.get('path'));
  const t = Math.max(0, Number(url.searchParams.get('t')) || 0);
  if (!hasFfmpeg) return json(res, 200, { start: t });
  const info = await probe(target.href, authValue());
  json(res, 200, { start: info.video && !info.video.transcode ? await keyframeBefore(target.href, authValue(), t) : t });
}

async function handleEmbeddedSub(url, res) {
  const { url: target } = resolveUnderBase(url.searchParams.get('path'));
  if (!hasFfmpeg) throw httpError(501, 'ffmpeg is not installed');
  try {
    const vtt = await extractSubtitle(target.href, authValue(), Number(url.searchParams.get('index')) || 0);
    res.writeHead(200, { 'content-type': 'text/vtt; charset=utf-8' });
    res.end(vtt);
  } catch (e) {
    throw httpError(502, `Could not read subtitles: ${e.message}`);
  }
}

async function handleMeta(url, res) {
  const rel = url.searchParams.get('path') || '';
  resolveUnderBase(rel);
  const m = await metaFor(rel, async (dir) => (await listDir(dir)).items, config.tmdbKey);
  json(res, 200, m);
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
    listCache.clear();
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  json(res, 200, { servers: config.servers, username: config.username, hasPassword: !!config.password, tmdbKey: config.tmdbKey, ffmpeg: hasFfmpeg });
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
    if (p === '/api/config') return await handleConfig(req, res);
    if (p === '/api/meta') return await handleMeta(url, res);
    if (p === '/api/probe') return await handleProbe(url, res);
    if (p === '/api/seek-point') return await handleSeekPoint(url, res);
    if (p === '/api/embedded-sub') return await handleEmbeddedSub(url, res);
    if (p === '/stream') return await proxy(req, res, resolveUnderBase(url.searchParams.get('path')).url.href);
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
  server.listen(PORT, HOST, () => console.log(`MovieHub running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
}
export { server };
