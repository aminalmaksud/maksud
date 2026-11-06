// Finds the movies, series, seasons and episodes in your folders, for the Jellyfin API. Your servers are plain folders,
// so this guesses from names, the same way the app's own pages do (Season folders, S01E02 file names, one folder per title).
import { parseName } from './listing.js';

export const SEASON_RE = /^(?:(?:season|series|s)[ ._-]*\d{1,2}\b|specials?\b)/i;
export const EP_RE = /\bS\d{1,2} ?E\d{1,3}\b|\b\d{1,2}x\d{2,3}\b|\b(?:ep|episode|e)[ ._-]?\d{1,3}\b|\s-\s\d{1,4}\b|^\d{1,3}\b/i;
export const EP_DIR_RE = /\bS\d{1,2} ?E\d{1,3}\b|\b(?:ep|episode|e)[ ._-]?\d{1,3}\b/i;

/** What a section holds, from its name: movies, series, or "don't know" (shown as folders). */
export function collectionTypeOf(name) {
  if (/movie|film|cinema/i.test(name)) return 'movies';
  if (/\b(tv|series|serial|show|shows|web|anime|cartoons?|drama|dramas)\b/i.test(name)) return 'tvshows';
  return 'homevideos';
}

export const seasonNum = (n) => {
  const t = n.trim();
  const m = /^(?:season|series|s)[ ._-]*(\d{1,2})\b/i.exec(t);
  return m ? Number(m[1]) : /^specials?\b/i.test(t) ? 0 : null;
};
export const seasonLabel = (n) => { const k = seasonNum(n); return k === 0 ? 'Specials' : k != null ? `Season ${k}` : n; };

export function epNumber(name, i = 0) {
  const m = /\bS\d{1,2} ?E(\d{1,3})\b|\b\d{1,2}x(\d{2,3})\b|\b(?:ep|episode|e)[ ._-]?(\d{1,3})\b|\s-\s(\d{1,4})\b|^(\d{1,3})\b/i.exec(name);
  return m ? Number(m.slice(1).find(Boolean)) : i + 1;
}
const epSeason = (name) => { const m = /\bS(\d{1,2}) ?E\d|\b(\d{1,2})x\d{2}/i.exec(name); return m ? Number(m[1] ?? m[2]) : null; };
export const isEpisodic = (vids) => vids.length >= 2 && vids.filter((v) => EP_RE.test(v.name)).length >= vids.length * 0.6;

const clean = (n) => String(n).replace(/\/$/, '');
const nameOf = (it) => clean(it.name);

/** The Season folders of a series folder's listing, in order; null when it isn't a series folder. */
export function seasonDirs(items) {
  const dirs = items.filter((i) => i.isDir), vids = items.filter((i) => i.kind === 'video');
  if (!dirs.length || vids.length > 1) return null;
  const seasons = dirs.filter((d) => SEASON_RE.test(nameOf(d).trim()));
  if (!seasons.length || seasons.length < dirs.length * 0.5) return null;
  return seasons.sort((a, b) => (seasonNum(nameOf(a)) ?? 999) - (seasonNum(nameOf(b)) ?? 999));
}

/** Title and year from a folder or file name: "Dune.Part.Two.2024.1080p.mkv" -> Dune Part Two, 2024. */
export function titleOf(rawName) {
  const p = parseName(clean(rawName));
  return { title: p.title || clean(rawName), year: p.year || null };
}

/**
 * Walks a section in the background and collects what's in it. `children(rel)` lists a folder. The result fills in
 * as it goes (`done` flips at the end), so a client can show titles from the first answer. A cap on folders listed
 * and on depth keeps a huge server from keeping it busy for ever.
 */
export function crawl(viewRel, type, children, { maxDirs = 6000, maxDepth = 5, workers = 4 } = {}) {
  const idx = { movies: [], series: [], done: false, listed: 0, truncated: false, at: Date.now() };
  const queue = [{ rel: viewRel, depth: 0, name: '' }];
  const addSeries = (rel, name, seasons) => { const { title, year } = titleOf(name); idx.series.push({ rel, name: title, year, seasons }); };
  const walk = async ({ rel, depth, name }) => {
    let items;
    try { items = await children(rel); } catch { return; }
    idx.listed++;
    const dirs = items.filter((i) => i.isDir), vids = items.filter((i) => i.kind === 'video');
    if (type === 'tvshows') {
      const seasons = seasonDirs(items);
      if (seasons && depth > 0) return addSeries(rel, name, seasons.map((d) => ({ n: seasonNum(nameOf(d)), rel: d.path, name: seasonLabel(nameOf(d)) })));
      if (depth > 0 && !dirs.length && isEpisodic(vids)) {
        // one folder of episodes: a series with one season, or with the seasons its file names say
        const ns = [...new Set(vids.map((v) => epSeason(v.name) ?? 1))].sort((a, b) => a - b);
        return addSeries(rel, name, ns.map((n) => ({ n, rel, name: seasonLabel(`Season ${n}`), only: ns.length > 1 ? n : null })));
      }
      if (depth > 0 && dirs.length && !vids.length && dirs.every((d) => EP_DIR_RE.test(nameOf(d)))) {
        return addSeries(rel, name, [{ n: 1, rel, name: 'Season 1' }]);
      }
    } else if (type === 'movies' && vids.length && !isEpisodic(vids)) {
      for (const v of vids) {
        // the file's own name, unless it says nothing ("movie.mkv") and the folder is named after the film
        const file = titleOf(v.name), folder = depth > 0 && name ? titleOf(name) : null;
        const useFolder = folder && vids.length === 1 && (!file.title || /^(movie|video|film|file|\d+)$/i.test(file.title));
        idx.movies.push({ rel: v.path, name: useFolder ? folder.title : file.title, year: file.year || folder?.year || null, entry: v });
      }
    }
    if (depth >= maxDepth) return;
    for (const d of dirs) {
      if (/^(extras?|featurettes|subs?|subtitles?|sample|screens?|trailers?)$/i.test(nameOf(d))) continue;
      queue.push({ rel: d.path, depth: depth + 1, name: nameOf(d) });
    }
  };
  const run = (async () => {
    const pool = Array.from({ length: workers }, async () => {
      while (queue.length) {
        if (idx.listed >= maxDirs) { idx.truncated = true; queue.length = 0; break; }
        const job = queue.shift();
        await walk(job);
        // yield so a waiting pool member can pick up the folders just queued
        if (!queue.length) await new Promise((r) => setTimeout(r, 5));
      }
    });
    await Promise.all(pool);
    idx.done = true;
  })();
  idx.finished = run;
  return idx;
}

/** A season's episodes: its video files, or one video from each episode folder. `only` limits a mixed folder to one season. */
export async function episodesOf(rel, children, only = null) {
  const items = await children(rel);
  let vids = items.filter((i) => i.kind === 'video');
  if (!vids.length) {
    const eps = items.filter((i) => i.isDir && EP_DIR_RE.test(nameOf(i)));
    const got = await Promise.all(eps.map((d) => children(d.path).then((l) => l.find((i) => i.kind === 'video'), () => null)));
    vids = got.filter(Boolean);
  }
  if (only != null) vids = vids.filter((v) => (epSeason(v.name) ?? 1) === only);
  return vids.map((v, i) => ({ rel: v.path, name: v.name, n: epNumber(v.name, i), entry: v })).sort((a, b) => a.n - b.n);
}
