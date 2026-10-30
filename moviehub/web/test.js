// Spins up a fake ISP server (nginx-style listing + Range support) and exercises the proxy.
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseListing, parseName, srtToVtt } from './listing.js';

const nginx = `<html><head><title>Index of /movies/</title></head><body><h1>Index of /movies/</h1><hr><pre><a href="../">../</a>
<a href="Action/">Action/</a>                 01-Jan-2024 10:00  -
<a href="Big%20Film%20(2020).mkv">Big Film (2020).mkv</a>  01-Jan-2024 10:00  1G
<a href="Big%20Film%20(2020).srt">Big Film (2020).srt</a>  01-Jan-2024 10:00  1K
<a href="notes.txt">notes.txt</a>
<a href="?C=N;O=D">Name</a></pre></body></html>`;
const items = parseListing(nginx, 'http://isp.test/movies/', 'http://isp.test/movies/');
assert.deepEqual(items.map((i) => [i.name, i.kind, i.path]), [
  ['Action', 'dir', 'Action/'], ['Big Film (2020).mkv', 'video', 'Big%20Film%20(2020).mkv'], ['Big Film (2020).srt', 'sub', 'Big%20Film%20(2020).srt']]);
const apache = '<a href="/movies/Action/Fast.mp4">Fast.mp4</a><a href="/movies/">Parent Directory</a><a href="/other/x.mp4">x</a>';
assert.deepEqual(parseListing(apache, 'http://isp.test/movies/Action/', 'http://isp.test/movies/').map((i) => i.path), ['Action/Fast.mp4']);
for (const [raw, title, year] of [['Panchayat (TV Series 2020- ) 1080p', 'Panchayat', 2020], ['Severance (TV Series 2022– ) 1080p', 'Severance', 2022],
  ['The Office (2005-2013)', 'The Office', 2005], ['Blade.Runner.2049.2017.1080p.mkv', 'Blade Runner 2049', 2017], ['1917.2019.1080p.mkv', '1917', 2019], ['Dune.Part.Two.2024.1080p.mkv', 'Dune Part Two', 2024], ['Blade Runner 2049 (2017)', 'Blade Runner 2049', 2017]]) {
  assert.deepEqual([parseName(raw).title, parseName(raw).year], [title, year], raw);
}
assert.match(srtToVtt('1\r\n00:00:01,500 --> 00:00:02,000\r\nHi'), /^WEBVTT\n\n1\n00:00:01\.500 --> 00:00:02\.000\nHi/);

const FILE = Buffer.alloc(1000, 7);
const isp = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url);
  if (u === '/movies/' || u === '/movies/Action/') { res.setHeader('content-type', 'text/html'); return res.end(u === '/movies/' ? nginx : apache); }
  const dirList = (t, names) => `<html><head><title>Index of ${t}</title></head><body><h1>Index of ${t}</h1><hr><pre><a href="../">../</a>\n${names.map((n) => `<a href="${encodeURIComponent(n).replace(/%2F/g, '/')}">${n}</a>  01-Jan-2024 10:00  ${n.endsWith('/') ? '-' : '1G'}`).join('\n')}</pre></body></html>`;
  const tv = { '/tv/': ['Some Show (2020) 1080p/'], '/tv/Some Show (2020) 1080p/': ['Season 1/', 'Season 2/'],
    '/tv/Some Show (2020) 1080p/Season 1/': ['Some.Show.S01E01.1080p.mkv', 'Some.Show.S01E02.1080p.mkv', 'Some.Show.S01E01.1080p.en.srt'], '/tv/Some Show (2020) 1080p/Season 2/': ['Some.Show.S02E01.1080p.mkv'] };
  if (tv[u]) { res.setHeader('content-type', 'text/html'); return res.end(dirList(u, tv[u])); }
  if (u === '/h5/Films/') return res.end('<html><script src="/_h5ai/public/js/scripts.js"></script></html>');
  if (u === '/_h5ai/public/index.php') {
    let b = ''; req.on('data', (c) => (b += c));
    return req.on('end', () => {
      const q = JSON.parse(b);
      if (!q.items) return res.end(JSON.stringify({ search: [] }));
      const href = q.items.href;
      res.end(JSON.stringify({ items: [{ href: '/h5/' }, { href }, { href: href + 'Dune%20(2021)/' }, { href: href + 'Up.mp4' }] }));
    });
  }
  if (u.endsWith('.mkv')) {
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    if (!m) { res.writeHead(200, { 'content-length': 1000 }); return res.end(FILE); }
    const a = +m[1], b = m[2] ? +m[2] : 999;
    res.writeHead(206, { 'content-range': `bytes ${a}-${b}/1000`, 'content-length': b - a + 1 });
    return res.end(FILE.subarray(a, b + 1));
  }
  if (u.endsWith('.srt')) return res.end('1\n00:00:01,000 --> 00:00:02,000\nHello');
  res.writeHead(404); res.end();
});
await new Promise((r) => isp.listen(0, '127.0.0.1', r));

