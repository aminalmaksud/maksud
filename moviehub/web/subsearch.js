// Online subtitle search, like VLC's: OpenSubtitles.com and SubDL. Both need a free API key from the user
// (Settings). Results that match the video's OpenSubtitles hash (same file, so same timing) come first.
import zlib from 'node:zlib';

const OS_API = process.env.OPENSUBTITLES_API || 'https://api.opensubtitles.com/api/v1';
const SD_API = process.env.SUBDL_API || 'https://api.subdl.com/api/v1';
const SD_DL = process.env.SUBDL_DL || 'https://dl.subdl.com';
const UA = 'StreamHub v1.0.1';
const TIMEOUT = 15000;

/** OpenSubtitles' movie hash: file size plus the 64-bit sums of the first and last 64 KB. `read(start, end)` gives bytes. */
export async function movieHash(size, read) {
  if (!size || size < 131072) return null;
  const [head, tail] = await Promise.all([read(0, 65535), read(size - 65536, size - 1)]);
  if (head.length < 65536 || tail.length < 65536) return null;
  let sum = BigInt(size);
  for (const b of [head, tail]) for (let i = 0; i < 65536; i += 8) sum += b.readBigUInt64LE(i);
  return (sum & 0xffffffffffffffffn).toString(16).padStart(16, '0');
}

