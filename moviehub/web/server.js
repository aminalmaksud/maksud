// MusingsofMaksudTV: serves the UI and proxies the ISP media server. Used by the Mac app (mac/), the Windows app
// (windows/) and runnable on its own: `node server.js`, then open http://localhost:8080
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseListing, srtToVtt, extOf, canonPath, VIDEO_EXT, mediaKind } from './listing.js';
import { openZip } from './zip.js';
import { hasFfmpeg, ffmpegVersion, probe, remux, extractSubtitle, keyframeBefore, audioAsMp3, embeddedArt } from './media.js';
import { crawlFiles, buildSeries, seasonName } from './shows.js';
import { metaFor, metaForShow, seasonEpisodes, tmdbById, findByImdb, searchTmdb, castOf, forgetMeta } from './meta.js';
import { createJellyfin } from './jellyfin.js';
import { loadPlaylist, forgetPlaylists } from './iptv.js';
import { albumById, searchAlbums } from './audiodb.js';
import { bookById, bookByIsbn, searchBooks } from './books.js';
import { movieHash, searchSubtitles, fetchSubtitle } from './subsearch.js';
import { groupKey, mergeListings, encodeV, decodeV } from './merge.js';
import { downloadsEnabled, startDownload, cancelDownload, deleteDownloaded, listDownloads, localEntries, localFile } from './downloads.js';

// WEB_ROOT is set by the Windows app, whose bundled server has no file of its own to sit next to.
const here = process.env.WEB_ROOT || (import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : path.dirname(process.execPath));
const PUBLIC = path.join(here, 'public');
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(here, 'config.json');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1'; // set HOST=0.0.0.0 to open it to your home network
// BRAND=streamhub (set by the Windows app) switches the UI to the StreamHub look; see public/streamhub.css.
const BRAND = process.env.BRAND === 'streamhub' ? 'streamhub' : '';
const started = Date.now();

const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml', json: 'application/json', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime',
  avi: 'video/x-msvideo', ts: 'video/mp2t', mpg: 'video/mpeg', mpeg: 'video/mpeg', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
  mp3: 'audio/mpeg', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', wma: 'audio/x-ms-wma', ape: 'audio/x-ape', aiff: 'audio/aiff', aif: 'audio/aiff', mka: 'audio/x-matroska',
  pdf: 'application/pdf', epub: 'application/epub+zip', cbz: 'application/vnd.comicbook+zip', xhtml: 'application/xhtml+xml; charset=utf-8', htm: 'text/html; charset=utf-8', gif: 'image/gif', ncx: 'application/x-dtbncx+xml', opf: 'application/oebps-package+xml', otf: 'font/otf', ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2',
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
    // online subtitles (see subsearch.js)
    opensubsKey: c.opensubsKey ?? '', opensubsUser: c.opensubsUser ?? '', opensubsPass: c.opensubsPass ?? '', subdlKey: c.subdlKey ?? '',
    shareTv: !!c.shareTv, // share local folders with the Android TV app (see shareServer)
    infoIds: c.infoIds && typeof c.infoIds === 'object' ? c.infoIds : {}, // albums and books matched by hand: address -> { kind, id }
    audiodbKey: c.audiodbKey ?? '', googleBooksKey: c.googleBooksKey ?? '',
    metaIds: c.metaIds && typeof c.metaIds === 'object' ? c.metaIds : {}, // titles the user matched by hand: address -> { type, id } (TMDB)
    playlists: splitServers(c.playlists), // Live TV: M3U playlists, one per line (see iptv.js)
    jellyfin: !!c.jellyfin, jellyfinPass: c.jellyfinPass ?? '', // Jellyfin-compatible API for Jellyfin apps (see jellyfin.js)
  };
}
let config = loadConfig();

/** A server line is "http://host/path/" or "Label | http://host/path/". */
const LIB_TYPES = ['auto', 'movies', 'shows', 'music', 'books'];
/** "Name | address | type": the name and the type are optional ("movies", "shows", "music", "books"; "auto" guesses from the folders). */
function splitLabel(s) {
  const parts = String(s).split('|').map((x) => x.trim());
  let type = 'auto';
  if (parts.length >= 3 && LIB_TYPES.includes(parts.at(-1).toLowerCase())) type = parts.pop().toLowerCase();
  if (parts.length >= 2) return { label: parts[0], url: parts.slice(1).join('|'), type };
  return { label: '', url: parts[0], type };
}

