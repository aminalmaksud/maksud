// Live TV from M3U / M3U8 playlists: the channels, grouped, with their logos. Playing them is the server's job (/live).
import fs from 'node:fs';
import crypto from 'node:crypto';

/** "Name | https://host/list.m3u" or just the address or a file path. */
export function splitPlaylist(line) {
  const i = String(line).indexOf('|');
  const name = i >= 0 ? line.slice(0, i).trim() : '';
  return { name, src: (i >= 0 ? line.slice(i + 1) : line).trim() };
}

const attrs = (s) => { const o = {}; for (const m of s.matchAll(/([\w-]+)="([^"]*)"/g)) o[m[1].toLowerCase()] = m[2]; return o; };

/** #EXTINF:-1 tvg-logo="…" group-title="News",Channel name, then the address on the next line. */
export function parseM3U(text, listName = '') {
  const out = [];
  let cur = null, groupOverride = '';
  for (const raw of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const comma = line.indexOf(',', line.indexOf(':'));
      // the commas inside quoted attributes don't count: split at the last comma outside quotes
      let cut = -1, q = false;
      for (let i = 0; i < line.length; i++) { if (line[i] === '"') q = !q; else if (line[i] === ',' && !q) { cut = i; break; } }
      const head = cut >= 0 ? line.slice(0, cut) : line, title = cut >= 0 ? line.slice(cut + 1).trim() : (comma >= 0 ? line.slice(comma + 1).trim() : '');
      const a = attrs(head);
      cur = { name: title || a['tvg-name'] || 'Channel', logo: a['tvg-logo'] || '', group: a['group-title'] || '', tvgId: a['tvg-id'] || '' };
    } else if (line.startsWith('#EXTGRP:')) {
      groupOverride = line.slice(8).trim();
    } else if (line.startsWith('#')) {
      continue;
    } else if (/^(https?|rtmp|rtsp|udp|rtp|mms):\/\//i.test(line)) {
      const c = cur || { name: line.replace(/^.*\//, '') || 'Channel', logo: '', group: '', tvgId: '' };
      if (!c.group) c.group = groupOverride;
      out.push({ ...c, group: c.group || listName || 'Channels', url: line, id: crypto.createHash('sha1').update(line).digest('hex').slice(0, 12) });
      cur = null;
    }
  }
  return out;
}

const cache = new Map(); // source -> { at, job }

/** The channels of one playlist (a web address or a file on this computer), kept for 10 minutes. */
export function loadPlaylist(entry, { fetchImpl = fetch, force = false } = {}) {
  const { name, src } = splitPlaylist(entry);
  const hit = cache.get(src);
  if (hit && !force && Date.now() - hit.at < 10 * 60e3) return hit.job;
  const job = (async () => {
    let text;
    if (/^https?:\/\//i.test(src)) {
      const r = await fetchImpl(src, { headers: { 'user-agent': 'VLC/3.0.20 LibVLC/3.0.20' }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`The playlist answered ${r.status}`);
      text = await r.text();
    } else {
      text = await fs.promises.readFile(src, 'utf8');
    }
    if (!/#EXTM3U|#EXTINF/i.test(text)) throw new Error('That doesn’t look like an M3U playlist');
    return parseM3U(text, name);
  })();
  job.catch(() => cache.delete(src));
  cache.set(src, { at: Date.now(), job });
  return job;
}
export const forgetPlaylists = () => cache.clear();
