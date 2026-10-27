// Posters and details for folders and files: an image sitting on the server wins, otherwise TMDB
// (when the user has added a free API key), otherwise nothing and the UI draws a placeholder.
import { parseName, extOf } from './listing.js';

const cache = new Map();
const tmdbCache = new Map();

function limiter(n) {
  let active = 0; const queue = [];
  const next = () => { if (active < n && queue.length) { active++; queue.shift()(); } };
  return (fn) => new Promise((resolve, reject) => {
    queue.push(() => fn().then(resolve, reject).finally(() => { active--; next(); }));
    next();
  });
}
const tmdbLimit = limiter(4);

const PREFERRED = /^(poster|folder|cover|front|movie|show)\b/i;

function pickImage(entries, stem) {
  const imgs = entries.filter((e) => e.kind === 'image');
  if (stem) {
    const s = stem.toLowerCase();
    const same = imgs.find((e) => e.name.toLowerCase().startsWith(s));
    if (same) return same;
  }
  return imgs.find((e) => PREFERRED.test(e.name)) || (stem ? null : imgs.find((e) => !/backdrop|fanart|banner|logo|thumb/i.test(e.name)));
}

async function tmdb(key, path, params) {
  const u = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  const headers = { accept: 'application/json' };
  if (key.length > 40) headers.authorization = `Bearer ${key}`; else u.searchParams.set('api_key', key);
  const r = await fetch(u, { headers, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`TMDB ${r.status}`);
  return r.json();
}

/** Best TMDB match for a parsed title; looks for a series first when the name says it's one. */
function lookup(key, p, preferTv) {
  const ck = `${p.title}|${p.year}|${preferTv}`.toLowerCase();
  if (!tmdbCache.has(ck)) {
    const job = tmdbLimit(async () => {
      const movie = async () => (await tmdb(key, '/search/movie', { query: p.title, year: p.year })).results?.[0];
      const tv = async () => (await tmdb(key, '/search/tv', { query: p.title, first_air_date_year: p.year })).results?.[0];
      const multi = async () => (await tmdb(key, '/search/multi', { query: p.title })).results?.find((x) => x.media_type !== 'person');
      let hit = preferTv ? (await tv()) || (await movie()) : (await movie()) || (await tv());
      if (!hit && p.year) hit = await multi();
      if (!hit) return null;
      return {
        tmdbId: hit.id, tmdbType: hit.media_type || (hit.title ? 'movie' : 'tv'),
        title: hit.title || hit.name, year: Number((hit.release_date || hit.first_air_date || '').slice(0, 4)) || p.year,
        overview: hit.overview || '', rating: hit.vote_average ? Math.round(hit.vote_average * 10) / 10 : null,
        poster: hit.poster_path ? `/tmdb/w342${hit.poster_path}` : null,
        backdrop: hit.backdrop_path ? `/tmdb/w1280${hit.backdrop_path}` : null,
      };
    });
    job.catch(() => tmdbCache.delete(ck));
    tmdbCache.set(ck, job);
  }
  return tmdbCache.get(ck).catch(() => null);
}

/**
 * @param rel     client path ("0/Movies/Dune (2021)/")
 * @param list    async (dirRel) => entries, cached by the caller
 * @param tmdbKey optional
 */
export async function metaFor(rel, list, tmdbKey) {
  const key = `${rel}|${tmdbKey ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const job = (async () => {
    const isDir = rel.endsWith('/');
    const segs = rel.replace(/\/$/, '').split('/');
    const parentRel = segs.slice(0, -1).join('/') + '/';
    const name = decodeURIComponent(segs[segs.length - 1]);
    const p = parseName(name);

    // Generic names ("Season 2", "Episode 05") take their title from the nearest real folder name.
    let titleSource = p;
    for (let i = segs.length - 2; titleSource.generic && i >= 1; i--) titleSource = parseName(decodeURIComponent(segs[i]));
    const looksTv = p.season != null || p.episode != null || titleSource !== p;

    let poster = null;
    try {
      if (isDir) {
        const img = pickImage(await list(rel));
        if (img) poster = `/img?path=${encodeURIComponent(img.path)}`;
      } else {
        const img = pickImage(await list(parentRel), name.slice(0, -(extOf(name).length + 1)));
        if (img) poster = `/img?path=${encodeURIComponent(img.path)}`;
      }
    } catch { /* listing failed: fall through to TMDB */ }

    const t = tmdbKey && !titleSource.generic ? await lookup(tmdbKey, titleSource, looksTv) : null;
    return {
      title: p.generic ? name.replace(/\.[^.]+$/, '') : p.title,
      show: titleSource !== p ? t?.title || titleSource.title : null,
      year: p.year || (titleSource === p ? t?.year : null) || null,
      season: p.season, episode: p.episode,
      overview: t?.overview || '', rating: t?.rating ?? null,
      poster: poster || t?.poster || null, backdrop: t?.backdrop || null,
      matched: t ? t.title : null,
      tmdbId: t?.tmdbId ?? null, tmdbType: t?.tmdbType ?? null,
    };
  })();
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
}