/** A folder on this computer: "G:\\Movie", "/Users/me/Movies", "~/Movies" or "file:///...". */
const isFolderPath = (s) => /^(?:[a-z]:[\\/]|\\\\|\/|~[\\/]|file:)/i.test(s);
function toBase(line) {
  const s = splitLabel(line).url;
  if (isFolderPath(s)) {
    const u = /^file:/i.test(s) ? new URL(s) : pathToFileURL(path.resolve(s.replace(/^~(?=[\\/])/, process.env.HOME || process.env.USERPROFILE || '~')));
    if (!u.pathname.endsWith('/')) u.pathname += '/';
    return u;
  }
  const u = new URL(/^https?:\/\//i.test(s) ? s : 'http://' + s);
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  u.search = ''; u.hash = '';
  return u;
}
const bases = () => config.servers.map(toBase);
const libTypes = () => config.servers.map((l) => splitLabel(l).type);
const isLocalBase = (b) => b.protocol === 'file:';
const localLibs = () => bases().map((b, i) => (isLocalBase(b) ? i : -1)).filter((i) => i >= 0);
/** Real path of a file:// URL inside a local library, or an error if it (or a symlink in it) leads outside. */
function localPathIn(base, u) {
  const root = fs.realpathSync(fileURLToPath(base));
  let real;
  try { real = fs.realpathSync(fileURLToPath(u)); } catch { throw httpError(404, 'Not found on this PC'); }
  if (real !== root && !real.startsWith(root.endsWith(path.sep) ? root : root + path.sep)) throw httpError(400, 'Path outside library');
  return real;
}
const serverNames = () => config.servers.map((line, i) => splitLabel(line).label
  || (isLocalBase(bases()[i]) ? path.basename(fileURLToPath(bases()[i])) || fileURLToPath(bases()[i])
    : decodeURIComponent(bases()[i].host + bases()[i].pathname).replace(/\/$/, '').replace(/\//g, ' / ')));

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
  const { base, url } = resolveUnderBase(rel);
  if (isLocalBase(base)) return { src: localPathIn(base, url), auth: '', local: true, ext: extOf(url.pathname), url };
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

// Windows and macOS keep these in every drive or home folder; they're never media.
const SKIP_LOCAL = /^(?:\$recycle\.bin|system volume information|recovery|config\.msi|msocache|\$windows\.~bt|found\.\d+|thumbs\.db|desktop\.ini|lost\+found)$/i;
/** A local folder's entries as h5ai-style { href } items, ready for parseListing (same paths as a server listing). */
function listLocalFolder(base, dir) {
  const real = localPathIn(base, dir);
  let entries;
  try { entries = fs.readdirSync(real, { withFileTypes: true }); } catch (e) { throw httpError(e.code === 'ENOENT' ? 404 : 403, `Can't open this folder: ${e.code || e.message}`); }
  return entries.filter((e) => !e.name.startsWith('.') && !SKIP_LOCAL.test(e.name)).flatMap((e) => {
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) { try { isDir = fs.statSync(path.join(real, e.name)).isDirectory(); } catch { return []; } }
    return [{ href: dir.pathname + encodeURIComponent(e.name) + (isDir ? '/' : '') }];
  });
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
    if (isLocalBase(base)) {
      const items = parseListing(linksHtml(listLocalFolder(base, dir)), dir.href, base.href);
      for (const it of items) it.path = `${idx}/${it.path}`;
      return { path: relOf(idx, base, dir), items };
    }
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
    const dirs = listing.items.filter((i) => i.isDir), files = listing.items.filter((i) => i.kind === 'video' || i.kind === 'audio' || i.kind === 'book');
    // Only wrapper-style names ("DHAKA-FLIX-7", "data"): a lone "English Movies" is a real category.
    if (dirs.length !== 1 || files.length || /\s/.test(dirs[0].name)) break;
    listing = await listDir(dirs[0].path);
  }
  libRoots.set(idx, listing);
  return listing;
}

/** Libraries with the same name apart from quality ("Movies", "Movies 1080p") form one section. */
function groups() {
  const names = serverNames(), out = new Map();
  names.forEach((name, i) => {
    const k = groupKey(name);
    if (!out.has(k)) out.set(k, { name, libs: [], type: 'auto' });
    const g = out.get(k);
    g.libs.push(i);
    if (g.type === 'auto') g.type = libTypes()[i];
    if (name.length < g.name.length) g.name = name;
  });
  return [...out.values()];
}
const groupRoot = (g, roots) => (g.libs.length > 1 ? encodeV(g.libs.map((i) => roots[i])) : roots[g.libs[0]]);

/** A virtual folder: the same folder on several libraries, listed as one. */
async function listVirtual(rel, refresh) {
  const sources = decodeV(rel);
  if (!sources) throw httpError(400, 'Unknown folder');
  const names = serverNames();
  const got = await Promise.allSettled(sources.map((p) => {
    resolveUnderBase(p);
    if (refresh) listCache.delete(p);
    return /^\d+\/$/.test(p) ? libraryRoot(Number(p.slice(0, -1))) : listDir(p);
  }));
  const ok = got.map((g, i) => (g.status === 'fulfilled' ? { items: g.value.items, label: names[libOf(sources[i])] } : null)).filter(Boolean);
  if (!ok.length) throw got[0].reason;
  return { path: rel, items: mergeListings(ok), sources };
}
const libOf = (p) => Number(String(p).split('/')[0]);

/* ---- "TV series" libraries: episodes grouped by what the files say (shows.js), shown as series > seasons > episodes ---- */
const showIdx = new Map(); // library root -> { at, crawl, series, n, done }
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function showsIndex(rootRel) {
  let e = showIdx.get(rootRel);
  if (!e || Date.now() - e.at > 30 * 60e3) { e = { at: Date.now(), crawl: crawlFiles(rootRel, childrenOf), series: [], n: -1, done: false }; showIdx.set(rootRel, e); }
  return e;
}
/** The series of a library, waiting a little for the first scan; `done` is false while it is still going. */
async function showsSeries(rootRel, waitMs = 12000) {
  const e = showsIndex(rootRel);
  if (!e.crawl.done) await Promise.race([e.crawl.finished, delay(waitMs)]);
  if (e.n !== e.crawl.files.length || e.done !== e.crawl.done) { e.series = buildSeries(e.crawl.files, rootRel); e.n = e.crawl.files.length; e.done = e.crawl.done; }
  return { series: e.series, done: e.crawl.done, listed: e.crawl.listed, truncated: e.crawl.truncated };
}
const showSeg = (rel) => /^(show:[0-9a-f]+)\//.exec(rel)?.[1] || null;
const showPath = (s) => `${'show:' + s.id}/${encodeURIComponent(s.year ? `${s.title} (${s.year})` : s.title)}/`;
/** A series by the id in a "show:<id>/…" path, even after a restart (then the typed libraries are scanned again). */
async function findShow(rel) {
  const id = showSeg(rel)?.slice(5);
  if (!id) throw httpError(404, 'Unknown series');
  const look = () => { for (const e of showIdx.values()) { const s = e.series.find((x) => x.id === id); if (s) return s; } return null; };
  let s = look();
  if (!s) {
    const roots = await Promise.all(libraryRoots());
    for (const g of groups()) if (g.type === 'shows') await showsSeries(groupRoot(g, roots));
    s = look();
  }
  if (!s) throw httpError(404, 'Unknown series');
  return s;
}
const libraryRoots = () => bases().map((_, i) => libraryRoot(i).then((l) => l.path, () => `${i}/`));
/** The episodes of the grouped show a file belongs to, in watching order (every season), for Previous and Next episode. */
function showQueue(rel) {
  for (const e of showIdx.values()) {
    for (const s of e.series) {
      const eps = s.seasons.flatMap((x) => x.episodes);
      if (eps.some((x) => x.path === rel)) return { items: eps.map((x) => x.entry), show: s.id };
    }
  }
  return null;
}
async function listShowsRoot(rel) {
  const r = await showsSeries(rel);
  return { path: rel, items: r.series.map((s) => ({ name: s.year ? `${s.title} (${s.year})` : s.title, path: showPath(s), isDir: true, kind: 'dir' })), scanning: !r.done, scanned: r.listed };
}
async function listShow(rel) {
  const s = await findShow(rel);
  const season = decodeURIComponent(rel.split('/')[2] || '');
  if (!season) return { path: rel, items: s.seasons.map((x) => ({ name: seasonName(x.n), path: `${showPath(s)}${encodeURIComponent(seasonName(x.n))}/`, isDir: true, kind: 'dir' })) };
  const n = /^specials$/i.test(season) ? 0 : Number(/\d+/.exec(season)?.[0]);
  const sn = s.seasons.find((x) => x.n === n);
  if (!sn) throw httpError(404, 'Unknown season');
  return { path: rel, items: sn.episodes.map((e) => e.entry) };
}

async function handleBrowse(url, res) {
  const all = bases();
  const servers = serverNames();
  if (!all.length) throw httpError(400, 'Server URL is not configured');
  let rel = url.searchParams.get('path') || '';
  if (rel === 'local/') return json(res, 200, { path: 'local/', items: localEntries(), servers, roots: [], groups: [] });
  const refresh = !!url.searchParams.get('refresh');
  if (refresh) { listCache.delete(rel); libRoots.clear(); showIdx.clear(); }
  const roots = await Promise.all(all.map((_, i) => libraryRoot(i).then((l) => l.path, () => `${i}/`)));
  const gs = groups().map((g) => ({ ...g, root: groupRoot(g, roots) }));
  const extra = { servers, roots, groups: gs, localLibs: localLibs() };
  const rootTypeOf = (r) => { const t = gs.find((g) => g.root === r)?.type; return t && t !== 'auto' ? t : undefined; };
  if (!rel && gs.length > 1) {
    return json(res, 200, { path: '', ...extra, items: gs.map((g) => ({ name: g.name, path: g.root, isDir: true, kind: 'dir' })) });
  }
  if (!rel) rel = gs[0].root;
  if (rel.startsWith('show:')) return json(res, 200, { ...(await listShow(rel)), ...extra });
  const real = !!url.searchParams.get('real'); // the folder as it is on disk, not the grouped list of shows (the player wants its subtitle files)
  if (!real && gs.some((g) => g.root === rel && g.type === 'shows')) return json(res, 200, { ...(await listShowsRoot(rel)), ...extra, rootType: 'shows' });
  if (rel.startsWith('v:')) return json(res, 200, { ...(await listVirtual(rel, refresh)), ...extra, rootType: rootTypeOf(rel) });
  if (!rel.endsWith('/')) rel += '/';
  if (!real && gs.some((g) => g.root === rel && g.type === 'shows')) return json(res, 200, { ...(await listShowsRoot(rel)), ...extra, rootType: 'shows' });
  const listing = /^\d+\/$/.test(rel) ? await libraryRoot(Number(rel.slice(0, -1))) : await listDir(rel);
  json(res, 200, { ...listing, ...extra, rootType: rootTypeOf(rel) });
}

/** Search every library. h5ai servers search themselves; others are skipped (their folders can still be filtered). */
async function handleSearch(url, res) {
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return json(res, 200, { items: [] });
  const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '.*');
  const all = bases();
  await Promise.all(all.map((_, i) => libraryRoot(i).catch(() => null)));
  const results = await Promise.all(all.map(async (base, idx) => {
    if (isLocalBase(base)) return searchLocal(base, idx, new RegExp(pattern, 'i'));
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
      const kind = isDir ? 'dir' : mediaKind(name);
      if (kind) found.push({ name, path: relOf(idx, base, u), isDir, kind, library: serverNames()[idx] });
    }
    return found;
  }));
  // Folders first (each movie usually lives in its own folder), then loose videos. A video whose folder
  // is already listed would just be the same movie twice. The same movie on two libraries of one
  // section (720p and 1080p) is one result.
  const flat = results.flat();
  const dirs = new Set(flat.filter((i) => i.isDir).map((i) => i.path));
  const keep = (i) => i.isDir || !dirs.has(i.path.replace(/[^/]+$/, ''));
  const items = groups().flatMap((g) => mergeListings(g.libs.map((i) => ({ items: results[i].filter(keep), label: serverNames()[i] })))
    .map((it) => ({ ...it, library: g.name })))
    .sort((a, b) => Number(b.isDir) - Number(a.isDir)).slice(0, 120);
  json(res, 200, { items, searchable: all.some((b) => h5aiHosts.has(b.origin) || isLocalBase(b)) });
}