// --- fake OpenSubtitles.com and SubDL for the online subtitle search
function zipOf(files) { // minimal .zip writer: deflated entries + central directory
  const locals = [], centrals = []; let off = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text), comp = zlib.deflateRawSync(data), n = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, comp); centrals.push(ch, n); off += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
const subApiSeen = [];
const subApi = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  subApiSeen.push(u.pathname + u.search);
  const j = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/os/subtitles') {
    if (req.headers['api-key'] !== 'OSKEY') return j({ message: 'You cannot consume this service' }, 403);
    return j({ data: [
      { attributes: { language: 'en', release: 'Big.Film.2020.1080p', download_count: 900, files: [{ file_id: 11, file_name: 'a.srt' }] } },
      { attributes: { language: 'bn', release: 'Big.Film.2020.Bangla', download_count: 5, files: [{ file_id: 12, file_name: 'b.srt' }] } },
    ] });
  }
  if (u.pathname === '/os/download' && req.method === 'POST') return j({ link: `http://127.0.0.1:${subApi.address().port}/os/file/12.srt`, file_name: 'b.srt' });
  if (u.pathname === '/os/file/12.srt') return res.end('1\n00:00:01,000 --> 00:00:02,000\nহ্যালো');
  if (u.pathname === '/sd/subtitles') {
    if (u.searchParams.get('api_key') !== 'SDKEY') return j({ status: false, error: 'Not Authorized' }, 403);
    return j({ status: true, subtitles: [{ release_name: 'Big Film Pack', language: 'EN', url: '/subtitle/7.zip' }] });
  }
  if (u.pathname === '/sddl/subtitle/7.zip') {
    res.writeHead(200, { 'content-type': 'application/zip' });
    return res.end(zipOf([['Pack/Show.S01E01.srt', '1\n00:00:01,000 --> 00:00:02,000\nOne'], ['Pack/Show.S01E02.srt', '1\n00:00:01,000 --> 00:00:02,000\nTwo']]));
  }
  j({ message: 'nope' }, 404);
});
await new Promise((r) => subApi.listen(0, '127.0.0.1', r));
const subApiBase = `http://127.0.0.1:${subApi.address().port}`;
process.env.OPENSUBTITLES_API = `${subApiBase}/os`; process.env.SUBDL_API = `${subApiBase}/sd`; process.env.SUBDL_DL = `${subApiBase}/sddl`;
const { movieHash, unzip } = await import('./subsearch.js');
const hashBuf = Buffer.from(Array.from({ length: 200000 }, (_, i) => (i * 7 + 3) % 251));
assert.equal(await movieHash(hashBuf.length, async (a, b) => hashBuf.subarray(a, b + 1)), 'e6ed0e283146465f', 'OpenSubtitles hash');
assert.deepEqual(unzip(zipOf([['x/a.srt', 'hello']])).map((f) => [f.name, f.data.toString()]), [['x/a.srt', 'hello']]);

// A fake TMDB for the episode plots
const tmdbFake = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('content-type', 'application/json');
  if (u.pathname === '/search/tv') return res.end(JSON.stringify({ results: [{ id: 42, name: 'Some Show', overview: 'The show.', first_air_date: '2020-05-01' }] }));
  if (u.pathname === '/tv/42/season/2') return res.end(JSON.stringify({ poster_path: '/season2.jpg', episodes: [{ episode_number: 1, name: 'Pilot', overview: 'It begins.', runtime: 44, air_date: '2021-01-01', still_path: '/pilot.jpg' }, { episode_number: 2, name: 'Two', overview: '' }] }));
  res.statusCode = 404; res.end('{}');
});
await new Promise((r) => tmdbFake.listen(0, '127.0.0.1', r));
process.env.TMDB_API = `http://127.0.0.1:${tmdbFake.address().port}`;
process.env.SERVER_URL = `http://127.0.0.1:${isp.address().port}/movies/`;
process.env.PORT = '0';
process.env.CONFIG_FILE = path.join(os.tmpdir(), `moviehub-test-${process.pid}.json`);
process.env.SHARE_PORT = '0'; // any free port for the TV share
process.env.JELLYFIN_PORT = '0'; // and for the Jellyfin API
const { server } = await import('./server.js');
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const get = (p, h) => fetch(base + p, { headers: h });

