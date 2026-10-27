// Spins up a fake ISP server (nginx-style listing + Range support) and exercises the proxy.
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseListing, srtToVtt } from './listing.js';

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
assert.match(srtToVtt('1\r\n00:00:01,500 --> 00:00:02,000\r\nHi'), /^WEBVTT\n\n1\n00:00:01\.500 --> 00:00:02\.000\nHi/);

const FILE = Buffer.alloc(1000, 7);
const isp = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url);
  if (u === '/movies/' || u === '/movies/Action/') { res.setHeader('content-type', 'text/html'); return res.end(u === '/movies/' ? nginx : apache); }
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

process.env.SERVER_URL = `http://127.0.0.1:${isp.address().port}/movies/`;
process.env.PORT = '0';
process.env.CONFIG_FILE = path.join(os.tmpdir(), `moviehub-test-${process.pid}.json`);
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
fs.symlinkSync(path.join(lib, 'secret.txt'), path.join(lib, 'Movie', 'Inception (2010)', 'escape.mkv'));
const movieDir = path.join(lib, 'Movie');
assert.equal((await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `Movies | ${movies}\nNope | ${path.join(lib, 'missing')}` }) })).status, 400, 'missing folder rejected');
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ servers: `Movies | ${movies}\nMy Movie | ${movieDir}` }) });
r = await (await get('/api/config')).json();
assert.deepEqual(r.localLibs, [1]);
r = await (await get('/api/browse?path=1/')).json();
assert.deepEqual(r.items.map((i) => [i.name, i.kind]), [['Inception (2010)', 'dir']], 'system folders hidden');
assert.deepEqual(r.localLibs, [1]);
r = await (await get(`/api/browse?path=${encodeURIComponent(r.items[0].path)}`)).json();
assert.deepEqual(r.items.map((i) => i.kind).sort(), ['image', 'sub', 'video', 'video']);
const vid = r.items.find((i) => i.name.endsWith('1080p.mkv'));
r = await get(`/stream?path=${encodeURIComponent(vid.path)}`, { range: 'bytes=10-19' });
assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 10-19/1000');
assert.match(await (await get(`/subs?path=${encodeURIComponent(vid.path.replace(/mkv$/, 'srt'))}`)).text(), /Dream/);
assert.equal((await get(`/img?path=${encodeURIComponent(vid.path.replace(/[^/]+$/, 'poster.jpg'))}`)).status, 200);
assert.equal((await get(`/stream?path=${encodeURIComponent(vid.path.replace(/[^/]+$/, 'escape.mkv'))}`)).status, 400, 'symlink out of the library refused');
assert.equal((await get('/stream?path=1%2F..%2Fsecret.txt')).status, 400, '.. refused');
r = await (await get('/api/search?q=incep')).json();
assert.deepEqual(r.items.map((i) => i.name), ['Inception (2010)'], 'local folders are searched');
r = await (await get('/api/status')).json();
assert.equal(r.libraries[1].local, true);
r = await fetch(base + '/api/downloads', { method: 'POST', body: JSON.stringify({ path: vid.path }) });
assert.ok([400, 404].includes(r.status), 'no downloading what is already here');
assert.equal((await fetch(base + '/api/pick-folder', { method: 'POST' })).status, process.platform === 'linux' ? 501 : 200);
fs.rmSync(lib, { recursive: true, force: true });
console.log('all tests passed');
server.close(); isp.close(); fs.rmSync(process.env.CONFIG_FILE, { force: true });