const localWalks = new Map(); // library root -> { at, entries: [{ name, path (file URL), isDir }] }
/** Folders and videos in a local library whose name matches, found by walking it (4 levels, cached a few minutes). */
function searchLocal(base, idx, re) {
  let walk = localWalks.get(base.href);
  if (!walk || Date.now() - walk.at > LIST_TTL) {
    const entries = [];
    const visit = (dirUrl, depth) => {
      let kids;
      try { kids = listLocalFolder(base, dirUrl); } catch { return; }
      for (const k of kids) {
        if (entries.length > 20000) return;
        const u = new URL(k.href, dirUrl);
        const isDir = k.href.endsWith('/');
        entries.push({ u, isDir, name: decodeURIComponent(u.pathname.replace(/\/$/, '').split('/').pop()) });
        if (isDir && depth < 4) visit(u, depth + 1);
      }
    };
    visit(base, 1);
    walk = { at: Date.now(), entries };
    localWalks.set(base.href, walk);
  }
  return walk.entries.filter((e) => re.test(e.name) && (e.isDir || mediaKind(e.name)))
    .map((e) => ({ name: e.name, path: relOf(idx, base, e.u), isDir: e.isDir, kind: e.isDir ? 'dir' : mediaKind(e.name), library: serverNames()[idx] }));
}

