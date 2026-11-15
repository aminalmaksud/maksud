// TV episodes grouped by what the files say, the way Plex and Jellyfin do it, whatever the folders look like:
// a typo in a Season folder, episodes beside the season folders, or a whole show (or several) in one flat folder.
import crypto from 'node:crypto';
import { parseName } from './listing.js';

const strip = (n) => String(n).replace(/\/$/, '');

/** Edit distance, for tolerating typos in folder words ("Seaon 1"). */
function lev(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
const SEASON_WORDS = ['season', 'series', 'saison', 'staffel', 'temporada', 'stagione', 'seizoen', 'sezon', 'sesong', 'seasons'];

/** The season a folder name stands for ("Season 2", "S02", "Seaon 2", "Specials" = 0), or null. */
export function seasonOfFolder(name) {
  const t = strip(name).trim();
  if (/^specials?\b/i.test(t)) return 0;
  let m = /^s0*(\d{1,2})(?![\d]|\s*e\d)\b/i.exec(t);
  if (m) return Number(m[1]);
  m = /^(\p{L}{3,10})[\s._-]*0*(\d{1,2})(?!\d)(?![-–]\d)/u.exec(t);
  if (m && SEASON_WORDS.some((w) => lev(m[1].toLowerCase(), w) <= (w.length > 5 ? 2 : 1))) return Number(m[2]);
  return null;
}

const EXTRAS = /^(extras?|featurettes?|behind the scenes|sample|samples|trailers?|subs?|subtitles?|screens?|screenshots?|artwork|scenes|interviews?|deleted scenes|bonus)$/i;
export const isExtrasFolder = (name) => EXTRAS.test(strip(name).trim());

/** Season and episode from a file name, or nulls. `at` is where the marker starts, so the title is what's before it. */
function marker(s) {
  let m = /\bS(\d{1,2})[ ._-]?E(\d{1,3})(?:[ ._-]?(?:E|-E?)\d{1,3})*\b/i.exec(s);
  if (m) return { season: Number(m[1]), episode: Number(m[2]), at: m.index };
  m = /\b(\d{1,2})x(\d{2,3})\b/i.exec(s);
  if (m) return { season: Number(m[1]), episode: Number(m[2]), at: m.index };
  m = /\bseason[ ._-]*(\d{1,2})[ ._,-]*(?:episode|ep|e)[ ._-]*(\d{1,3})\b/i.exec(s);
  if (m) return { season: Number(m[1]), episode: Number(m[2]), at: m.index };
  m = /\b(?:episode|ep|e)[ ._-]?(\d{1,3})\b/i.exec(s);
  if (m) return { season: null, episode: Number(m[1]), at: m.index };
  m = /\s-\s(\d{1,4})(?:v\d)?(?:\s|$)/.exec(s); // "[Group] Show - 12 (1080p)"
  if (m) return { season: null, episode: Number(m[1]), at: m.index };
  m = /^(\d{1,3})\s*[-._)]\s*\S/.exec(s) || /^(\d{1,3})$/.exec(s); // "01 - Pilot", "05"
  if (m) return { season: null, episode: Number(m[1]), at: 0 };
  return { season: null, episode: null, at: -1 };
}

/** The letters and digits of a title, without a year, "(TV Series)" or a leading "the": what two spellings of one show share. */
export const titleKey = (t) => String(t).toLowerCase().replace(/\(?\s*(?:tv|web|mini)[\s-]*(?:series|show)\s*\)?/g, ' ').replace(/[([]\s*(?:19|20)\d{2}[^)\]]*[)\]]/g, ' ')
  .replace(/^the\s+/, '').replace(/[^\p{L}\p{N}]+/gu, '');

const genericTitle = (t) => !t || /^(?:episode|ep|e|part|season|s|series|disc|disk|cd|vol|volume)\s*\d*$/i.test(t.trim()) || /^\d{1,4}$/.test(t.trim());

/**
 * One video file: which show, season and episode it is.
 * @param name       the file name
 * @param ancestors  folder names from the library's top down to the file's folder (the library's own name left out)
 */