let r = await (await get('/api/browse?path=')).json();
assert.equal(r.items.length, 3);
assert.equal(r.items[0].path, '0/Action/');
r = await (await get('/api/browse?path=0/Action/')).json();
assert.equal(r.items[0].path, '0/Action/Fast.mp4');
assert.equal((await get('/api/browse?path=0/../../etc/')).status, 400);
assert.equal((await get('/stream?path=0%2F..%2F..%2Fsecret')).status, 400);
r = await get('/stream?path=0%2FBig%2520Film%2520(2020).mkv', { range: 'bytes=100-199' });
assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 100-199/1000');
assert.equal(r.headers.get('content-type'), 'video/x-matroska'); assert.equal((await r.arrayBuffer()).byteLength, 100);
assert.match(await (await get('/subs?path=0%2FBig%2520Film%2520(2020).srt')).text(), /^WEBVTT/);
assert.equal((await get('/')).status, 200);
assert.equal((await get('/..%2Fserver.js')).status, 404);
// h5ai: same proxy, different library root
const h5 = `http://127.0.0.1:${isp.address().port}/h5/`;
const movies = process.env.SERVER_URL;
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `${movies}\n${h5}` }) });
r = await (await get('/api/browse?path=')).json();
assert.deepEqual(r.items.map((i) => [i.path, i.isDir]), [['0/', true], ['1/', true]]);
assert.equal(r.servers.length, 2);
r = await (await get('/api/browse?path=1/Films/')).json();
assert.deepEqual(r.items.map((i) => i.path), ['1/Films/Dune%20(2021)/', '1/Films/Up.mp4']);
assert.equal((await get('/api/browse?path=2/')).status, 400);
assert.equal((await get('/stream?path=1%2F..%2Fm%2Fx.mkv')).status, 400); // can't hop from one server's root into another path
// --- DhakaFlix-style server: plain landing page, then h5ai folders whose API spells "(" as %28 and "&" as %26
const enc = (p) => p.split('/').map((x) => encodeURIComponent(x).replace(/[()']/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
const tree = {
  '/DHAKA-FLIX-7/': ['English Movies (1080p)/', 'TV & WEB Series/'],
  '/DHAKA-FLIX-7/English Movies (1080p)/': ['(2024) 1080p/'],
  '/DHAKA-FLIX-7/English Movies (1080p)/(2024) 1080p/': ['Dune Part Two (2024) 1080p/'],
  '/DHAKA-FLIX-7/English Movies (1080p)/(2024) 1080p/Dune Part Two (2024) 1080p/': ['Dune.Part.Two.2024.1080p.mkv', 'poster.jpg'],
  '/DHAKA-FLIX-7/TV & WEB Series/': [],
  // A second "Movies" server with the 720p copies and its own spelling of the folders.
  '/DHAKA-FLIX-14/': ['English Movies/'],
  '/DHAKA-FLIX-14/English Movies/': ['(2024)/', '(2023)/'],
  '/DHAKA-FLIX-14/English Movies/(2024)/': ['Dune Part Two (2024) 720p/', 'Civil War (2024)/'],
  '/DHAKA-FLIX-14/English Movies/(2024)/Dune Part Two (2024) 720p/': ['Dune.Part.Two.2024.720p.mkv'],
  '/DHAKA-FLIX-14/English Movies/(2023)/': ['Oppenheimer (2023)/'],
};
const df = http.createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (req.method === 'GET' && path === '/') return res.end('<a href="/DHAKA-FLIX-7/">DHAKA-FLIX-7</a><a href="http://172.16.50.12/">other server</a>');
  if (req.method === 'GET') return res.end('<html><head><script src="/_h5ai/public/js/scripts.js"></script></head><body></body></html>');
  if (path.startsWith('/_h5ai/')) { res.writeHead(403); return res.end(); } // DhakaFlix-style: API only on folder URLs
  let b = ''; req.on('data', (c) => (b += c));
  req.on('end', () => {
    const body = JSON.parse(b);
    if (body.search) {
      const hits = Object.entries(tree).flatMap(([dir, kids]) => kids.map((k) => dir + k)).filter((h) => h.startsWith(decodeURIComponent(body.search.href)) && new RegExp(body.search.pattern, 'i').test(h.split('/').filter(Boolean).pop()));
      return res.end(JSON.stringify({ search: hits.map((h) => ({ href: enc(h) })) }));
    }
    const href = decodeURIComponent(body.items.href);
    const kids = tree[href] || [];
    res.end(JSON.stringify({ items: [{ href: '/' + href.split('/')[1] + '/' }, { href: enc(href) }, ...kids.map((k) => ({ href: enc(href + k) }))] }));
  });
});
await new Promise((r) => df.listen(0, '127.0.0.1', r));
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `Movies | http://127.0.0.1:${df.address().port}/` }) });
r = await (await get('/api/browse?path=')).json();
assert.deepEqual(r.items.map((i) => i.name), ['English Movies (1080p)', 'TV & WEB Series'], 'library opens past the DHAKA-FLIX-7 wrapper');
assert.equal(r.roots[0], '0/DHAKA-FLIX-7/');
r = await (await get(`/api/browse?path=${encodeURIComponent(r.items[0].path)}`)).json();
assert.deepEqual(r.items.map((i) => i.name), ['(2024) 1080p'], 'folder from the h5ai API is not empty');
r = await (await get(`/api/browse?path=${encodeURIComponent(r.items[0].path)}`)).json();
r = await (await get(`/api/browse?path=${encodeURIComponent(r.items[0].path)}`)).json();
assert.deepEqual(r.items.map((i) => i.kind), ['video', 'image']);
r = await (await get('/api/search?q=dune part')).json();
assert.deepEqual(r.items.map((i) => i.name.replace(/ \d+p$/, '')), ['Dune Part Two (2024)'], 'the movie, not also its file or its other copy');
// Two "Movies" servers become one section; the same folders and movie on both are joined.
const dfu = `http://127.0.0.1:${df.address().port}`;
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `Movies 1080p | ${dfu}/DHAKA-FLIX-7/\nMovies | ${dfu}/DHAKA-FLIX-14/\nTV | ${dfu}/DHAKA-FLIX-7/TV%20%26%20WEB%20Series/` }) });
r = await (await get('/api/browse?path=')).json();
assert.deepEqual(r.groups.map((g) => [g.name, g.libs]), [['Movies', [0, 1]], ['TV', [2]]]);
assert.deepEqual(r.items.map((i) => i.name), ['Movies', 'TV']);
assert.match(r.items[0].path, /^v:/);
r = await (await get(`/api/browse?path=${encodeURIComponent(r.items[0].path)}`)).json();
assert.deepEqual(r.items.map((i) => i.name), ['English Movies', 'TV & WEB Series'], 'English Movies (1080p) + English Movies');
r = await (await get(`/api/browse?path=${encodeURIComponent(r.items[0].path)}`)).json();
assert.deepEqual(r.items.map((i) => i.name), ['(2024)', '(2023)'], '(2024) 1080p + (2024)');
r = await (await get(`/api/browse?path=${encodeURIComponent(r.items[0].path)}`)).json();
assert.deepEqual(r.items.map((i) => i.name), ['Dune Part Two (2024) 1080p', 'Civil War (2024)'], 'joined folder named after its best copy');
r = await (await get(`/api/browse?path=${encodeURIComponent(r.items[0].path)}`)).json();
const dune = r.items.find((i) => i.kind === 'video');
assert.deepEqual(dune.versions.map((v) => v.quality), ['1080p', '720p'], 'one movie, two versions, best first');
assert.equal(dune.path, dune.versions[0].path);
assert.equal((await get(`/api/meta?path=${encodeURIComponent(r.path)}`)).status, 200);
r = await (await get('/api/search?q=dune part')).json();
assert.equal(r.items.length, 1, 'search shows the movie once');
assert.equal(r.items[0].library, 'Movies');
assert.equal((await get('/api/browse?path=v:bogus')).status, 400);
df.close();