const osToken = new Map(); // "user" -> { token, at }
async function osHeaders(keys, auth) {
  const h = { 'Api-Key': keys.opensubsKey, 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (auth && keys.opensubsUser && keys.opensubsPass) {
    let t = osToken.get(keys.opensubsUser);
    if (!t || Date.now() - t.at > 20 * 3600e3) {
      const r = await fetch(`${OS_API}/login`, { method: 'POST', headers: h, body: JSON.stringify({ username: keys.opensubsUser, password: keys.opensubsPass }), signal: AbortSignal.timeout(TIMEOUT) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token) throw new Error(`OpenSubtitles login failed${j.message ? `: ${j.message}` : ''}`);
      t = { token: j.token, at: Date.now() };
      osToken.set(keys.opensubsUser, t);
    }
    h.Authorization = `Bearer ${t.token}`;
  }
  return h;
}

async function searchOpenSubtitles(q, keys) {
  const p = new URLSearchParams();
  if (q.tmdbId && q.season != null) { p.set('parent_tmdb_id', q.tmdbId); p.set('season_number', q.season); if (q.episode != null) p.set('episode_number', q.episode); }
  else if (q.tmdbId) p.set('tmdb_id', q.tmdbId);
  else {
    p.set('query', q.query);
    if (q.season != null) p.set('season_number', q.season);
    if (q.episode != null) p.set('episode_number', q.episode);
    if (q.year) p.set('year', q.year);
  }
  if (q.hash) p.set('moviehash', q.hash);
  p.set('languages', q.langs.join(','));
  const r = await fetch(`${OS_API}/subtitles?${p}`, { headers: await osHeaders(keys, false), signal: AbortSignal.timeout(TIMEOUT) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenSubtitles: ${j.message || r.status}`);
  return (j.data || []).flatMap((d) => {
    const a = d.attributes || {};
    const f = a.files?.[0];
    if (!f) return [];
    return [{
      id: `os:${f.file_id}`, provider: 'OpenSubtitles', lang: (a.language || '').toLowerCase(), name: a.release || f.file_name || '',
      downloads: a.download_count || 0, hashMatch: !!a.moviehash_match, hi: !!a.hearing_impaired, machine: !!(a.machine_translated || a.ai_translated),
    }];
  });
}

async function searchSubdl(q, keys) {
  const p = new URLSearchParams({ api_key: keys.subdlKey, subs_per_page: '30', languages: q.langs.map((l) => l.toUpperCase()).join(',') });
  if (q.tmdbId) p.set('tmdb_id', q.tmdbId); else p.set('film_name', q.query);
  if (q.season != null) { p.set('type', 'tv'); p.set('season_number', q.season); if (q.episode != null) p.set('episode_number', q.episode); }
  else p.set('type', 'movie');
  if (q.year && !q.tmdbId) p.set('year', q.year);
  const r = await fetch(`${SD_API}/subtitles?${p}`, { signal: AbortSignal.timeout(TIMEOUT) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status === false) {
    if (/not found|no subtitles/i.test(j.error || j.message || '')) return [];
    throw new Error(`SubDL: ${j.error || j.message || r.status}`);
  }
  return (j.subtitles || []).filter((s) => s.url).map((s) => ({
    id: `sd:${s.url}`, provider: 'SubDL', lang: (s.language || '').toLowerCase(), name: s.release_name || s.name || '',
    downloads: 0, hashMatch: false, hi: !!s.hi, machine: false, ep: q.episode ?? null,
  }));
}

/** Searches every provider that has a key. Errors from one provider don't hide the other's results. */
export async function searchSubtitles(q, keys) {
  const jobs = [];
  if (keys.opensubsKey) jobs.push(searchOpenSubtitles(q, keys));
  if (keys.subdlKey) jobs.push(searchSubdl(q, keys));
  if (!jobs.length) return { results: [], errors: [], needsKey: true };
  const settled = await Promise.allSettled(jobs);
  const results = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  const errors = settled.filter((s) => s.status === 'rejected').map((s) => s.reason.message);
  // Same file (hash) first, then your language order, then human-made over machine-translated, then most downloaded.
  const langRank = (l) => { const i = q.langs.indexOf(l); return i < 0 ? q.langs.length : i; };
  const rank = (r) => (r.hashMatch ? 4e9 : 0) + (q.langs.length - langRank(r.lang)) * 1e8 - (r.machine ? 5e7 : 0) + Math.min(r.downloads, 4e7);
  return { results: results.sort((a, b) => rank(b) - rank(a)).slice(0, 60), errors, needsKey: false };
}

/** Files in a .zip (stored or deflated entries), read from its central directory. */
export function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = [];
  for (let i = 0; i < count && buf.readUInt32LE(p) === 0x02014b50; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (!name.endsWith('/') && (method === 0 || method === 8)) files.push({ name, data: method === 8 ? zlib.inflateRawSync(raw) : raw });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const SUB_RE = /\.(srt|vtt)$/i;
/** Picks the subtitle for `episode` from a season pack, else the biggest one. */
function pickFromZip(files, episode) {
  const subs = files.filter((f) => SUB_RE.test(f.name));
  if (!subs.length) throw new Error('No .srt file in this download');
  if (episode != null) {
    const re = new RegExp(`(?:e|x|episode\\s*)0*${episode}(?!\\d)`, 'i');
    const hit = subs.find((f) => re.test(f.name.split('/').pop()));
    if (hit) return hit;
  }
  return subs.sort((a, b) => b.data.length - a.data.length)[0];
}

const decode = (buf) => {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  const t = buf.toString('utf8');
  return t.includes('�') ? buf.toString('latin1') : t.replace(/^﻿/, '');
};

const cache = new Map();
/** Downloads one result; resolves to { name, text } (SRT or VTT text). */
export function fetchSubtitle(id, keys, { episode = null } = {}) {
  const ck = `${id}|${episode}`;
  if (!cache.has(ck)) {
    const job = (async () => {
      if (!/^os:\d+$/.test(id) && !/^sd:\/[\w\-./]+$/.test(id)) throw new Error('Unknown subtitle');
      if (id.startsWith('os:')) {
        if (!keys.opensubsKey) throw new Error('Add your OpenSubtitles API key in Settings');
        const r = await fetch(`${OS_API}/download`, { method: 'POST', headers: await osHeaders(keys, true), body: JSON.stringify({ file_id: Number(id.slice(3)) }), signal: AbortSignal.timeout(TIMEOUT) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.link) throw new Error(j.message || `OpenSubtitles download failed (${r.status})`);
        const f = await fetch(j.link, { signal: AbortSignal.timeout(TIMEOUT) });
        if (!f.ok) throw new Error(`OpenSubtitles download failed (${f.status})`);
        return { name: j.file_name || 'subtitle.srt', text: decode(Buffer.from(await f.arrayBuffer())) };
      }
      if (id.startsWith('sd:')) {
        const f = await fetch(SD_DL + id.slice(3), { signal: AbortSignal.timeout(TIMEOUT) });
        if (!f.ok) throw new Error(`SubDL download failed (${f.status})`);
        const buf = Buffer.from(await f.arrayBuffer());
        const file = buf.readUInt32LE(0) === 0x04034b50 ? pickFromZip(unzip(buf), episode) : { name: 'subtitle.srt', data: buf };
        return { name: file.name.split('/').pop(), text: decode(file.data) };
      }
      throw new Error('Unknown subtitle');
    })();
    job.catch(() => cache.delete(ck));
    cache.set(ck, job);
  }
  return cache.get(ck);
}
