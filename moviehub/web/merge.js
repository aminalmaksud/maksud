// Libraries with the same name ("Movies" and "Movies 1080p") show up as one section. Their folders are matched
// by name with the quality left out, so "English Movies" + "English Movies (1080p)", "(2024)" + "(2024) 1080p"
// and "Dune Part Two (2024) 720p" + "Dune Part Two (2024) 1080p" each become one entry. Nothing here knows any
// particular server: a new address or folder joins in by its name alone.

const QUALITY = /\b(?:2160p|1440p|1080p|720p|576p|480p|360p|4k|uhd|fhd|hd|sd|hdr10?\+?|hdr|dv|10.?bit|x26[45]|h\.?26[45]|hevc|avc|web.?dl|web.?rip|webrip|blu.?ray|brrip|bdrip|dvdrip|hdrip|hdtv|remux|imax|dual.?audio|multi.?audio|esub|esubs|hq|high quality)\b/gi;

/** "Movies 1080p" -> "movies"; "TV & Web Series" -> "tv web series". */
export const groupKey = (label) => keyOf(label) || String(label).toLowerCase();

/** Name with quality, codec and punctuation left out, used to match the same title across servers. */
export function keyOf(name) {
  return String(name)
    .replace(/\.[a-z0-9]{2,4}$/i, (x) => (/^\.(mkv|mp4|m4v|avi|mov|webm|ts|wmv|flv|mpg|mpeg|srt|vtt)$/i.test(x) ? '' : x))
    .replace(/[._]+/g, ' ')
    .replace(QUALITY, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().toLowerCase();
}

const RANK = { '2160p': 5, '4k': 5, uhd: 5, '1440p': 4, '1080p': 3, fhd: 3, '720p': 2, hd: 2, '576p': 1, '480p': 1, sd: 0, '360p': 0 };

/** "1080p" from a file or folder name, else from the library's label ("Movies 1080p"). */
export function qualityOf(name, libraryLabel = '') {
  for (const s of [name, libraryLabel]) {
    const m = /\b(2160p|4k|uhd|1440p|1080p|720p|576p|480p|360p)\b/i.exec(s || '');
    if (m) return m[1].toLowerCase() === 'uhd' ? '4K' : m[1].toLowerCase() === '4k' ? '4K' : m[1].toLowerCase();
  }
  return '';
}
const rank = (q) => RANK[String(q).toLowerCase()] ?? -1;

/** Virtual paths list the real folders they join: "v:" + base64url(JSON). */
export const encodeV = (paths) => 'v:' + Buffer.from(JSON.stringify(paths)).toString('base64url');
export function decodeV(rel) {
  try {
    const list = JSON.parse(Buffer.from(String(rel).slice(2), 'base64url').toString('utf8'));
    if (Array.isArray(list) && list.length && list.every((p) => typeof p === 'string' && /^\d+\//.test(p))) return list;
  } catch { /* fall through */ }
  return null;
}

/**
 * Joins folder listings from several libraries. `listings` are [{ items, label }] in library order.
 * Folders with the same key become one virtual folder; videos with the same key become one entry with
 * `versions` (best quality first). Everything else (subtitles, images) is kept as it is.
 */
export function mergeListings(listings) {
  const out = [], byKey = new Map();
  listings.forEach(({ items, label }) => {
    for (const it of items || []) {
      if (it.kind !== 'dir' && it.kind !== 'video') { out.push(it); continue; }
      const k = (it.isDir ? 'd:' : 'v:') + (keyOf(it.name) || it.name.toLowerCase());
      const prev = byKey.get(k);
      const entry = { ...it, quality: qualityOf(it.name, label), label };
      if (!prev) { byKey.set(k, { first: entry, all: [entry] }); out.push(k); continue; }
      prev.all.push(entry);
    }
  });
  return out.map((x) => {
    if (typeof x !== 'string') return x;
    const { first, all } = byKey.get(x);
    if (all.length === 1) { const { quality, label, ...it } = first; return it; }
    if (first.isDir) {
      // The plainest name wins: "English Movies" over "English Movies (1080p)".
      const name = [...all].sort((a, b) => a.name.length - b.name.length)[0].name;
      return { name, path: encodeV(all.map((a) => a.path)), isDir: true, kind: 'dir', sources: all.length };
    }
    const versions = [...all].sort((a, b) => rank(b.quality) - rank(a.quality))
      .map((a) => ({ path: a.path, quality: a.quality || a.label || `Copy ${all.indexOf(a) + 1}`, name: a.name, size: a.size }));
    const best = all.find((a) => a.path === versions[0].path);
    const { quality, label, ...it } = best;
    return { ...it, versions };
  });
}
