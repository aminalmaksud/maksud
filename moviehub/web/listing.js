// Parses an HTTP "Index of /" page (nginx, Apache, lighttpd, caddy...) into entries.

export const VIDEO_EXT = new Set(['mkv', 'mp4', 'm4v', 'avi', 'mov', 'webm', 'ts', 'wmv', 'flv', 'mpg', 'mpeg']);
export const SUB_EXT = new Set(['srt', 'vtt']);

export function extOf(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

function decode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
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
    if (!u.pathname.startsWith(dir.pathname) || u.pathname === dir.pathname) continue; // parent / self
    if (!u.pathname.startsWith(base.pathname)) continue;
    const isDir = u.pathname.endsWith('/');
    const rel = u.pathname.slice(base.pathname.length);
    const name = decode(rel.replace(/\/$/, '').split('/').pop());
    if (!name || name.startsWith('.') || seen.has(rel)) continue;
    const ext = extOf(name);
    const kind = isDir ? 'dir' : VIDEO_EXT.has(ext) ? 'video' : SUB_EXT.has(ext) ? 'sub' : 'other';
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