// --- online subtitles
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: movies }) });
r = await (await get('/api/subsearch?path=0%2FBig%2520Film%2520(2020).mkv&langs=bn,en')).json();
assert.equal(r.needsKey, true, 'no keys yet');
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: movies, opensubsKey: 'OSKEY', subdlKey: 'SDKEY' }) });
r = await (await get('/api/subsearch?path=0%2FBig%2520Film%2520(2020).mkv&langs=bn,en')).json();
assert.equal(r.query, 'Big Film');
assert.deepEqual(r.results.map((x) => [x.provider, x.lang]), [['OpenSubtitles', 'bn'], ['OpenSubtitles', 'en'], ['SubDL', 'en']], 'Bangla first (language order), then by downloads');
assert.ok(subApiSeen.some((s) => s.startsWith('/os/subtitles?') && s.includes('query=Big+Film') && s.includes('year=2020') && s.includes('languages=bn%2Cen')));
assert.ok(subApiSeen.some((s) => s.startsWith('/sd/subtitles?') && s.includes('film_name=Big+Film') && s.includes('languages=BN%2CEN') && s.includes('type=movie')));
let sub = await (await get(`/api/subget?id=${encodeURIComponent(r.results[0].id)}`)).text();
assert.match(sub, /^WEBVTT[\s\S]*হ্যালো/);
sub = await (await get(`/api/subget?id=${encodeURIComponent(r.results[2].id)}&ep=2`)).text();
assert.match(sub, /^WEBVTT[\s\S]*Two/, 'the right episode from a season pack');
assert.equal((await get('/api/subget?id=sd:http://evil.test/x')).status, 502, 'only provider paths are fetched');
subApi.close();

