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
r = await (await get('/api/browse?path=Action/')).json();
assert.equal(r.items[0].path, 'Action/Fast.mp4');
assert.equal((await get('/api/browse?path=../../etc/')).status, 400);
assert.equal((await get('/stream?path=..%2F..%2Fsecret')).status, 400);
r = await get('/stream?path=Big%2520Film%2520(2020).mkv', { range: 'bytes=100-199' });
assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 100-199/1000');
assert.equal(r.headers.get('content-type'), 'video/x-matroska'); assert.equal((await r.arrayBuffer()).byteLength, 100);
assert.match(await (await get('/subs?path=Big%2520Film%2520(2020).srt')).text(), /^WEBVTT/);
assert.equal((await get('/')).status, 200);
assert.equal((await get('/..%2Fserver.js')).status, 404);
// h5ai: same proxy, different library root
const h5 = `http://127.0.0.1:${isp.address().port}/h5/`;
await fetch(base + '/api/config', { method: 'POST', body: JSON.stringify({ serverUrl: h5 }) });
r = await (await get('/api/browse?path=Films/')).json();
assert.deepEqual(r.items.map((i) => i.path), ['Films/Dune%20(2021)/', 'Films/Up.mp4']);
console.log('all tests passed');
server.close(); isp.close(); fs.rmSync(process.env.CONFIG_FILE, { force: true });
