// Spins up a fake ISP server (nginx-style listing + Range support) and exercises the proxy.
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
      const href = JSON.parse(b).items.href;
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
      const hits = Object.entries(tree).flatMap(([dir, kids]) => kids.map((k) => dir + k)).filter((h) => new RegExp(body.search.pattern, 'i').test(h.split('/').filter(Boolean).pop()));
      return res.end(JSON.stringify({ search: hits.map((h) => ({ href: enc(h) })) }));
    }
    const href = decodeURIComponent(body.items.href);
    const kids = tree[href] || [];
    res.end(JSON.stringify({ items: [{ href: '/DHAKA-FLIX-7/' }, { href: enc(href) }, ...kids.map((k) => ({ href: enc(href + k) }))] }));
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
assert.deepEqual(r.items.map((i) => i.name), ['Dune Part Two (2024) 1080p'], 'the movie, not also its file');
df.close();
console.log('all tests passed');
server.close(); isp.close(); fs.rmSync(process.env.CONFIG_FILE, { force: true });