export function parseEpisodeFile(name, ancestors = []) {
  const stem = strip(name).replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  const mk = marker(stem);
  let season = mk.season, episode = mk.episode;
  // the season folder nearest to the file, when the name has no season
  let fromFolder = null;
  for (let i = ancestors.length - 1; i >= 0 && fromFolder == null; i--) fromFolder = seasonOfFolder(ancestors[i]);
  if (season == null && fromFolder != null) season = fromFolder;
  if (season == null && episode != null) season = 1;
  // the show's name: before the marker in the file name, else from the nearest folder that isn't a season or extras folder
  let title = '', year = null;
  const head = mk.at > 0 ? stem.slice(0, mk.at) : mk.at === 0 ? '' : stem;
  // a file with no marker inside a season folder is just named after its episode: the show comes from the folders
  if (head && !(mk.at < 0 && fromFolder != null)) { const p = parseName(head); if (!genericTitle(p.title)) { title = p.title; year = p.year; } }
  if (!title) {
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const a = ancestors[i];
      if (seasonOfFolder(a) != null || isExtrasFolder(a)) continue;
      const p = parseName(a);
      if (!genericTitle(p.title)) { title = p.title; year = p.year; break; }
    }
  }
  if (!title) title = parseName(stem).title || stem;
  return { title, year, season, episode, key: titleKey(title), hasMarker: mk.episode != null || mk.season != null };
}

/**
 * Walks a library in the background and collects its video files with the folders above them. The result fills in
 * as it goes (`done` flips at the end). A cap on folders and depth keeps a huge server from keeping it busy for ever.
 * `children(rel)` lists a folder: [{ name, path, isDir, kind }].
 */
export function crawlFiles(rootRel, children, { maxDirs = 6000, maxDepth = 8, workers = 4 } = {}) {
  const out = { files: [], done: false, listed: 0, truncated: false, at: Date.now() };
  const queue = [{ rel: rootRel, depth: 0, chain: [] }];
  const walk = async ({ rel, depth, chain }) => {
    let items;
    try { items = await children(rel); } catch { return; }
    out.listed++;
    for (const it of items) {
      if (it.isDir) {
        if (depth < maxDepth && !isExtrasFolder(it.name)) queue.push({ rel: it.path, depth: depth + 1, chain: [...chain, strip(it.name)] });
      } else if (it.kind === 'video') out.files.push({ entry: it, name: it.name, path: it.path, ancestors: chain });
    }
  };
  out.finished = (async () => {
    await Promise.all(Array.from({ length: workers }, async () => {
      while (queue.length) {
        if (out.listed >= maxDirs) { out.truncated = true; queue.length = 0; break; }
        await walk(queue.shift());
        if (!queue.length) await new Promise((r) => setTimeout(r, 5)); // let a waiting worker pick up what was just queued
      }
    }));
    out.done = true;
  })();
  return out;
}

const mostCommon = (arr) => { const c = new Map(); for (const v of arr) c.set(v, (c.get(v) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0]; };
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/** Groups crawled files into series: [{ id, title, year, seasons: [{ n, episodes: [{ entry, name, path, episode }] }] }]. */
export function buildSeries(files, libKey = '') {
  const groups = new Map();
  for (const f of files) {
    const p = parseEpisodeFile(f.name, f.ancestors);
    if (!p.key) continue;
    let g = groups.get(p.key);
    if (!g) groups.set(p.key, g = { key: p.key, titles: [], years: [], eps: [] });
    g.titles.push(p.title); if (p.year) g.years.push(p.year);
    g.eps.push({ ...p, entry: f.entry, name: f.name, path: f.path });
  }
  const series = [];
  for (const g of groups.values()) {
    const seasons = new Map();
    // files with no episode number follow the numbered ones, in name order
    const loose = g.eps.filter((e) => e.episode == null).sort(byName);
    for (const e of g.eps) {
      const n = e.season ?? 1;
      if (!seasons.has(n)) seasons.set(n, []);
      seasons.get(n).push(e);
    }
    for (const [n, list] of seasons) {
      let next = Math.max(0, ...list.map((e) => e.episode ?? 0)) + 1;
      for (const e of list.filter((x) => loose.includes(x)).sort(byName)) e.episode = next++;
      list.sort((a, b) => a.episode - b.episode || byName(a, b));
    }
    series.push({
      id: crypto.createHash('sha1').update(`${libKey}|${g.key}`).digest('hex').slice(0, 10), key: g.key,
      title: mostCommon(g.titles), year: mostCommon(g.years) || null,
      seasons: [...seasons].sort((a, b) => (a[0] === 0) - (b[0] === 0) || a[0] - b[0]).map(([n, episodes]) => ({ n, episodes })),
    });
  }
  return series.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
}

export const seasonName = (n) => (n === 0 ? 'Specials' : `Season ${n}`);