// --- local folder libraries ("Movie | G:\\Movie")
const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-local-'));
fs.mkdirSync(path.join(lib, 'Movie', 'Inception (2010)'), { recursive: true });
fs.writeFileSync(path.join(lib, 'Movie', 'Inception (2010)', 'Inception.2010.1080p.mkv'), FILE);
fs.writeFileSync(path.join(lib, 'Movie', 'Inception (2010)', 'Inception.2010.1080p.srt'), '1\n00:00:01,000 --> 00:00:02,000\nDream');
fs.writeFileSync(path.join(lib, 'Movie', 'Inception (2010)', 'poster.jpg'), 'jpg');
fs.mkdirSync(path.join(lib, 'Movie', '$RECYCLE.BIN'));
fs.writeFileSync(path.join(lib, 'secret.txt'), 'outside');
let canLink = true;
try { fs.symlinkSync(path.join(lib, 'secret.txt'), path.join(lib, 'Movie', 'Inception (2010)', 'escape.mkv')); } catch { canLink = false; } // Windows may need admin rights
const movieDir = path.join(lib, 'Movie');
assert.equal((await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `Movies | ${movies}\nNope | ${path.join(lib, 'missing')}` }) })).status, 400, 'missing folder rejected');
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `Movies | ${movies}\nMy Movie | ${movieDir}` }) });
r = await (await get('/api/config')).json();
assert.deepEqual(r.localLibs, [1]);
r = await (await get('/api/browse?path=1/')).json();
assert.deepEqual(r.items.map((i) => [i.name, i.kind]), [['Inception (2010)', 'dir']], 'system folders hidden');
assert.deepEqual(r.localLibs, [1]);
r = await (await get(`/api/browse?path=${encodeURIComponent(r.items[0].path)}`)).json();
assert.deepEqual(r.items.map((i) => i.kind).sort(), canLink ? ['image', 'sub', 'video', 'video'] : ['image', 'sub', 'video']);
const vid = r.items.find((i) => i.name.endsWith('1080p.mkv'));
r = await get(`/stream?path=${encodeURIComponent(vid.path)}`, { range: 'bytes=10-19' });
assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 10-19/1000');
assert.match(await (await get(`/subs?path=${encodeURIComponent(vid.path.replace(/mkv$/, 'srt'))}`)).text(), /Dream/);
assert.equal((await get(`/img?path=${encodeURIComponent(vid.path.replace(/[^/]+$/, 'poster.jpg'))}`)).status, 200);
if (canLink) assert.equal((await get(`/stream?path=${encodeURIComponent(vid.path.replace(/[^/]+$/, 'escape.mkv'))}`)).status, 400, 'symlink out of the library refused');
assert.equal((await get('/stream?path=1%2F..%2Fsecret.txt')).status, 400, '.. refused');
r = await (await get('/api/search?q=incep')).json();
assert.deepEqual(r.items.map((i) => i.name), ['Inception (2010)'], 'local folders are searched');
r = await (await get('/api/status')).json();
assert.equal(r.libraries[1].local, true);
r = await fetch(base + '/api/downloads', { method: 'POST', body: JSON.stringify({ path: vid.path }) });
assert.ok([400, 404].includes(r.status), 'no downloading what is already here');
// The picker itself opens a real dialog on Mac and Windows, so only the method check runs here.
assert.equal((await get('/api/pick-folder')).status, 405);

// --- sharing local folders with the TV (read-only "Index of /" pages on the home network)
fs.writeFileSync(path.join(lib, 'Movie', 'Inception (2010)', 'notes.txt'), 'private');
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `Movies | ${movies}\nMy Movie | ${movieDir}`, shareTv: true }) });
await new Promise((res) => setTimeout(res, 200));
r = await (await get('/api/config')).json();
assert.equal(r.share.enabled, true); assert.equal(r.share.running, true);
assert.match(r.share.lines[0], /^My Movie \(PC\) \| http:\/\/.+:\d+\/My%20Movie\/$/);
const share = `http://127.0.0.1:${r.share.port}`;
let page = await (await fetch(share + '/')).text();
assert.deepEqual(parseListing(page, share + '/', share + '/').map((i) => i.name), ['My Movie'], 'root lists the shared folders');
page = await (await fetch(share + '/My%20Movie/Inception%20(2010)/')).text();
const tvItems = parseListing(page, share + '/My%20Movie/Inception%20(2010)/', share + '/My%20Movie/');
assert.deepEqual(tvItems.map((i) => i.kind).sort(), canLink ? ['image', 'sub', 'video', 'video'] : ['image', 'sub', 'video'], 'what the TV app sees; notes.txt hidden');
r = await fetch(share + '/My%20Movie/Inception%20(2010)/Inception.2010.1080p.mkv', { headers: { range: 'bytes=0-9' } });
assert.equal(r.status, 206, 'the TV can seek');
assert.equal((await fetch(share + '/My%20Movie/Inception%20(2010)/notes.txt')).status, 403, 'only media files');
assert.equal((await fetch(share + '/My%20Movie/..%2F..%2Fsecret.txt')).status !== 200, true, 'no way out of the folder');
assert.equal((await fetch(share + '/Nope/')).status, 404);
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `Movies | ${movies}\nMy Movie | ${movieDir}`, shareTv: false }) });
await new Promise((res) => setTimeout(res, 200));
assert.equal((await (await get('/api/config')).json()).share.running, false, 'switching it off stops the share');
fs.rmSync(lib, { recursive: true, force: true });
console.log('all tests passed');
// Episode plots: a season's titles and plots come from TMDB; no key, a movie, or a bad season gives an empty list
const epPath = encodeURIComponent('0/Some%20Show/Season%202/');
assert.deepEqual(await (await get(`/api/episodes?path=${epPath}&season=2`)).json(), { episodes: [] }, 'no TMDB key yet');
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: movies, tmdbKey: 'KEY' }) });
const eps = (await (await get(`/api/episodes?path=${epPath}&season=2`)).json()).episodes;
assert.deepEqual(eps.map((e) => [e.episode, e.name, e.overview, e.runtime]), [[1, 'Pilot', 'It begins.', 44], [2, 'Two', '', null]]);
assert.deepEqual(eps.map((e) => e.still), ['/tmdb/w300/pilot.jpg', null], 'episode stills');
assert.equal((await (await get(`/api/episodes?path=${epPath}&season=2`)).json()).poster, '/tmdb/w342/season2.jpg', 'season poster');
assert.deepEqual((await (await get(`/api/episodes?path=${epPath}&season=9`)).json()).episodes, [], 'unknown season');
assert.deepEqual((await (await get(`/api/episodes?path=${epPath}&season=abc`)).json()).episodes, []);
assert.equal((await get('/api/episodes?path=0%2F..%2F..%2Fx%2F&season=1')).status, 400);
tmdbFake.close();