/** POST /api/pick-folder: the system's folder picker (Windows and Mac apps). Answers { path } or { path: '' } if cancelled. */
async function handlePickFolder(req, res) {
  if (req.method !== 'POST') throw httpError(405, 'Use POST');
  const cmd = process.platform === 'win32'
    ? ['powershell.exe', ['-NoProfile', '-STA', '-Command',
      // A hidden topmost window owns the dialog so it opens in front of the app.
      'Add-Type -AssemblyName System.Windows.Forms; $o = New-Object System.Windows.Forms.Form -Property @{TopMost=$true; ShowInTaskbar=$false; Opacity=0}; $o.Show(); $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = "Choose a folder with movies or series"; $d.ShowNewFolderButton = $false; if ($d.ShowDialog($o) -eq "OK") { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $d.SelectedPath }; $o.Close()']]
    : process.platform === 'darwin'
      ? ['osascript', ['-e', 'POSIX path of (choose folder with prompt "Choose a folder with movies or series")']]
      : null;
  if (!cmd) throw httpError(501, 'Type the folder path instead');
  const out = await new Promise((resolve) => {
    const p = spawn(cmd[0], cmd[1], { windowsHide: true });
    let o = '';
    p.stdout.on('data', (d) => (o += d));
    p.on('error', () => resolve(''));
    p.on('close', () => resolve(o.trim()));
  });
  json(res, 200, { path: out.replace(/\/$/, '') && out.replace(/(.)[\\/]$/, '$1') });
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

/** A subtitle file's text and type (old SRTs are often Windows-1252, so those are re-read as Latin-1). */
async function subtitleText(rel) {
  const m = media(rel);
  let buf;
  if (m.local) buf = fs.readFileSync(m.src);
  else {
    const up = await fetch(m.src, { headers: upstreamHeaders(), signal: AbortSignal.timeout(15000) });
    if (!up.ok) throw httpError(404, 'Subtitle not found');
    buf = Buffer.from(await up.arrayBuffer());
  }
  let text = buf.toString('utf8');
  if (text.includes('�')) text = buf.toString('latin1');
  return { text: text.replace(/^﻿/, ''), ext: m.ext };
}
async function handleSubs(url, res) {
  const { text, ext } = await subtitleText(url.searchParams.get('path'));
  res.writeHead(200, { 'content-type': 'text/vtt; charset=utf-8' });
  res.end(ext === 'srt' ? srtToVtt(text) : text);
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

/** Live TV channels from every playlist: { channels: [{ id, name, logo, group }], errors }. */
async function channelsOf(refresh) {
  const errors = [], channels = [], seen = new Set();
  const got = await Promise.allSettled(config.playlists.map((l) => loadPlaylist(l, { force: refresh })));
  got.forEach((g, i) => {
    if (g.status === 'rejected') return errors.push(`${config.playlists[i]}: ${g.reason.message}`);
    for (const c of g.value) if (!seen.has(c.id)) { seen.add(c.id); channels.push(c); }
  });
  return { channels, errors };
}
async function handleIptv(url, res) {
  const { channels, errors } = await channelsOf(!!url.searchParams.get('refresh'));
  json(res, 200, { channels: channels.map(({ id, name, logo, group }) => ({ id, name, logo, group })), errors });
}
/** A live channel as one continuous stream the browser can play (Matroska, or MP4 for engines that need it). Not seekable. */
async function handleLive(url, res) {
  const ch = (await channelsOf(false)).channels.find((c) => c.id === url.searchParams.get('id'));
  if (!ch) throw httpError(404, 'Unknown channel');
  if (!hasFfmpeg) throw httpError(501, 'Live TV needs ffmpeg');
  // What's in the stream decides whether the picture can be copied. If the channel won't say, assume the usual H.264 and AAC.
  const info = await probe(ch.url, '').catch(() => ({ video: { transcode: false }, audio: [{}], duration: 0 }));
  const mp4 = url.searchParams.get('fmt') === 'mp4';
  const p = remux(ch.url, '', { info, format: mp4 ? 'mp4' : 'mkv', live: true });
  let err = '';
  p.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
  res.on('close', () => p.kill('SIGKILL'));
  p.on('close', (code) => { if (code && !res.writableEnded) console.error('live:', ch.name, err.trim()); });
  res.writeHead(200, { 'content-type': mp4 ? 'video/mp4' : 'video/webm', 'cache-control': 'no-store' });
  p.stdout.pipe(res);
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

/** Where a hand-picked match is kept: the title's real address, so reordering libraries doesn't lose it. */
function metaKeyOf(rel) {
  if (showSeg(rel)) return showSeg(rel);
  if (!rel || rel.startsWith('local/')) return null;
  try { return resolveUnderBase(rel).url.href; } catch { return null; }
}
/** The match picked by hand for this folder or file, or for the nearest folder above it (an episode follows its series). */
function pinnedFor(rel) {
  if (showSeg(rel)) return config.metaIds[showSeg(rel)] || null;
  const segs = rel.replace(/\/$/, '').split('/');
  for (let n = segs.length; n >= 2; n--) {
    const r = segs.slice(0, n).join('/') + (n === segs.length && !rel.endsWith('/') ? '' : '/');
    const hit = config.metaIds[metaKeyOf(r)];
    if (hit) return hit;
  }
  return null;
}
const metaOf = async (rel) => {
  if (showSeg(rel)) { const s = await findShow(rel); return metaForShow(config.tmdbKey, s, config.tmdbKey ? pinnedFor(rel) : null); }
  return metaFor(rel, async (dir) => (await listDir(dir)).items, config.tmdbKey, pinnedFor);
};
function metaPathOf(url) {
  let rel = url.searchParams.get('path') || '';
  if (rel.startsWith('v:')) rel = decodeV(rel)?.[0] || ''; // a joined folder: its first copy has the poster as well as any
  if (!rel.startsWith('local/') && !showSeg(rel)) resolveUnderBase(rel);
  return rel;
}
async function handleMeta(url, res) {
  json(res, 200, await metaOf(metaPathOf(url)));
}
/** Cast, director, genres and the IMDb id for the title's page. */
async function handleCast(url, res) {
  const m = await metaOf(metaPathOf(url));
  if (!config.tmdbKey || !m?.tmdbId) return json(res, 200, { tmdbId: null, cast: [], director: [] });
  const c = await castOf(config.tmdbKey, m.tmdbType, m.tmdbId);
  json(res, 200, { tmdbId: m.tmdbId, tmdbType: m.tmdbType, pinned: !!pinnedFor(metaPathOf(url)), ...c });
}
/* ---- albums (TheAudioDB) and books (Google Books): what they are, and matching them by hand ---- */
const cleanTitle = (n) => decodeURIComponent(n).replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').replace(/[([]\s*(?:19|20)\d{2}\s*[)\]]/g, '').replace(/\s+/g, ' ').trim();
const looksIsbn = (v) => /^(?:97[89][\s-]?)?\d[\d\s-]{8,14}[\dXx]$/.test(String(v).trim()) && String(v).replace(/[^0-9Xx]/g, '').length >= 10;
async function infoById(kind, id) {
  return kind === 'album' ? albumById(config.audiodbKey, id) : bookById(config.googleBooksKey, id);
}
async function autoInfo(kind, rel) {
  const segs = rel.replace(/\/$/, '').split('/');
  const last = cleanTitle(segs.at(-1) || '');
  if (!last) return null;
  if (kind === 'album') {
    const artist = segs.length >= 3 ? cleanTitle(segs.at(-2)) : '';
    if (!artist) return null;
    const hits = await searchAlbums(config.audiodbKey, artist, last).catch(() => []);
    return hits[0] || null;
  }
  const hits = await searchBooks(config.googleBooksKey, last).catch(() => []);
  return hits[0] || null;
}
async function handleInfo(url, res) {
  const kind = url.searchParams.get('kind') === 'book' ? 'book' : 'album';
  const rel = metaPathOf(url);
  const k = metaKeyOf(rel), pin = k && config.infoIds[k];
  let info = null;
  try { info = pin && pin.kind === kind ? await infoById(kind, pin.id) : await autoInfo(kind, rel); } catch (e) { return json(res, 200, { info: null, error: e.message }); }
  json(res, 200, { info, pinned: !!pin });
}
async function handleInfoSearch(url, res) {
  const kind = url.searchParams.get('kind') === 'book' ? 'book' : 'album';
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return json(res, 200, { results: [] });
  let list = [];
  if (kind === 'album') {
    const [a, b] = q.split(/\s+-\s+/);
    list = await searchAlbums(config.audiodbKey, a, b || '');
  } else if (looksIsbn(q)) {
    const one = await bookByIsbn(config.googleBooksKey, q);
    list = one ? [one] : [];
  } else list = await searchBooks(config.googleBooksKey, q);
  json(res, 200, { results: list.slice(0, 12).map((x) => ({ id: x.id, type: kind, title: kind === 'album' ? `${x.title}${x.artist ? ' · ' + x.artist : ''}` : x.title, year: x.year, poster: x.cover, overview: kind === 'album' ? x.genre : x.authors.join(', ') })) });
}
async function handleInfoId(req, res) {
  const b = JSON.parse((await readBody(req)) || '{}');
  const kind = b.kind === 'book' ? 'book' : 'album';
  let rel = String(b.path || '');
  if (rel.startsWith('v:')) rel = decodeV(rel)?.[0] || '';
  const k = metaKeyOf(rel);
  if (!k) throw httpError(400, 'This item can’t be matched by hand');
  if (b.clear) delete config.infoIds[k];
  else {
    const raw = String(b.id || b.isbn || '').trim();
    let info = null;
    if (kind === 'album') {
      const id = /(\d{3,})/.exec(raw)?.[1];
      if (!id) throw httpError(400, 'Give a TheAudioDB album id (a number) or its address');
      info = await albumById(config.audiodbKey, id).catch((e) => { throw httpError(502, e.message); });
    } else if (looksIsbn(raw)) {
      info = await bookByIsbn(config.googleBooksKey, raw).catch((e) => { throw httpError(502, e.message); });
    } else {
      const id = /[?&]id=([\w-]{6,})/.exec(raw)?.[1] || /^([\w-]{6,})$/.exec(raw)?.[1];
      if (!id) throw httpError(400, 'Give a Google Books id, its address, or an ISBN');
      info = await bookById(config.googleBooksKey, id).catch((e) => { throw httpError(502, e.message); });
    }
    if (!info) throw httpError(404, kind === 'album' ? 'TheAudioDB doesn’t know that album' : 'Google Books doesn’t know that book');
    config.infoIds[k] = { kind, id: info.id };
  }
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  json(res, 200, { ok: true });
}
/** Search TMDB by name, for the "pick the right title" dialog. */
async function handleMetaSearch(url, res) {
  if (!config.tmdbKey) throw httpError(400, 'Add a TMDB key in Settings first');
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return json(res, 200, { results: [] });
  json(res, 200, { results: await searchTmdb(config.tmdbKey, q, url.searchParams.get('type') || '') });
}
/** Pin a title to a TMDB id (or an IMDb id), or clear the pin: POST { path, tmdb?, imdb?, type?, clear? }. */
async function handleMetaId(req, res) {
  if (!config.tmdbKey) throw httpError(400, 'Add a TMDB key in Settings first');
  const b = JSON.parse((await readBody(req)) || '{}');
  let rel = String(b.path || '');
  if (rel.startsWith('v:')) rel = decodeV(rel)?.[0] || '';
  const k = metaKeyOf(rel);
  if (!k) throw httpError(400, 'This item can’t be matched by hand');
  if (b.clear) delete config.metaIds[k];
  else {
    let type = b.type === 'tv' ? 'tv' : b.type === 'movie' ? 'movie' : '', id = '';
    const imdb = /tt\d{5,10}/i.exec(String(b.imdb || ''));
    const raw = String(b.tmdb || '').trim();
    const url = /themoviedb\.org\/(movie|tv)\/(\d+)/i.exec(raw);
    if (url) { type = url[1].toLowerCase(); id = url[2]; }
    else if (/^\d+$/.test(raw)) id = raw;
    else if (imdb) {
      const f = await findByImdb(config.tmdbKey, imdb[0].toLowerCase());
      if (!f) throw httpError(404, 'TMDB has no title with that IMDb id');
      type = f.type; id = String(f.id);
    } else throw httpError(400, 'Give a TMDB id, a themoviedb.org address or an IMDb id (tt1234567)');
    // an id alone doesn't say movie or series: try the likelier one first, then the other
    const tries = type ? [type] : [/(S\d{1,2}|season|\(TV)/i.test(rel) ? 'tv' : 'movie', /(S\d{1,2}|season|\(TV)/i.test(rel) ? 'movie' : 'tv'];
    let found = null;
    for (const t of tries) { if (await tmdbById(config.tmdbKey, t, id)) { found = t; break; } }
    if (!found) throw httpError(404, 'TMDB doesn’t know that id');
    config.metaIds[k] = { type: found, id: Number(id) };
  }
  forgetMeta();
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  json(res, 200, await metaOf(rel));
}

/** Plots and titles for the episodes of one season of a series (TMDB). `path` is the season folder or one of its files. */
async function handleEpisodes(url, res) {
  let rel = url.searchParams.get('path') || '';
  const season = Number(url.searchParams.get('season'));
  if (rel.startsWith('v:')) rel = decodeV(rel)?.[0] || '';
  if (!rel.startsWith('local/') && !showSeg(rel)) resolveUnderBase(rel);
  if (!config.tmdbKey || !Number.isInteger(season) || season < 0 || season > 99) return json(res, 200, { episodes: [] });
  const m = await metaOf(rel).catch(() => null);
  if (!m?.tmdbId || m.tmdbType !== 'tv') return json(res, 200, { episodes: [] });
  const r = await seasonEpisodes(config.tmdbKey, m.tmdbId, season);
  json(res, 200, { episodes: r?.episodes || [], poster: r?.poster || null });
}

/* ---- books (EPUB and CBZ are zips) and audio ---- */
const zipCache = new Map(); // path -> Promise<zip>, newest last; only a few are kept because each holds the whole file
async function zipFor(rel) {
  if (rel.startsWith('v:')) rel = decodeV(rel)?.[0] || '';
  if (!zipCache.has(rel)) {
    const job = (async () => {
      const m = media(rel);
      let buf;
      if (m.local) buf = fs.readFileSync(m.src);
      else {
        const up = await fetch(m.src, { headers: upstreamHeaders(), signal: AbortSignal.timeout(180000) });
        if (!up.ok) throw httpError(502, `Server answered ${up.status}`);
        if (Number(up.headers.get('content-length') || 0) > 250e6) throw httpError(413, 'This file is too big to open here');
        buf = Buffer.from(await up.arrayBuffer());
      }
      return openZip(buf);
    })();
    job.catch(() => zipCache.delete(rel));
    zipCache.set(rel, job);
    while (zipCache.size > 2) zipCache.delete(zipCache.keys().next().value);
  } else { const j = zipCache.get(rel); zipCache.delete(rel); zipCache.set(rel, j); }
  return zipCache.get(rel);
}
const attr = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(1).find((x) => x !== undefined);
const unent = (t) => String(t).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const zdecode = (p) => { try { return decodeURIComponent(p); } catch { return p; } };
const joinZip = (dir, href) => { const out = []; for (const seg of (dir + href).split('/')) { if (seg === '..') out.pop(); else if (seg && seg !== '.') out.push(seg); } return out.join('/'); };
const b64 = (s) => Buffer.from(s).toString('base64url');

/** An EPUB's title, reading order and contents list. Chapters are then fetched from /epub/<id>/<file in the book>. */
async function handleEpub(url, res) {
  let rel = url.searchParams.get('path') || '';
  if (!rel.startsWith('local/')) resolveUnderBase(rel.startsWith('v:') ? decodeV(rel)?.[0] || '' : rel);
  const zip = await zipFor(rel);
  const container = zip.read('META-INF/container.xml')?.toString('utf8');
  const opfPath = container && attr(/<rootfile\b[^>]*>/i.exec(container)?.[0] || '', 'full-path');
  const opf = opfPath && zip.read(opfPath)?.toString('utf8');
  if (!opf) throw httpError(422, 'This EPUB can’t be read');
  const dir = opfPath.replace(/[^/]*$/, '');
  const manifest = new Map();
  for (const t of opf.match(/<item\b[^>]*>/gi) || []) manifest.set(attr(t, 'id'), { href: joinZip(dir, zdecode(attr(t, 'href') || '')), type: attr(t, 'media-type') || '', props: attr(t, 'properties') || '' });
  const spine = [...opf.matchAll(/<itemref\b[^>]*>/gi)].map((m) => manifest.get(attr(m[0], 'idref'))).filter((x) => x && /html/.test(x.type)).map((x) => x.href);
  const toc = [];
  const nav = [...manifest.values()].find((x) => /\bnav\b/.test(x.props));
  const ncx = [...manifest.values()].find((x) => /ncx/.test(x.type));
  const addLink = (base, href, title) => { if (title && href) { const [f, frag] = zdecode(href).split('#'); toc.push({ title, href: joinZip(base, f) + (frag ? `#${frag}` : '') }); } };
  if (nav) {
    const html = zip.read(nav.href)?.toString('utf8') || '', base = nav.href.replace(/[^/]*$/, '');
    const tocNav = /<nav\b[^>]*epub:type\s*=\s*["'][^"']*toc[^"']*["'][\s\S]*?<\/nav>/i.exec(html)?.[0] || html;
    for (const m of tocNav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) addLink(base, attr(m[1], 'href'), unent(m[2]));
  } else if (ncx) {
    const xml = zip.read(ncx.href)?.toString('utf8') || '', base = ncx.href.replace(/[^/]*$/, '');
    for (const m of xml.matchAll(/<navPoint\b[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content\b([^>]*)\/?>/gi)) addLink(base, attr(m[2], 'src'), unent(m[1]));
  }
  const coverItem = [...manifest.values()].find((x) => /cover-image/.test(x.props)) || manifest.get('cover') || manifest.get('cover-image');
  json(res, 200, {
    title: unent(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opf)?.[1] || ''), author: unent(/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i.exec(opf)?.[1] || ''),
    id: b64(rel), spine, toc, cover: coverItem && /image/.test(coverItem.type) ? coverItem.href : null,
  });
}
function handleEpubFile(url, res) {
  const m = /^\/epub\/([\w-]+)\/(.+)$/.exec(url.pathname);
  const rel = m && Buffer.from(m[1], 'base64url').toString('utf8');
  if (!rel) throw httpError(404, 'Not found');
  return zipFor(rel).then((zip) => {
    const name = zdecode(m[2]), data = zip.read(name);
    if (!data) throw httpError(404, 'Not in this book');
    const html = /\.x?html?$/i.test(name);
    res.writeHead(200, {
      'content-type': MIME[extOf(name)] || 'application/octet-stream', 'cache-control': 'private, max-age=3600',
      // a book's own scripts never run
      ...(html ? { 'content-security-policy': "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; media-src 'self'" } : {}),
    });
    res.end(data);
  });
}
const IMG_RE = /\.(jpe?g|png|webp|gif)$/i;
async function handleCbz(url, res) {
  const rel = url.searchParams.get('path') || '';
  if (!rel.startsWith('local/')) resolveUnderBase(rel.startsWith('v:') ? decodeV(rel)?.[0] || '' : rel);
  const zip = await zipFor(rel);
  const pages = [...zip.entries.keys()].filter((n) => IMG_RE.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  json(res, 200, { pages: pages.length });
}
async function handleCbzPage(url, res) {
  const rel = url.searchParams.get('path') || '', i = Number(url.searchParams.get('i'));
  if (!rel.startsWith('local/')) resolveUnderBase(rel.startsWith('v:') ? decodeV(rel)?.[0] || '' : rel);
  const zip = await zipFor(rel);
  const names = [...zip.entries.keys()].filter((n) => IMG_RE.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const name = names[i];
  if (!name) throw httpError(404, 'No such page');
  res.writeHead(200, { 'content-type': MIME[extOf(name)] || 'image/jpeg', 'cache-control': 'private, max-age=3600' });
  res.end(zip.read(name));
}
/** Audio the browser can't play, as MP3. */
function handleAudio(req, url, res) {
  if (!hasFfmpeg) throw httpError(501, 'ffmpeg is needed to play this format');
  const m = media(url.searchParams.get('path'));
  const p = audioAsMp3(m.src, m.auth);
  res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' });
  p.stdout.pipe(res);
  res.on('close', () => p.kill('SIGKILL'));
  p.on('error', () => res.destroy());
}
async function handleArt(url, res) {
  if (!hasFfmpeg) throw httpError(404, 'No cover');
  const m = media(url.searchParams.get('path'));
  const jpg = await embeddedArt(m.src, m.auth);
  if (!jpg) throw httpError(404, 'No cover');
  res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' });
  res.end(jpg);
}

/** Mac app downloads: POST {path} starts one, GET lists, DELETE ?id= cancels, DELETE ?name= removes a file. */
async function handleDownloads(req, url, res) {
  if (!downloadsEnabled()) throw httpError(404, 'Downloads are available in the Mac app');
  if (req.method === 'POST') {
    const { path: rel } = JSON.parse((await readBody(req)) || '{}');
    const { base: lib, url: target } = resolveUnderBase(rel);
    if (isLocalBase(lib)) throw httpError(400, 'This is already on your computer');
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
  const up = await fetch(`${process.env.TMDB_IMG || 'https://image.tmdb.org/t/p'}/${m[1]}/${m[2]}`, { signal: AbortSignal.timeout(15000) });
  if (!up.ok) throw httpError(up.status, 'Image not found');
  res.writeHead(200, { 'content-type': up.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public, max-age=2592000' });
  Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
}

async function handleConfig(req, res) {
  if (req.method === 'POST') {
    const b = JSON.parse((await readBody(req)) || '{}');
    const servers = splitServers(b.servers ?? b.serverUrl);
    for (const s of servers) {
      let b;
      try { b = toBase(s); } catch { throw httpError(400, `Invalid server address: ${s}`); }
      if (isLocalBase(b) && !fs.existsSync(fileURLToPath(b))) throw httpError(400, `Folder not found: ${splitLabel(s).url}`);
    }
    config = {
      servers,
      username: String(b.username || ''),
      password: b.keepPassword ? config.password : String(b.password || ''),
      tmdbKey: b.tmdbKey === undefined ? config.tmdbKey : String(b.tmdbKey).trim(),
      opensubsKey: b.opensubsKey === undefined ? config.opensubsKey : String(b.opensubsKey).trim(),
      opensubsUser: b.opensubsUser === undefined ? config.opensubsUser : String(b.opensubsUser).trim(),
      opensubsPass: b.keepOpensubsPass || b.opensubsPass === undefined ? config.opensubsPass : String(b.opensubsPass),
      subdlKey: b.subdlKey === undefined ? config.subdlKey : String(b.subdlKey).trim(),
      shareTv: b.shareTv === undefined ? config.shareTv : !!b.shareTv,
      metaIds: config.metaIds, infoIds: config.infoIds,
      audiodbKey: b.audiodbKey === undefined ? config.audiodbKey : String(b.audiodbKey).trim(),
      googleBooksKey: b.googleBooksKey === undefined ? config.googleBooksKey : String(b.googleBooksKey).trim(),
      playlists: b.playlists === undefined ? config.playlists : splitServers(b.playlists),
      jellyfin: b.jellyfin === undefined ? config.jellyfin : !!b.jellyfin,
      jellyfinPass: b.jellyfinPass === undefined ? config.jellyfinPass : String(b.jellyfinPass),
    };
    listCache.clear(); libRoots.clear(); localWalks.clear(); showIdx.clear(); jf.reset(); forgetPlaylists();
    updateShare(); updateJellyfin();
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  }
  json(res, 200, { servers: config.servers, username: config.username, hasPassword: !!config.password, tmdbKey: config.tmdbKey, ffmpeg: hasFfmpeg, downloads: downloadsEnabled(), brand: BRAND, localLibs: localLibs(), playlists: config.playlists, audiodbKey: config.audiodbKey, googleBooksKey: config.googleBooksKey, share: shareInfo(), jellyfin: jellyfinInfo(),
    opensubsKey: config.opensubsKey, opensubsUser: config.opensubsUser, hasOpensubsPass: !!config.opensubsPass, subdlKey: config.subdlKey });
}

/** Bytes start..end (inclusive) of a playable item, and its total size. */
async function readRange(m, start, end) {
  if (m.local) {
    const fd = fs.openSync(m.src, 'r');
    try {
      const size = fs.fstatSync(fd).size, buf = Buffer.alloc(Math.max(0, Math.min(end, size - 1) - start + 1));
      fs.readSync(fd, buf, 0, buf.length, start);
      return { buf, size };
    } finally { fs.closeSync(fd); }
  }
  const r = await fetch(m.src, { headers: upstreamHeaders({ range: `bytes=${start}-${end}` }), signal: AbortSignal.timeout(15000) });
  if (r.status !== 206) { r.body?.cancel().catch(() => {}); throw new Error('server ignores ranges'); }
  return { buf: Buffer.from(await r.arrayBuffer()), size: Number(/\/(\d+)$/.exec(r.headers.get('content-range') || '')?.[1]) || 0 };
}

const subKeys = () => ({ opensubsKey: config.opensubsKey, opensubsUser: config.opensubsUser, opensubsPass: config.opensubsPass, subdlKey: config.subdlKey });
/** GET /api/subsearch?path=&q=&langs=en,bn — online subtitles for a video, best matches first. */
async function handleSubSearch(url, res) {
  const rel = url.searchParams.get('path') || '';
  const m = media(rel);
  const meta = rel.startsWith('local/') ? {} : await metaOf(rel).catch(() => ({}));
  const langs = (url.searchParams.get('langs') || 'en').split(',').map((l) => l.trim().toLowerCase()).filter((l) => /^[a-z]{2}(-[a-z]{2})?$/.test(l)).slice(0, 5);
  const typed = (url.searchParams.get('q') || '').trim();
  let hash = null;
  if (config.opensubsKey && !typed) {
    try {
      const first = await readRange(m, 0, 65535);
      hash = await movieHash(first.size, async (a, b) => (a === 0 ? first.buf : (await readRange(m, a, b)).buf));
    } catch { /* no hash: search by name only */ }
  }
  const tv = meta.season != null || meta.episode != null;
  const q = {
    query: typed || (tv ? meta.show : meta.matched) || meta.title || extOf(rel) && decodeURIComponent(rel.split('/').pop()).replace(/\.[^.]+$/, ''),
    year: typed ? null : meta.year, season: typed ? null : meta.season ?? null, episode: typed ? null : meta.episode ?? null,
    tmdbId: typed ? null : (tv ? meta.tmdbType === 'tv' : meta.tmdbType === 'movie') ? meta.tmdbId : null,
    hash, langs: langs.length ? langs : ['en'],
  };
  json(res, 200, { query: q.query, ...(await searchSubtitles(q, subKeys())) });
}

/** GET /api/subget?id=&ep= — downloads one result as WebVTT. */
async function handleSubGet(url, res) {
  const ep = url.searchParams.get('ep');
  let sub;
  try { sub = await fetchSubtitle(url.searchParams.get('id') || '', subKeys(), { episode: ep ? Number(ep) : null }); }
  catch (e) { throw httpError(502, e.message); }
  res.writeHead(200, { 'content-type': 'text/vtt; charset=utf-8', 'x-sub-name': encodeURIComponent(sub.name) });
  res.end(/^\s*WEBVTT/.test(sub.text) ? sub.text : srtToVtt(sub.text));
}

/** What the Windows app's Server page shows: uptime, ffmpeg, and how quickly each library answers. */
async function handleStatus(res) {
  const libraries = await Promise.all(config.servers.map(async (line, i) => {
    const t = Date.now();
    let ms = null;
    if (isLocalBase(bases()[i])) return { name: serverNames()[i], url: splitLabel(line).url, ms: null, local: fs.existsSync(fileURLToPath(bases()[i])) };
    try {
      const r = await fetch(bases()[i].href, { headers: upstreamHeaders(), signal: AbortSignal.timeout(5000) });
      r.body?.cancel().catch(() => {});
      if (r.ok) ms = Date.now() - t;
    } catch { /* unreachable */ }
    return { name: serverNames()[i], url: splitLabel(line).url, ms };
  }));
  json(res, 200, {
    version: process.env.APP_VERSION || '', uptime: Math.round((Date.now() - started) / 1000),
    ffmpeg: hasFfmpeg ? ffmpegVersion() || 'ready' : '', downloads: downloadsEnabled() ? listDownloads().dir : '', libraries,
  });
}

function serveStatic(url, res) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, { 'content-type': MIME[extOf(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  if (BRAND && rel === 'index.html') {
    // Marked before the first paint, so the StreamHub look shows without a flash of the Mac one.
    return res.end(fs.readFileSync(file, 'utf8').replace('<html lang="en">', `<html lang="en" class="${BRAND}">`)
      .replace('<title>MusingsofMaksudTV</title>', '<title>StreamHub</title>').replace('href="logo.svg" type="image/svg+xml"', 'href="assets/streamhub-icon.svg" type="image/svg+xml"'));
  }
  fs.createReadStream(file).pipe(res);
}

/** Opens a folder in Finder (hook set by the Mac app) or File Explorer. */
function reveal(dir) {
  if (globalThis.__revealInFinder) return globalThis.__revealInFinder(dir);
  if (process.platform !== 'win32') return;
  fs.mkdirSync(dir, { recursive: true });
  spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
}

/* ---------------- sharing local folders with the TV ----------------
   The Android TV app reads "Index of /" pages, the same as the ISP servers. With "Share my folders with my TV" on,
   the local folder libraries are also served that way on the home network, read-only, at
   http://<this computer>:8090/<library>/. Only devices on the local network get answers. There's no password because
   the TV app sends one username and password to every server, which would leak it to the ISP servers. */
const SHARE_PORT = Number(process.env.SHARE_PORT ?? 8090);
let shareServer = null, sharePort = 0;
const isPrivateIp = (ip) => /^(?:::ffff:)?(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.)|^::1$|^f[cd]|^fe80:/i.test(ip || '');
// Virtual adapters (WSL, Hyper-V, Docker, VPN, VMs) have addresses a phone or TV can't reach, so they're left out.
const VIRTUAL_NIC = /vethernet|wsl|hyper-v|docker|vmware|virtualbox|vbox|loopback|tailscale|zerotier|tap-|tun\d|utun|vpn|bridge|veth|br-/i;
const lanAddresses = () => Object.entries(os.networkInterfaces()).filter(([name]) => !VIRTUAL_NIC.test(name)).flatMap(([, list]) => list || [])
  .filter((n) => n && n.family === 'IPv4' && !n.internal && isPrivateIp(n.address)).map((n) => n.address);
/** URL segment for each local library, by its name ("My Movies" -> "My%20Movies"), unique. */
function sharedLibs() {
  const names = serverNames(), seen = new Set();
  return localLibs().map((i) => {
    let seg = names[i].replace(/[\\/]/g, '-').trim() || `Folder ${i}`;
    while (seen.has(seg.toLowerCase())) seg += ' 2';
    seen.add(seg.toLowerCase());
    return { idx: i, name: names[i], seg };
  });
}
function shareInfo() {
  const port = sharePort || SHARE_PORT, ip = lanAddresses()[0] || '<this computer’s IP>';
  return {
    enabled: config.shareTv, running: !!shareServer, port, addresses: lanAddresses(),
    lines: sharedLibs().map((l) => `${l.name} (PC) | http://${ip}:${port}/${encodeURIComponent(l.seg)}/`),
  };
}
const escHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function indexPage(res, title, links, head) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  if (head) return res.end();
  res.end(`<html><head><title>Index of ${escHtml(title)}</title></head><body><h1>Index of ${escHtml(title)}</h1><hr><pre><a href="../">../</a>\n${
    links.map((l) => `<a href="${escHtml(l)}">${escHtml(decodeURIComponent(l))}</a>`).join('\n')}</pre><hr></body></html>`);
}
function handleShare(req, res) {
  try {
    if (!isPrivateIp(req.socket.remoteAddress)) { res.writeHead(403); return res.end('Only for devices on this network'); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const head = req.method === 'HEAD';
    const u = new URL(req.url, 'http://share');
    const segs = u.pathname.split('/').slice(1);
    const libs = sharedLibs();
    if (!segs[0]) return indexPage(res, '/', libs.map((l) => `${encodeURIComponent(l.seg)}/`), head);
    const lib = libs.find((l) => encodeURIComponent(l.seg) === canonPath(segs[0]) || l.seg === decodeURIComponent(segs[0]));
    if (!lib) { res.writeHead(404); return res.end('Not found'); }
    const base = bases()[lib.idx];
    const target = new URL(segs.slice(1).map((x) => encodeURIComponent(decodeURIComponent(x))).join('/'), base);
    if (!canonPath(target.pathname).startsWith(canonPath(base.pathname))) { res.writeHead(400); return res.end(); }
    const real = localPathIn(base, target);
    if (fs.statSync(real).isDirectory()) {
      if (!u.pathname.endsWith('/')) { res.writeHead(301, { location: u.pathname + '/' }); return res.end(); }
      return indexPage(res, u.pathname, listLocalFolder(base, target).map((k) => k.href.slice(target.pathname.length))
        .filter((h) => h.endsWith('/') || /^(?:video|sub|image)$/.test(kindOf(decodeURIComponent(h)))), head);
    }
    if (!/^(?:video|sub|image)$/.test(kindOf(real))) { res.writeHead(403); return res.end(); }
    if (head) { res.writeHead(200, { 'content-length': fs.statSync(real).size, 'accept-ranges': 'bytes', 'content-type': MIME[extOf(real)] || 'application/octet-stream' }); return res.end(); }
    serveFile(req, res, real);
  } catch (e) {
    if (!res.headersSent) { res.writeHead(e.status || 404); res.end(e.status === 400 ? 'Bad path' : 'Not found'); }
  }
}
const kindOf = (name) => (VIDEO_EXT.has(extOf(name)) ? 'video' : /^(srt|vtt)$/.test(extOf(name)) ? 'sub' : /^(jpe?g|png|webp)$/.test(extOf(name)) ? 'image' : 'other');
/** Starts or stops the TV share to match Settings. */
function updateShare() {
  if (config.shareTv && !shareServer) {
    const srv = http.createServer(handleShare);
    srv.on('error', (e) => { console.error('TV share:', e.message); if (shareServer === srv) { shareServer = null; sharePort = 0; } });
    srv.listen(SHARE_PORT, '0.0.0.0', () => { sharePort = srv.address().port; });
    shareServer = srv;
  } else if (!config.shareTv && shareServer) {
    shareServer.close(); shareServer = null; sharePort = 0;
  }
}

/* ---- Jellyfin-compatible API (jellyfin.js), on its own port for home-network apps ---- */
const JELLYFIN_PORT = process.env.JELLYFIN_PORT === undefined ? 8096 : Number(process.env.JELLYFIN_PORT);
let jellyfinServer = null, jellyfinPort = 0, jellyfinNote = '', jellyfinError = '';
const viewsList = async () => {
  const all = bases();
  const roots = await Promise.all(all.map((_, i) => libraryRoot(i).then((l) => l.path, () => `${i}/`)));
  return groups().map((g) => ({ name: g.name, rel: groupRoot(g, roots), type: g.type }));
};
const childrenOf = async (rel) => {
  if (rel.startsWith('show:')) return (await listShow(rel)).items;
  if (rel.startsWith('v:')) return (await listVirtual(rel)).items;
  return (/^\d+\/$/.test(rel) ? await libraryRoot(Number(rel.slice(0, -1))) : await listDir(rel)).items;
};
const firstReal = (rel) => (String(rel).startsWith('v:') ? decodeV(rel)?.[0] || '' : rel);
const jf = createJellyfin({
  stateFile: path.join(path.dirname(CONFIG_FILE), 'jellyfin-state.json'),
  password: () => config.jellyfinPass,
  hasTmdb: () => !!config.tmdbKey,
  subtitle: (rel) => subtitleText(firstReal(rel)),
  tmdbSeason: async (rel, n) => {
    if (!config.tmdbKey || String(rel).startsWith('local/')) return null;
    const m = await metaOf(firstReal(rel)).catch(() => null);
    return m?.tmdbType === 'tv' && m.tmdbId ? seasonEpisodes(config.tmdbKey, m.tmdbId, n) : null;
  },
  views: viewsList,
  children: childrenOf,
  shows: async (rootRel) => { const r = await showsSeries(rootRel, 4000); return { done: r.done, series: r.series.map((x) => ({ rel: showPath(x), name: x.title, year: x.year, seasons: x.seasons.map((se) => ({ n: se.n, rel: `${showPath(x)}${encodeURIComponent(seasonName(se.n))}/`, name: seasonName(se.n) })) })) }; },
  media: (rel) => media(firstReal(rel)),
  probe: async (rel) => { if (!hasFfmpeg) return null; const m = media(rel); return probe(m.src, m.auth); },
  metaFor: (rel) => (rel.startsWith('local/') ? null : metaOf(firstReal(rel))),
  stream: async (req, res, rel) => { const m = media(rel); return m.local ? serveFile(req, res, m.src) : proxy(req, res, m.src); },
  image: async (req, res, src) => {
    if (src.startsWith('/tmdb/')) return handleTmdbImage(req, new URL(src, 'http://x'), res);
    const rel = new URL(src, 'http://x').searchParams.get('path');
    const m = media(rel);
    return m.local ? serveFile(req, res, m.src) : proxy(req, res, m.src, { cache: true });
  },
});
function jellyfinInfo() {
  return {
    enabled: config.jellyfin, running: !!jellyfinPort, port: jellyfinPort || JELLYFIN_PORT, addresses: lanAddresses(), note: jellyfinNote, error: jellyfinError,
    user: jf.userName, hasPassword: !!config.jellyfinPass,
  };
}
function updateJellyfin() {
  if (config.jellyfin && !jellyfinServer) {
    const srv = http.createServer(async (req, res) => {
      try {
        // Only devices on the home network (a private address) get answers, like the TV share.
        if (!isPrivateIp(req.socket.remoteAddress)) return json(res, 403, { error: 'Home network only' });
        await jf.handle(req, res);
      } catch (e) {
        if (res.headersSent) return res.destroy();
        json(res, e.status || 500, { error: e.message });
      }
    });
    jellyfinNote = ''; jellyfinError = '';
    jellyfinServer = srv;
    // Port 8096 is the real Jellyfin's. When something already has it, take the next free port and say so.
    const listenOn = (port, tries) => {
      const fail = (e) => {
        if (jellyfinServer !== srv) return;
        if (e.code === 'EADDRINUSE' && JELLYFIN_PORT !== 0 && tries < 20) {
          jellyfinNote = `Port ${JELLYFIN_PORT} is already in use (probably another Jellyfin server), so StreamHub uses ${port + 1}.`;
          return listenOn(port + 1, tries + 1);
        }
        console.error('Jellyfin API:', e.message);
        jellyfinError = e.message; jellyfinServer = null; jellyfinPort = 0;
      };
      srv.once('error', fail);
      srv.listen(port, '0.0.0.0', () => { srv.off('error', fail); srv.on('error', (e) => console.error('Jellyfin API:', e.message)); jellyfinPort = srv.address().port; });
    };
    listenOn(JELLYFIN_PORT, 0);
  } else if (!config.jellyfin && jellyfinServer) {
    jellyfinServer.close(); jellyfinServer.closeAllConnections?.(); jellyfinServer = null; jellyfinPort = 0; jellyfinNote = ''; jellyfinError = '';
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (p === '/api/browse') return await handleBrowse(url, res);
    if (p === '/api/search') return await handleSearch(url, res);
    if (p === '/api/config') return await handleConfig(req, res);
    if (p === '/api/status') return await handleStatus(res);
    if (p === '/api/subsearch') return await handleSubSearch(url, res);
    if (p === '/api/subget') return await handleSubGet(url, res);
    if (p === '/api/pick-folder') return await handlePickFolder(req, res);
    if (p === '/api/meta') return await handleMeta(url, res);
    if (p === '/api/queue') return json(res, 200, showQueue(url.searchParams.get('path') || '') || { items: null });
    if (p === '/api/cast') return await handleCast(url, res);
    if (p === '/api/info') return await handleInfo(url, res);
    if (p === '/api/info-search') return await handleInfoSearch(url, res);
    if (p === '/api/info-id' && req.method === 'POST') return await handleInfoId(req, res);
    if (p === '/api/meta-search') return await handleMetaSearch(url, res);
    if (p === '/api/meta-id' && req.method === 'POST') return await handleMetaId(req, res);
    if (p === '/api/episodes') return await handleEpisodes(url, res);
    if (p === '/api/epub') return await handleEpub(url, res);
    if (p.startsWith('/epub/')) return await handleEpubFile(url, res);
    if (p === '/api/cbz') return await handleCbz(url, res);
    if (p === '/api/cbz-page') return await handleCbzPage(url, res);
    if (p === '/api/audio') return handleAudio(req, url, res);
    if (p === '/api/art') return await handleArt(url, res);
    if (p === '/api/probe') return await handleProbe(url, res);
    if (p === '/api/seek-point') return await handleSeekPoint(url, res);
    if (p === '/api/embedded-sub') return await handleEmbeddedSub(url, res);
    if (p === '/api/downloads') return await handleDownloads(req, url, res);
    if (p === '/api/reveal') { reveal(listDownloads().dir); return json(res, 200, { ok: true }); }
    if (p === '/stream') {
      const m = media(url.searchParams.get('path'));
      return m.local ? serveFile(req, res, m.src) : await proxy(req, res, m.src);
    }
    if (p === '/img') {
      const m = media(url.searchParams.get('path'));
      return m.local ? serveFile(req, res, m.src) : await proxy(req, res, m.src, { cache: true });
    }
    if (p === '/api/iptv') return await handleIptv(url, res);
    if (p === '/live') return await handleLive(url, res);
    if (p === '/remux') return await handleRemux(url, res);
    if (p === '/subs') return await handleSubs(url, res);
    if (p.startsWith('/tmdb/')) return await handleTmdbImage(req, url, res);
    serveStatic(url, res);
  } catch (e) {
    if (res.headersSent) return res.destroy();
    json(res, e.status || 500, { error: e.message });
  }
});

server.on('listening', () => { updateShare(); updateJellyfin(); });
server.on('close', () => { if (shareServer) { shareServer.close(); shareServer = null; } if (jellyfinServer) { jellyfinServer.close(); jellyfinServer = null; } jf.close(); });
const start = () => server.listen(PORT, HOST, () => console.log(`MusingsofMaksudTV running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
// import.meta.url is empty in the Windows app's bundle, which calls start() from serve.js instead.
if (import.meta.url && process.argv[1] === fileURLToPath(import.meta.url)) start();
export { server, start };
