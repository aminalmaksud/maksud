// Parses an HTTP "Index of /" page (nginx, Apache, lighttpd, caddy...) into entries.

export const VIDEO_EXT = new Set(['mkv', 'mp4', 'm4v', 'avi', 'mov', 'webm', 'ts', 'wmv', 'flv', 'mpg', 'mpeg']);
export const SUB_EXT = new Set(['srt', 'vtt']);
export const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);

export function extOf(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

function decode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * Servers spell the same path differently ("(" vs "%28", "&" vs "%26", raw spaces...), so every path
 * is rewritten into one spelling before it is compared or handed out.
 */
export function canonPath(pathname) {
  return pathname.split('/').map((seg) => encodeURIComponent(decode(seg))).join('/');
}

function unescapeHtml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
}

/**
 * @param html     directory page body
 * @param dirUrl   absolute URL of the directory that was fetched (ends with "/")
 * @param baseUrl  absolute URL of the library root (ends with "/")
 * @returns entries { name, path, isDir, kind } where path is relative to baseUrl (still percent-encoded)
 */
export function parseListing(html, dirUrl, baseUrl) {
  const dir = new URL(dirUrl);
  const base = new URL(baseUrl);
  const dirPath = canonPath(dir.pathname), basePath = canonPath(base.pathname);
  const seen = new Set();
  const out = [];
  const re = /<a\s+[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = unescapeHtml(m[1] ?? m[2] ?? '').trim();
    if (!href || href.startsWith('#') || /^(javascript|mailto):/i.test(href)) continue;
    let u;
    try { u = new URL(href, dir); } catch { continue; }
    if (u.origin !== base.origin || u.search) continue;           // sort links, external links
    const path = canonPath(u.pathname);
    if (!path.startsWith(dirPath) || path === dirPath) continue; // parent / self
    if (!path.startsWith(basePath)) continue;
    const isDir = path.endsWith('/');
    const rel = path.slice(basePath.length);
    const name = decode(rel.replace(/\/$/, '').split('/').pop());
    if (!name || name.startsWith('.') || seen.has(rel)) continue;
    const ext = extOf(name);
    const kind = isDir ? 'dir' : VIDEO_EXT.has(ext) ? 'video' : SUB_EXT.has(ext) ? 'sub' : IMG_EXT.has(ext) ? 'image' : 'other';
    if (kind === 'other') continue;
    seen.add(rel);
    out.push({ name, path: rel, isDir, kind });
  }
  out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.isDir ? -1 : 1));
  return out;
}

export function srtToVtt(srt) {
  const body = srt.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + body;
}

const JUNK = /\b(2160p|1080p|720p|576p|480p|4k|uhd|hdr|hdr10|dv|bluray|blu ray|brrip|bdrip|bdremux|remux|web ?dl|webrip|web|hdrip|dvdrip|dvdscr|hdtv|hdcam|camrip|x264|x265|h ?264|h ?265|hevc|avc|10bit|8bit|aac\d?|ac3|eac3|dts|ddp?\d?|atmos|truehd|dual audio|multi audio|hindi|english|esubs?|subbed|dubbed|proper|repack|extended|unrated|imax|yify|yts|rarbg|psa|pahe)\b/i;

/** "Dune.Part.Two.2024.1080p.WEB-DL.x264" -> { title: "Dune Part Two", year: 2024 }; also pulls season/episode. */
export function parseName(raw) {
  let s = raw;
  const ext = extOf(s);
  if (VIDEO_EXT.has(ext) || SUB_EXT.has(ext) || IMG_EXT.has(ext)) s = s.slice(0, -(ext.length + 1));
  s = s.replace(/[._]+/g, ' ').replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
  const out = { title: s, year: null, season: null, episode: null, generic: false };
  const ep = /\bS(\d{1,2}) ?E(\d{1,3})\b|\b(\d{1,2})x(\d{2,3})\b/i.exec(s);
  const anime = !ep && /\s-\s(\d{1,4})(?:v\d)?(?:\s|$)/.exec(s); // "[Group] Show - 12 (1080p)"
  if (ep) { out.season = Number(ep[1] ?? ep[3]); out.episode = Number(ep[2] ?? ep[4]); s = s.slice(0, ep.index); }
  else if (anime) { out.episode = Number(anime[1]); s = s.slice(0, anime.index); }
  const season = /^(?:season|s) ?(\d{1,2})$/i.exec(s);
  if (season) { out.season = Number(season[1]); out.generic = true; }
  const yr = [...s.matchAll(/(?:^|[\s(])((?:19|20)\d{2})(?=[\s)]|$)/g)].find((m) => m.index > 0);
  if (yr) { out.year = Number(yr[1]); s = s.slice(0, yr.index); }
  const junk = JUNK.exec(s);
  if (junk && junk.index > 0) s = s.slice(0, junk.index);
  s = s.replace(/[\s\-–(]+$/, '').replace(/^[\s\-–]+/, '').trim();
  out.title = s || out.title;
  if (/^(?:episode|ep|e|part) ?\d{1,4}$/i.test(out.title) || /^\d{1,3}$/.test(out.title)) out.generic = true;
  return out;
}