// --- Jellyfin-compatible API: sign in, browse the library as folders, play with byte ranges, keep resume positions
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: movies, jellyfin: false }) });
const jfPort = async () => { for (let i = 0; i < 50; i++) { const j = (await (await get('/api/config')).json()).jellyfin; if (j.running && j.port) return j.port; await new Promise((r) => setTimeout(r, 50)); } throw new Error('Jellyfin API did not start'); };
assert.equal((await (await get('/api/config')).json()).jellyfin.running, false, 'off by default');
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `Clips | ${movies}`, jellyfin: true }) });
const J = `http://127.0.0.1:${await jfPort()}`;
const jget = (p, token, h = {}) => fetch(J + p, { headers: { ...(token ? { 'x-emby-token': token } : {}), ...h } });
const pub = await (await jget('/System/Info/Public')).json();
assert.deepEqual([pub.ProductName, pub.StartupWizardCompleted, /^[0-9a-f]{32}$/.test(pub.Id)], ['Jellyfin Server', true, true]);
assert.equal((await jget('/UserViews')).status, 401, 'needs a token');
const auth = (body) => fetch(J + '/Users/AuthenticateByName', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
let login = await (await auth({ Username: 'anything', Pw: '' })).json();
const T = login.AccessToken;
assert.ok(T && login.User.Name === 'streamhub' && login.ServerId === pub.Id, 'signs in without a password');
assert.equal((await jget('/Users/Me', T)).status, 200);
assert.equal((await jget('/UserViews', 'bad-token')).status, 401);
const views = (await (await jget('/UserViews', T)).json()).Items;
assert.ok(views.length >= 1 && views[0].Type === 'CollectionFolder' && views[0].CollectionType === 'homevideos', 'one library per section');
const kids = (await (await jget(`/Items?ParentId=${views[0].Id}&SortBy=SortName`, T)).json());
assert.deepEqual(kids.Items.map((i) => [i.Name, i.Type]), [['Action', 'Folder'], ['Big Film (2020)', 'Video']], 'folders first, then videos');
const film = kids.Items.find((i) => i.Type === 'Video');
assert.equal(film.IsFolder, false);
assert.equal((await (await jget(`/Items/${film.Id}`, T)).json()).Id, film.Id);
assert.equal((await (await jget(`/Items?ParentId=${views[0].Id}&IncludeItemTypes=Audio`, T)).json()).Items.length, 0, 'types we have none of');
const inAction = (await (await jget(`/Items?ParentId=${kids.Items[0].Id}`, T)).json()).Items;
assert.deepEqual(inAction.map((i) => i.Name), ["Fast"], "opens a folder");
const pbi = await (await fetch(`${J}/Items/${film.Id}/PlaybackInfo`, { method: 'POST', headers: { 'x-emby-token': T, 'content-type': 'application/json' }, body: '{}' })).json();
assert.equal(pbi.MediaSources.length, 1);
assert.deepEqual([pbi.MediaSources[0].SupportsDirectPlay, pbi.MediaSources[0].SupportsTranscoding, pbi.MediaSources[0].Container], [true, false, 'mkv']);
const part = await jget(`/Videos/${film.Id}/stream?static=true&mediaSourceId=${pbi.MediaSources[0].Id}&api_key=${T}`, null, { range: 'bytes=100-199' });
assert.equal(part.status, 206);
assert.equal((await part.arrayBuffer()).byteLength, 100, 'ranges pass through for seeking');
assert.equal((await jget(`/Videos/${film.Id}/stream`)).status, 401, 'streams need a token too');
// resume: a report of progress puts it under Continue watching, and finishing it takes it out
const report = (kind, ticks) => fetch(`${J}/Sessions/Playing${kind}`, { method: 'POST', headers: { 'x-emby-token': T, 'content-type': 'application/json' }, body: JSON.stringify({ ItemId: film.Id, PositionTicks: ticks }) });
assert.equal((await report('/Progress', 600 * 1e7)).status, 204);
const resume = (await (await jget('/UserItems/Resume', T)).json()).Items;
assert.deepEqual(resume.map((i) => [i.Id, i.UserData.PlaybackPositionTicks]), [[film.Id, 600 * 1e7]]);
await fetch(`${J}/UserPlayedItems/${film.Id}`, { method: 'POST', headers: { 'x-emby-token': T } });
assert.equal((await (await jget('/UserItems/Resume', T)).json()).Items.length, 0);
assert.equal((await (await jget(`/Items/${film.Id}`, T)).json()).UserData.Played, true);
assert.equal((await jget('/Shows/NextUp', T).then((r) => r.json())).TotalRecordCount, 0);
// typed items: a section named like movies lists Movie items (with the subtitle file beside each as an external track),
// and one named like series lists Series, Seasons and Episodes, with Next Up after you finish an episode
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `Films | ${movies}\nTV Shows | http://127.0.0.1:${isp.address().port}/tv/`, jellyfin: true }) });
await new Promise((r) => setTimeout(r, 100));
const tviews = (await (await jget('/UserViews', T)).json()).Items;
assert.deepEqual(tviews.map((v) => [v.Name, v.CollectionType]), [['Films', 'movies'], ['TV Shows', 'tvshows']]);
const jq = async (p) => (await jget(p, T)).json();
const movs = (await jq(`/Items?ParentId=${tviews[0].Id}&IncludeItemTypes=Movie&Recursive=true&SortBy=SortName`)).Items;
assert.deepEqual(movs.map((m) => [m.Name, m.Type, m.ProductionYear ?? null]), [['Big Film', 'Movie', 2020], ['Fast', 'Movie', null]]);
assert.equal((await jq(`/Items?ParentId=${tviews[0].Id}&IncludeItemTypes=Series&Recursive=true`)).Items.length, 0, 'no series in a movie section');
assert.deepEqual((await jq(`/Items?SearchTerm=fast&IncludeItemTypes=Movie,Series&Recursive=true`)).Items.map((m) => m.Name), ['Fast'], 'search across sections');
const mpbi = await (await fetch(`${J}/Items/${movs[0].Id}/PlaybackInfo`, { method: 'POST', headers: { 'x-emby-token': T, 'content-type': 'application/json' }, body: '{}' })).json();
const msrc = mpbi.MediaSources[0];
const ext = msrc.MediaStreams.find((s) => s.IsExternal);
assert.ok(ext && ext.Type === 'Subtitle' && ext.DeliveryMethod === 'External' && ext.IsTextSubtitleStream, 'the .srt beside the film is an external subtitle track');
assert.match(msrc.DirectStreamUrl, new RegExp(`^/Videos/${movs[0].Id}/stream\\?static=true&mediaSourceId=${msrc.Id}&api_key=`));
assert.match(await (await jget(ext.DeliveryUrl.replace(/^\//, '/'))).text(), /Hello/, 'serves the subtitle as SRT');
const vtt = await jget(ext.DeliveryUrl.replace('.srt', '.vtt'));
assert.match(vtt.headers.get('content-type'), /text\/vtt/); assert.match(await vtt.text(), /^WEBVTT/, 'and as WebVTT');
assert.equal((await jget(`/Videos/${movs[0].Id}/${msrc.Id}/Subtitles/${ext.Index}/0/Stream.srt`)).status, 401, 'subtitle files need a token too');
const detail = await jq(`/Items/${movs[0].Id}`);
assert.equal(detail.Type, 'Movie');
const shows = (await jq(`/Items?ParentId=${tviews[1].Id}&IncludeItemTypes=Series&Recursive=true`)).Items;
assert.deepEqual(shows.map((x) => [x.Name, x.Type, x.ProductionYear, x.ChildCount]), [['Some Show', 'Series', 2020, 2]]);
const seasons = (await jq(`/Shows/${shows[0].Id}/Seasons`)).Items;
assert.deepEqual(seasons.map((x) => [x.Name, x.Type, x.IndexNumber, x.SeriesName]), [['Season 1', 'Season', 1, 'Some Show'], ['Season 2', 'Season', 2, 'Some Show']]);
const eps1 = (await jq(`/Shows/${shows[0].Id}/Episodes?seasonId=${seasons[0].Id}`)).Items;
assert.deepEqual(eps1.map((x) => [x.Name, x.Type, x.IndexNumber, x.ParentIndexNumber, x.SeriesName, x.SeasonName]), [['Episode 1', 'Episode', 1, 1, 'Some Show', 'Season 1'], ['Episode 2', 'Episode', 2, 1, 'Some Show', 'Season 1']]);
assert.equal((await jq(`/Items?ParentId=${seasons[1].Id}`)).Items.length, 1, 'opens a season');
assert.equal((await jq(`/Items?ParentId=${shows[0].Id}&IncludeItemTypes=Episode&Recursive=true`)).Items.length, 3, 'all episodes of a series');
const epPart = await jget(`/Videos/${eps1[0].Id}/stream?static=true&api_key=${T}`, null, { range: 'bytes=0-9' });
assert.equal(epPart.status, 206, 'an episode streams');
assert.equal((await jq('/Shows/NextUp')).Items.length, 0, 'nothing watched yet');
await fetch(`${J}/UserPlayedItems/${eps1[0].Id}`, { method: 'POST', headers: { 'x-emby-token': T } });
assert.deepEqual((await jq('/Shows/NextUp')).Items.map((x) => [x.Name, x.IndexNumber]), [['Episode 2', 2]], 'Next Up is the episode after the last one finished');
assert.equal((await jq(`/Shows/${shows[0].Id}/Seasons`)).Items.length, 2);
assert.equal((await jq(`/Items/${shows[0].Id}`)).Type, 'Series');

// optional password: wrong one is refused, the right one signs in
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `Clips | ${movies}`, jellyfin: true, jellyfinPass: 'sesame' }) });
assert.equal((await auth({ Username: 'streamhub', Pw: 'nope' })).status, 401);
assert.equal((await auth({ Username: 'streamhub', Pw: 'sesame' })).status, 200);
assert.equal((await (await get('/api/config')).json()).jellyfin.hasPassword, true);
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: movies, jellyfin: false }) });
await assert.rejects(fetch(J + '/System/Info/Public'), 'switching it off closes the port');

