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
  const u = new URL(`${process.env.TMDB_API || 'https://api.themoviedb.org/3'}${path}`);
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
      return shapeHit(hit, hit.media_type || (hit.title ? 'movie' : 'tv'), p.year);
    });
    job.catch(() => tmdbCache.delete(ck));
    tmdbCache.set(ck, job);
  }
  return tmdbCache.get(ck).catch(() => null);
}

const shapeHit = (hit, type, fallbackYear) => ({
  tmdbId: hit.id, tmdbType: type,
  title: hit.title || hit.name, year: Number((hit.release_date || hit.first_air_date || '').slice(0, 4)) || fallbackYear || null,
  overview: hit.overview || '', rating: hit.vote_average ? Math.round(hit.vote_average * 10) / 10 : null,
  poster: hit.poster_path ? `/tmdb/w342${hit.poster_path}` : null,
  backdrop: hit.backdrop_path ? `/tmdb/w1280${hit.backdrop_path}` : null,
});

const idCache = new Map(), castCache = new Map();
/** A title picked by its TMDB id ("movie" or "tv"): the same details a search would give. Null when TMDB doesn't know it. */
export function tmdbById(key, type, id) {
  const ck = `${type}|${id}`;
  if (!idCache.has(ck)) {
    const job = tmdbLimit(() => tmdb(key, `/${type}/${id}`, { append_to_response: 'credits,external_ids' })).then(
      (j) => { castCache.set(ck, castShape(j)); return shapeHit(j, type); },
      () => null,
    );
    job.then((v) => { if (!v) idCache.delete(ck); });
    idCache.set(ck, job);
  }
  return idCache.get(ck);
}

/** An IMDb id (tt0133093) to a TMDB movie or series, through TMDB's find. */
export async function findByImdb(key, imdb) {
  const r = await tmdbLimit(() => tmdb(key, `/find/${encodeURIComponent(imdb)}`, { external_source: 'imdb_id' })).catch(() => null);
  const m = r?.movie_results?.[0], t = r?.tv_results?.[0];
  return m ? { type: 'movie', id: m.id } : t ? { type: 'tv', id: t.id } : null;
}

/** Search for the "pick the right title" dialog. */
export async function searchTmdb(key, q, type) {
  const r = await tmdbLimit(() => tmdb(key, type === 'movie' || type === 'tv' ? `/search/${type}` : '/search/multi', { query: q }));
  return (r.results || []).filter((x) => x.media_type !== 'person').slice(0, 12).map((x) => {
    const ty = x.media_type || type || (x.title ? 'movie' : 'tv');
    return { id: x.id, type: ty, title: x.title || x.name, year: Number((x.release_date || x.first_air_date || '').slice(0, 4)) || null,
      poster: x.poster_path ? `/tmdb/w185${x.poster_path}` : null, overview: (x.overview || '').slice(0, 220) };
  });
}

const castShape = (j) => ({
  imdbId: j.external_ids?.imdb_id || j.imdb_id || null,
  tagline: j.tagline || '',
  genres: (j.genres || []).map((g) => g.name),
  cast: (j.credits?.cast || []).slice(0, 14).map((c) => ({ name: c.name, role: c.character || '', photo: c.profile_path ? `/tmdb/w185${c.profile_path}` : null })),
  director: (j.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name).slice(0, 3),
});
/** Cast, director, genres and the IMDb id of a TMDB title. */
export async function castOf(key, type, id) {
  const ck = `${type}|${id}`;
  if (!castCache.has(ck)) await tmdbById(key, type, id);
  return castCache.get(ck) || { imdbId: null, tagline: '', genres: [], cast: [], director: [] };
}

export function forgetMeta() { cache.clear(); tmdbCache.clear(); seasonCache.clear(); }

/**
 * @param rel     client path ("0/Movies/Dune (2021)/")
 * @param list    async (dirRel) => entries, cached by the caller
 * @param tmdbKey optional
 * @param pinned  optional (rel) => { type, id } | null: a title the user picked by its TMDB id, which wins over searching by name
 */
export async function metaFor(rel, list, tmdbKey, pinned) {
  const pin = tmdbKey && pinned ? pinned(rel) : null;
  const key = `${rel}|${tmdbKey ? 1 : 0}|${pin ? pin.type + pin.id : ''}`;
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

    const t = !tmdbKey ? null : pin ? await tmdbById(tmdbKey, pin.type, pin.id) : !titleSource.generic ? await lookup(tmdbKey, titleSource, looksTv) : null;
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

const seasonCache = new Map();
/** One TMDB season: its poster, and its episodes (number, title, plot, runtime, air date, still). Null when TMDB doesn't know it. */
export function seasonEpisodes(key, tvId, season) {
  const ck = `${tvId}|${season}`;
  if (!seasonCache.has(ck)) {
    seasonCache.set(ck, tmdbLimit(() => tmdb(key, `/tv/${tvId}/season/${season}`, {})).then(
      (j) => ({
        poster: j.poster_path ? `/tmdb/w342${j.poster_path}` : null,
        episodes: (j.episodes || []).map((e) => ({
          episode: e.episode_number, name: e.name || '', overview: e.overview || '', runtime: e.runtime || null, air: e.air_date || null,
          still: e.still_path ? `/tmdb/w300${e.still_path}` : null,
        })),
      }),
      () => { seasonCache.delete(ck); return null; },
    ));
  }
  return seasonCache.get(ck);
}
