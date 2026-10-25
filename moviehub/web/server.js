// MovieHub web: serves the UI and proxies the ISP media server (avoids CORS / mixed-content limits).
// Zero dependencies. Run: node server.js   then open http://localhost:8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { parseListing, srtToVtt, extOf } from './listing.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
const CONFIG_FILE = path.join(here, 'config.json');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1'; // set HOST=0.0.0.0 to open it to your home network

const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml', json: 'application/json',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime',
  avi: 'video/x-msvideo', ts: 'video/mp2t', mpg: 'video/mpeg', mpeg: 'video/mpeg', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
};

function loadConfig() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { /* first run */ }
  return {
    serverUrl: process.env.SERVER_URL || c.serverUrl || '',
    username: process.env.SERVER_USER ?? c.username ?? '',
    password: process.env.SERVER_PASS ?? c.password ?? '',
  };
}
let config = loadConfig();

function baseUrl() {
  if (!config.serverUrl) return null;
  const u = new URL(/^https?:\/\//i.test(config.serverUrl) ? config.serverUrl : 'http://' + config.serverUrl);
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  u.search = ''; u.hash = '';
  return u;
}

function upstreamHeaders(extra = {}) {
  const h = { 'user-agent': 'MovieHub/1.0', ...extra };
  if (config.username) h.authorization = 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return h;
}

/** Resolve a client-supplied relative path against the library root; refuse anything outside it. */
function resolveUnderBase(rel) {
  const base = baseUrl();
  if (!base) throw httpError(400, 'Server URL is not configured');
  const u = new URL(String(rel || '').replace(/^\/+/, ''), base);
  if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname)) throw httpError(400, 'Path outside library');
  return { base, url: u };
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

async function handleBrowse(url, res) {
  const { base, url: dir } = resolveUnderBase(url.searchParams.get('path'));
  if (!dir.pathname.endsWith('/')) dir.pathname += '/';
  let up;
  try { up = await fetch(dir, { headers: upstreamHeaders(), signal: AbortSignal.timeout(15000) }); }
  catch (e) { throw httpError(502, `Cannot reach server: ${e.cause?.code || e.message}`); }
  if (up.status === 401) throw httpError(401, 'Server requires a username and password');
  if (!up.ok) throw httpError(502, `Server answered ${up.status}`);
  const items = parseListing(await up.text(), dir.href, base.href);
  json(res, 200, { path: dir.pathname.slice(base.pathname.length), items });
}

async function handleStream(req, url, res) {
  const { url: target } = resolveUnderBase(url.searchParams.get('path'));
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  const range = req.headers.range;
  let up;
  try { up = await fetch(target, { headers: upstreamHeaders(range ? { range } : {}), signal: ac.signal }); }
  catch (e) { if (ac.signal.aborted) return; throw httpError(502, `Cannot reach server: ${e.cause?.code || e.message}`); }
  const headers = { 'accept-ranges': 'bytes', 'content-type': MIME[extOf(target.pathname)] || up.headers.get('content-type') || 'application/octet-stream' };
  for (const k of ['content-length', 'content-range', 'last-modified', 'etag']) if (up.headers.get(k)) headers[k] = up.headers.get(k);
  res.writeHead(up.status, headers);
  if (!up.body || req.method === 'HEAD') return res.end();
  Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
}

async function handleSubs(url, res) {
  const { url: target } = resolveUnderBase(url.searchParams.get('path'));
  const up = await fetch(target, { headers: upstreamHeaders(), signal: AbortSignal.timeout(15000) });
  if (!up.ok) throw httpError(404, 'Subtitle not found');
  const text = Buffer.from(await up.arrayBuffer()).toString('utf8');
  res.writeHead(200, { 'content-type': 'text/vtt; charset=utf-8' });
  res.end(extOf(target.pathname) === 'srt' ? srtToVtt(text) : text);
}

async function handleConfig(req, res) {
  if (req.method === 'POST') {
    const b = JSON.parse((await readBody(req)) || '{}');
    config = { serverUrl: String(b.serverUrl || '').trim(), username: String(b.username || ''), password: b.keepPassword ? config.password : String(b.password || '') };
    if (config.serverUrl) { try { baseUrl(); } catch { throw httpError(400, 'Invalid server URL'); } }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  json(res, 200, { serverUrl: config.serverUrl, username: config.username, hasPassword: !!config.password });
}

function serveStatic(url, res) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, { 'content-type': MIME[extOf(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/browse') return await handleBrowse(url, res);
    if (url.pathname === '/api/config') return await handleConfig(req, res);
    if (url.pathname === '/stream') return await handleStream(req, url, res);
    if (url.pathname === '/subs') return await handleSubs(url, res);
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