// --- books and music: file kinds, EPUB and CBZ read from inside their zips, audio streamed with ranges
const shelf = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-shelf-'));
fs.mkdirSync(path.join(shelf, 'Author'));
fs.writeFileSync(path.join(shelf, 'Author', 'Tale.epub'), zipOf([
  ['mimetype', 'application/epub+zip'],
  ['META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
  ['OEBPS/content.opf', '<package><metadata><dc:title>A Tale &amp; More</dc:title><dc:creator>Some Author</dc:creator></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/ch%202.xhtml" media-type="application/xhtml+xml"/><item id="img" href="img/a.png" media-type="image/png"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'],
  ['OEBPS/nav.xhtml', '<html><body><nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">One</a></li><li><a href="text/ch%202.xhtml#x">Two &amp; Three</a></li></ol></nav></body></html>'],
  ['OEBPS/text/ch1.xhtml', '<html><body><p>Chapter one</p><img src="../img/a.png"/><script>alert(1)</script></body></html>'],
  ['OEBPS/text/ch 2.xhtml', '<html><body><p>Chapter two</p></body></html>'],
  ['OEBPS/img/a.png', 'PNGDATA'],
]));
fs.writeFileSync(path.join(shelf, 'Comic.cbz'), zipOf([['10.jpg', 'PAGE10'], ['2.jpg', 'PAGE2'], ['1.jpg', 'PAGE1'], ['readme.txt', 'x']]));
fs.writeFileSync(path.join(shelf, 'Manual.pdf'), Buffer.from('%PDF-1.4 fake'));
fs.writeFileSync(path.join(shelf, 'Song.mp3'), Buffer.alloc(500, 3));
fs.writeFileSync(path.join(shelf, 'Old.wma'), Buffer.alloc(100, 1));
const cfg = await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `Shelf | ${shelf}`, jellyfin: false }) });
assert.equal(cfg.status, 200);
const top = await (await get(`/api/browse?path=0/`)).json();
assert.deepEqual(top.items.map((i) => [i.name, i.kind]), [['Author', 'dir'], ['Comic.cbz', 'book'], ['Manual.pdf', 'book'], ['Old.wma', 'audio'], ['Song.mp3', 'audio']], 'books and audio are listed');
const epub = await (await get(`/api/epub?path=${encodeURIComponent('0/Author/Tale.epub')}`)).json();
assert.deepEqual([epub.title, epub.author, epub.spine, epub.toc.map((t) => [t.title, t.href])], ['A Tale & More', 'Some Author', ['OEBPS/text/ch1.xhtml', 'OEBPS/text/ch 2.xhtml'], [['One', 'OEBPS/text/ch1.xhtml'], ['Two & Three', 'OEBPS/text/ch 2.xhtml#x']]]);
const chap = await get(`/epub/${epub.id}/OEBPS/text/ch1.xhtml`);
assert.match(await chap.text(), /Chapter one/);
assert.match(chap.headers.get('content-security-policy'), /default-src 'none'/, 'a book can’t run scripts');
assert.equal(await (await get(`/epub/${epub.id}/OEBPS/img/a.png`)).text(), 'PNGDATA', 'images load relative to the chapter');
assert.equal((await get(`/epub/${epub.id}/OEBPS/text/ch%202.xhtml`)).status, 200, 'names with spaces');
assert.equal((await get(`/epub/${epub.id}/OEBPS/nope.xhtml`)).status, 404);
assert.equal((await (await get(`/api/cbz?path=${encodeURIComponent('0/Comic.cbz')}`)).json()).pages, 3, 'image pages only');
assert.deepEqual(await Promise.all([0, 1, 2].map(async (i) => (await get(`/api/cbz-page?path=${encodeURIComponent('0/Comic.cbz')}&i=${i}`)).text())), ['PAGE1', 'PAGE2', 'PAGE10'], 'pages in natural order');
assert.equal((await get(`/api/cbz-page?path=${encodeURIComponent('0/Comic.cbz')}&i=9`)).status, 404);
assert.equal((await get(`/api/epub?path=${encodeURIComponent('0/Comic.cbz')}`)).status, 422, 'not an EPUB');
const mp3 = await get('/stream?path=0/Song.mp3', { range: 'bytes=10-19' });
assert.deepEqual([mp3.status, mp3.headers.get('content-type'), (await mp3.arrayBuffer()).byteLength], [206, 'audio/mpeg', 10], 'music streams with ranges');
assert.equal((await get('/stream?path=0/Manual.pdf')).headers.get('content-type'), 'application/pdf');
fs.rmSync(shelf, { recursive: true, force: true });
server.close(); isp.close(); fs.rmSync(process.env.CONFIG_FILE, { force: true });
