// A Jellyfin-compatible API, so Jellyfin apps (the official ones, Streamyfin, Findroid, Swiftfin...) can browse and
// play your libraries from this computer. Version 1 shows each section as a "Home videos" library you browse folder by
// folder; every file plays directly (no transcoding). Typed Movie/Series/Episode items come later.
//
// server.js owns the libraries, so it hands this module what it needs (see `ctx` below) and runs the listener.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseName, extOf, srtToVtt } from './listing.js';
import { collectionTypeOf, crawl, episodesOf, seasonDirs, seasonLabel, seasonNum, titleOf } from './jellyfin-index.js';

const SERVER_VERSION = '10.10.7'; // what we claim to be: newer clients refuse servers they think are too old
const USER_NAME = 'streamhub';
const TICKS = 1e7; // Jellyfin counts time in 100 ns ticks
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const guid = () => crypto.randomBytes(16).toString('hex');
const sameSecret = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * @param ctx.stateFile  where tokens, resume positions and item ids are kept
 * @param ctx.password   () => the optional password ('' means anyone on the home network may sign in)
 * @param ctx.views      async () => [{ name, rel }]  the libraries (sections)
 * @param ctx.children   async (rel) => items        the folder's entries, as /api/browse lists them
 * @param ctx.media      (rel) => { src, auth, local }
 * @param ctx.probe      async (rel) => { duration, video, audio, subs } | null
 * @param ctx.metaFor    async (rel) => { poster, backdrop } | null
 * @param ctx.stream     (req, res, rel) => void     sends the file with byte ranges
 * @param ctx.image      (req, res, url) => void     sends a poster or backdrop from metaFor
 * @param ctx.tmdbSeason async (rel, n) => { poster, episodes } | null   a season's plots and stills (TMDB)
 * @param ctx.hasTmdb    () => whether a TMDB key is set
 * @param ctx.subtitle   async (rel) => { text, ext }  a subtitle file's text
 */
export function createJellyfin(ctx) {
  let state = { serverId: guid(), userId: guid(), tokens: {}, paths: {}, data: {} };
  try { state = { ...state, ...JSON.parse(fs.readFileSync(ctx.stateFile, 'utf8')) }; } catch { /* first run */ }
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { fs.mkdirSync(path.dirname(ctx.stateFile), { recursive: true }); fs.writeFileSync(ctx.stateFile, JSON.stringify(state), { mode: 0o600 }); } catch { /* read-only: ids last until restart */ }
    }, 800);
    saveTimer.unref?.();
  };

  const live = new Map(); // id -> the listing entry (folders have `path`, videos may have `versions`)
  const idOf = (rel, entry) => {
    const id = md5(rel);
    if (entry) live.set(id, entry);
    if (!state.paths[id]) { state.paths[id] = rel; save(); }
    return id;
  };
  const relOf = (id) => state.paths[String(id).toLowerCase()] || null;

  // ---- item shapes ----
  const cleanName = (n) => n.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  const userData = (id) => {
    const d = state.data[id] || {};
    return { PlaybackPositionTicks: Math.round((d.pos || 0) * TICKS), PlayCount: d.played ? 1 : 0, IsFavorite: !!d.fav, Played: !!d.played, Key: id, ItemId: id };
  };
  const base = (id) => ({ ServerId: state.serverId, Id: id, CanDelete: false, CanDownload: true, LocationType: 'FileSystem', UserData: userData(id) });
  const viewDto = (v) => {
    const id = idOf(v.rel);
    return { ...base(id), Name: v.name, SortName: v.name.toLowerCase(), Type: 'CollectionFolder', CollectionType: typeOfView(v), IsFolder: true, ImageTags: {}, BackdropImageTags: [], ParentId: '' };
  };
  function itemDto(it, parentId) {
    const id = idOf(it.path, it);
    if (it.isDir) {
      const p = parseName(it.name);
      const name = p.title && p.title !== it.name ? `${p.title}${p.year ? ` (${p.year})` : ''}` : cleanName(it.name);
      return { ...base(id), Name: name, SortName: name.toLowerCase(), Type: 'Folder', IsFolder: true, ParentId: parentId, ImageTags: { Primary: id }, BackdropImageTags: [] };
    }
    const name = cleanName(it.name), saved = state.data[id];
    return {
      ...base(id), Name: name, SortName: name.toLowerCase(), Type: 'Video', MediaType: 'Video', IsFolder: false, ParentId: parentId,
      Container: extOf(it.name), ImageTags: { Primary: id }, BackdropImageTags: [], ...(saved?.dur ? { RunTimeTicks: Math.round(saved.dur * TICKS) } : {}),
      ...(Number.isFinite(it.size) ? { Size: it.size } : {}),
    };
  }
  const page = (items, q) => {
    const start = Math.max(0, Number(q.get('startindex')) || 0), limit = Number(q.get('limit')) || 0;
    return { Items: limit ? items.slice(start, start + limit) : items.slice(start), TotalRecordCount: items.length, StartIndex: start };
  };
  const q0 = (q, k) => q.get(k) ?? '';


  // ---- typed items: sections that hold movies or series are indexed, so apps get Movie / Series / Season / Episode ----
  const indexes = new Map(); // section rel -> what the crawl has found so far
  const JF_TYPES = { movies: 'movies', shows: 'tvshows', music: 'music', books: 'books' };
  const typeOfView = (v) => JF_TYPES[v.type] || collectionTypeOf(v.name);
  async function indexFor(view, waitMs = 4000) {
    let idx = indexes.get(view.rel);
    if (!idx || Date.now() - idx.at > 30 * 60e3) { idx = crawl(view.rel, typeOfView(view), (rel) => ctx.children(rel)); indexes.set(view.rel, idx); }
    if (!idx.done) await Promise.race([idx.finished, new Promise((r) => setTimeout(r, waitMs))]);
    return idx;
  }
  const backdrops = (id) => (ctx.hasTmdb() ? [id] : []);
  const withId = (key, rec) => { rec.id = idOf(key, rec); return rec; };
  const movieRec = (m) => withId(m.rel, { t: 'movie', path: m.rel, name: m.entry.name, versions: m.entry.versions, size: m.entry.size, title: m.name, year: m.year });
  const seriesRec = (s) => withId(`series:${s.rel}`, { t: 'series', path: s.rel, name: s.name, isDir: true, title: s.name, year: s.year, seasons: s.seasons });
  const seasonRec = (series, se) => withId(`season:${series.path}|${se.rel}|${se.n}|${se.only ?? ''}`, {
    t: 'season', path: se.rel, name: se.name, isDir: true, title: se.name, n: se.n, only: se.only ?? null, seriesRel: series.path, seriesId: series.id || md5(`series:${series.path}`), seriesName: series.title,
  });
  /** A series' seasons (listed again after a restart, when only its id is known). */
  async function seasonsOfSeries(series) {
    if (!series.seasons) {
      const items = await ctx.children(series.path);
      const sd = seasonDirs(items);
      series.seasons = sd ? sd.map((d) => ({ n: seasonNum(d.name.replace(/\/$/, '')), rel: d.path, name: seasonLabel(d.name.replace(/\/$/, '')) })) : [{ n: 1, rel: series.path, name: 'Season 1' }];
    }
    return series.seasons.map((se) => seasonRec(series, se));
  }
  /** A season's episodes, with titles, plots and stills from TMDB when it knows them. */
  async function episodesForSeason(season) {
    if (season.eps) return season.eps;
    const [eps, t] = await Promise.all([episodesOf(season.path, (rel) => ctx.children(rel), season.only), ctx.tmdbSeason(season.path, season.n ?? 1).catch(() => null)]);
    season.eps = eps.map((e) => {
      const te = t?.episodes.find((x) => x.episode === e.n);
      return withId(e.rel, {
        t: 'episode', path: e.rel, name: e.name, versions: e.entry.versions, size: e.entry.size, title: te?.name || `Episode ${e.n}`, n: e.n, sn: season.n ?? 1,
        overview: te?.overview || '', runtime: te?.runtime || null, air: te?.air || null, still: te?.still || null,
        seriesId: season.seriesId, seriesRel: season.seriesRel, seriesName: season.seriesName, seasonId: season.id, seasonName: season.title,
      });
    });
    return season.eps;
  }
  const movieDto = (r, parentId) => {
    const id = r.id, saved = state.data[id];
    return { ...base(id), Name: r.title, SortName: r.title.toLowerCase(), Type: 'Movie', MediaType: 'Video', IsFolder: false, ParentId: parentId || '', Container: extOf(r.name), ...(r.year ? { ProductionYear: r.year } : {}),
      ImageTags: { Primary: id }, BackdropImageTags: backdrops(id), ...(saved?.dur ? { RunTimeTicks: Math.round(saved.dur * TICKS) } : {}) };
  };
  const seriesDto = (r, parentId) => ({ ...base(r.id), Name: r.title, SortName: r.title.toLowerCase(), Type: 'Series', IsFolder: true, ParentId: parentId || '', ...(r.year ? { ProductionYear: r.year } : {}),
    ChildCount: r.seasons?.length, Status: 'Continuing', ImageTags: { Primary: r.id }, BackdropImageTags: backdrops(r.id) });
  const seasonDto = (r) => ({ ...base(r.id), Name: r.title, SortName: String(r.n ?? 0).padStart(3, '0'), Type: 'Season', IsFolder: true, IndexNumber: r.n ?? 1, SeriesId: r.seriesId, SeriesName: r.seriesName, ParentId: r.seriesId, ImageTags: { Primary: r.id }, BackdropImageTags: [] });
  const episodeDto = (r) => ({ ...base(r.id), Name: r.title, SortName: String(r.n).padStart(4, '0'), Type: 'Episode', MediaType: 'Video', IsFolder: false, IndexNumber: r.n, ParentIndexNumber: r.sn,
    SeriesId: r.seriesId, SeriesName: r.seriesName, SeasonId: r.seasonId, SeasonName: r.seasonName, ParentId: r.seasonId, Container: extOf(r.name), ...(r.overview ? { Overview: r.overview } : {}),
    ...(r.runtime ? { RunTimeTicks: Math.round(r.runtime * 60 * TICKS) } : state.data[r.id]?.dur ? { RunTimeTicks: Math.round(state.data[r.id].dur * TICKS) } : {}), ...(r.air ? { PremiereDate: `${r.air}T00:00:00.0000000Z`, ProductionYear: Number(r.air.slice(0, 4)) } : {}),
    ImageTags: { Primary: r.id }, BackdropImageTags: [] });
  const recDto = (r, parentId) => (r.t === 'movie' ? movieDto(r, parentId) : r.t === 'series' ? seriesDto(r, parentId) : r.t === 'season' ? seasonDto(r) : episodeDto(r));

  async function entryFor(id) {
    if (live.has(id)) return live.get(id);
    const rel = relOf(id);
    if (!rel) return null;
    // typed items after a restart: rebuilt from what their id stands for
    if (rel.startsWith('series:')) { const path = rel.slice(7); return withId(rel, { t: 'series', path, isDir: true, title: titleOf(decodeURIComponent(path.replace(/\/$/, '').split('/').pop() || '')).title, name: '' }); }
    if (rel.startsWith('season:')) {
      const [seriesRel, path, n, only] = rel.slice(7).split('|');
      const series = { path: seriesRel, title: titleOf(decodeURIComponent(seriesRel.replace(/\/$/, '').split('/').pop() || '')).title };
      return withId(rel, { t: 'season', path, isDir: true, name: '', title: seasonLabel(`Season ${n}`), n: Number(n), only: only === '' ? null : Number(only), seriesRel, seriesId: md5(`series:${seriesRel}`), seriesName: series.title });
    }
    const views = await ctx.views();
    const v = views.find((x) => x.rel === rel);
    if (v) return { viewRel: v.rel, view: v };
    const name = decodeURIComponent(rel.replace(/\/$/, '').split('/').pop() || '');
    return { path: rel, name: name || rel, isDir: rel.endsWith('/') || rel.startsWith('v:'), kind: rel.endsWith('/') || rel.startsWith('v:') ? 'dir' : 'video' };
  }
  /** What a movie or series adds to its card on its own page: plot, rating and year from TMDB. */
  async function enrich(dto, rel) {
    const m = await ctx.metaFor(rel).catch(() => null);
    if (m?.overview) dto.Overview = m.overview;
    if (m?.rating) dto.CommunityRating = m.rating;
    if (m?.year && !dto.ProductionYear) dto.ProductionYear = m.year;
    return dto;
  }
  const dtoFor = async (id, { full = false } = {}) => {
    const e = await entryFor(id);
    if (!e) return null;
    if (e.view) return viewDto({ ...e.view });
    if (e.t) { const dto = recDto(e, ''); return full && (e.t === 'movie' || e.t === 'series') ? enrich(dto, e.path) : dto; }
    return itemDto(e, '');
  };
  async function childrenDto(parentId, q) {
    const e = await entryFor(parentId);
    if (!e) return { Items: [], TotalRecordCount: 0, StartIndex: 0 };
    const rel = e.view ? e.view.rel : e.path;
    let items = (await ctx.children(rel)).filter((i) => i.isDir || i.kind === 'video');
    const types = q0(q, 'includeitemtypes').split(',').filter(Boolean);
    if (types.length && !types.some((t) => /^(Folder|Video|Movie|Episode|Series|Season|CollectionFolder)$/i.test(t))) items = [];
    if (/folder/i.test(q0(q, 'excludeitemtypes'))) items = items.filter((i) => !i.isDir);
    const term = q0(q, 'searchterm').toLowerCase();
    if (term) items = items.filter((i) => i.name.toLowerCase().includes(term));
    const dirs = items.filter((i) => i.isDir).sort((a, b) => natural.compare(a.name, b.name));
    const vids = items.filter((i) => !i.isDir).sort((a, b) => natural.compare(a.name, b.name));
    const desc = /desc/i.test(q0(q, 'sortorder'));
    const sorted = [...dirs, ...vids];
    return page((desc ? sorted.reverse() : sorted).map((i) => itemDto(i, parentId)), q);
  }
  const asId = (v) => String(v || '').replace(/-/g, '').toLowerCase();
  const numSort = (key) => (a, b) => (a[key] ?? 0) - (b[key] ?? 0);
  /** /Items for typed sections, series, seasons, and across sections (search). Folder sections fall through to childrenDto. */
  async function queryItems(q) {
    const types = new Set(q0(q, 'includeitemtypes').split(',').filter(Boolean).map((t) => t.toLowerCase()));
    const parent = asId(q0(q, 'parentid')), term = q0(q, 'searchterm').toLowerCase();
    let list;
    if (parent) {
      const e = await entryFor(parent);
      if (!e) return { Items: [], TotalRecordCount: 0, StartIndex: 0 };
      if (e.view) {
        const t = typeOfView(e.view);
        if (t === 'homevideos') return childrenDto(parent, q);
        const idx = await indexFor(e.view);
        list = t === 'movies' ? idx.movies.map((m) => movieDto(movieRec(m), parent)) : idx.series.map((x) => seriesDto(seriesRec(x), parent));
      } else if (e.t === 'series') {
        const seasons = await seasonsOfSeries(e);
        list = types.has('episode') ? (await Promise.all(seasons.map(episodesForSeason))).flat().map(episodeDto) : seasons.map(seasonDto);
      } else if (e.t === 'season') list = (await episodesForSeason(e)).map(episodeDto);
      else return childrenDto(parent, q);
    } else if (types.size || term) {
      list = [];
      for (const v of await ctx.views()) {
        const t = typeOfView(v);
        if (t === 'homevideos') continue;
        const idx = await indexFor(v, 1500);
        if (t === 'movies') list.push(...idx.movies.map((m) => movieDto(movieRec(m), idOf(v.rel))));
        else list.push(...idx.series.map((x) => seriesDto(seriesRec(x), idOf(v.rel))));
      }
    } else list = (await ctx.views()).map(viewDto);

    if (types.size) list = list.filter((d) => types.has(d.Type.toLowerCase()));
    if (term) list = list.filter((d) => d.Name.toLowerCase().includes(term));
    const filters = q0(q, 'filters').toLowerCase();
    if (/isunplayed/.test(filters)) list = list.filter((d) => !d.UserData.Played);
    if (/isplayed/.test(filters.replace('isunplayed', ''))) list = list.filter((d) => d.UserData.Played);
    if (/isfavorite/.test(filters)) list = list.filter((d) => d.UserData.IsFavorite);
    if (/isresumable/.test(filters)) list = list.filter((d) => d.UserData.PlaybackPositionTicks > 0);
    const by = q0(q, 'sortby').split(',')[0].toLowerCase();
    if (by === 'productionyear' || by === 'premieredate') list.sort(numSort('ProductionYear'));
    else if (by === 'indexnumber' || by === 'parentindexnumber,indexnumber') list.sort(numSort('IndexNumber'));
    else if (by !== 'random') list.sort((a, b) => natural.compare(a.SortName ?? a.Name, b.SortName ?? b.Name));
    if (/desc/i.test(q0(q, 'sortorder'))) list.reverse();
    return page(list, q);
  }
  /** /Shows/{id}/Seasons and /Shows/{id}/Episodes */
  async function showItems(id, what, q) {
    const series = await entryFor(id);
    if (!series || series.t !== 'series') return { Items: [], TotalRecordCount: 0, StartIndex: 0 };
    const seasons = await seasonsOfSeries(series);
    if (what === 'seasons') return page(seasons.map(seasonDto), q);
    const sid = asId(q0(q, 'seasonid')), sn = q0(q, 'season');
    const pick = seasons.filter((x) => (sid ? x.id === sid : sn !== '' ? String(x.n) === sn : true));
    return page((await Promise.all(pick.map(episodesForSeason))).flat().map(episodeDto), q);
  }
  /** The episode to watch next in each series you've been watching: the first one after the last you finished. */
  async function nextUp(q) {
    const last = new Map(); // series rel -> { at, sn, en }
    for (const d of Object.values(state.data)) {
      if (!d.series || !d.played) continue;
      const prev = last.get(d.series);
      if (!prev || d.at > prev.at) last.set(d.series, { at: d.at, sn: d.sn, en: d.en });
    }
    const out = [];
    for (const [rel, at] of [...last].sort((a, b) => b[1].at - a[1].at)) {
      const series = await entryFor(md5(`series:${rel}`)).catch(() => null);
      if (!series) continue;
      for (const season of await seasonsOfSeries(series)) {
        if ((season.n ?? 1) < at.sn) continue;
        const next = (await episodesForSeason(season)).find((e) => (e.sn > at.sn || e.n > at.en) && !state.data[e.id]?.played);
        if (next) { out.push(episodeDto(next)); break; }
      }
    }
    return page(out, q);
  }
  async function resumeDto(q) {
    const rows = Object.entries(state.data).filter(([, d]) => d.pos > 0 && !d.played && d.rel).sort((a, b) => b[1].at - a[1].at);
    const items = [];
    for (const [id] of rows) { const dto = await dtoFor(id); if (dto) items.push(dto); }
    return page(items, q);
  }

  // ---- playback ----
  function mediaSource(id, rel, info, entry, name, extra = {}) {
    const streams = [];
    if (info?.video) streams.push({ Index: info.video.gi ?? 0, Type: 'Video', Codec: info.video.codec, Width: info.video.width, Height: info.video.height, IsDefault: true, IsExternal: false, DisplayTitle: `${info.video.height || ''}p ${String(info.video.codec || '').toUpperCase()}`.trim() });
    const off = streams.length;
    (info?.audio || []).forEach((a, i) => streams.push({ Index: a.gi ?? off + i, Type: 'Audio', Codec: a.codec, Channels: a.channels, Language: a.lang || undefined, Title: a.label, DisplayTitle: a.label, IsDefault: !!a.default || i === 0, IsExternal: false }));
    const off2 = streams.length;
    (info?.subs || []).forEach((s, i) => streams.push({ Index: s.gi ?? off2 + i, Type: 'Subtitle', Codec: s.codec, Language: s.lang || undefined, Title: s.label, DisplayTitle: s.label, IsTextSubtitleStream: !!s.text, IsForced: !!s.forced, IsDefault: false, IsExternal: false, SupportsExternalStream: false, DeliveryMethod: 'Embed' }));
    // subtitle files beside the video (movie.srt, movie.en.srt): offered as external tracks the player downloads
    let next = Math.max(-1, ...streams.map((x) => x.Index)) + 1;
    for (const f of extra.subFiles || []) {
      const index = next++, ext = extOf(f.name) === 'vtt' ? 'vtt' : 'srt';
      subFiles.set(`${id}:${index}`, f.path);
      streams.push({ Index: index, Type: 'Subtitle', Codec: ext === 'vtt' ? 'webvtt' : 'subrip', Language: f.lang, Title: f.label, DisplayTitle: f.label, IsTextSubtitleStream: true, IsExternal: true, IsForced: false, IsDefault: false,
        SupportsExternalStream: true, DeliveryMethod: 'External', DeliveryUrl: `/Videos/${extra.itemId}/${id}/Subtitles/${index}/0/Stream.${ext}${extra.token ? `?api_key=${extra.token}` : ''}`, Path: f.path });
    }
    const audioDefault = streams.find((s) => s.Type === 'Audio' && s.IsDefault)?.Index;
    return {
      Id: id, Name: name, Path: rel, Protocol: 'File', Type: 'Default', Container: extOf(rel.replace(/\/$/, '')), IsRemote: false,
      ...(Number.isFinite(entry?.size) ? { Size: entry.size } : {}), ...(info?.duration ? { RunTimeTicks: Math.round(info.duration * TICKS) } : {}),
      SupportsDirectPlay: true, SupportsDirectStream: true, SupportsTranscoding: false,
      DirectStreamUrl: `/Videos/${extra.itemId}/stream?static=true&mediaSourceId=${id}${extra.token ? `&api_key=${extra.token}` : ''}`, ReadAtNativeFramerate: false, IgnoreDts: false, IgnoreIndex: false,
      GenPtsInput: false, SupportsProbing: false, VideoType: 'VideoFile', MediaStreams: streams, MediaAttachments: [], Formats: [], RequiredHttpHeaders: {},
      ...(audioDefault !== undefined ? { DefaultAudioStreamIndex: audioDefault } : {}), HasSegments: false,
    };
  }
  const subFiles = new Map(); // `${mediaSourceId}:${stream index}` -> the subtitle file's path
  const LANGS = { en: 'eng', eng: 'eng', english: 'eng', bn: 'ben', ben: 'ben', bengali: 'ben', bangla: 'ben', hi: 'hin', hin: 'hin', hindi: 'hin', ar: 'ara', arabic: 'ara' };
  /** .srt/.vtt files in the video's folder whose name starts with the video's name. */
  async function subtitleFilesFor(v) {
    const dir = v.path.replace(/[^/]+$/, '');
    let items;
    try { items = await ctx.children(dir); } catch { return []; }
    const stem = (n) => n.replace(/\.[^.]+$/, '').toLowerCase();
    const mine = stem(v.name);
    return items.filter((i) => i.kind === 'sub' && stem(i.name).startsWith(mine)).slice(0, 8).map((i) => {
      const tag = /[._ -]([a-z]{2,3}|english|bengali|bangla|hindi|arabic)$/i.exec(stem(i.name).slice(mine.length) || '')?.[1]?.toLowerCase();
      return { path: i.path, name: i.name, lang: tag ? LANGS[tag] : undefined, label: tag ? `${tag.length <= 3 ? tag.toUpperCase() : tag[0].toUpperCase() + tag.slice(1)} (file)` : 'Subtitles (file)' };
    });
  }
  async function playbackInfo(id, token) {
    const e = await entryFor(id);
    if (!e || e.isDir || e.view) return null;
    const versions = e.versions?.length ? e.versions : [{ path: e.path, name: e.name, quality: '' }];
    const sources = [];
    for (const v of versions) {
      const info = await ctx.probe(v.path).catch(() => null);
      const sid = idOf(v.path);
      if (info?.duration) { state.data[id] = { ...state.data[id], dur: info.duration, rel: e.path, name: cleanName(e.name) }; }
      sources.push(mediaSource(sid, v.path, info, v, v.quality ? `${cleanName(v.name)} (${v.quality})` : cleanName(v.name), { itemId: id, token, subFiles: await subtitleFilesFor(v) }));
    }
    save();
    return { MediaSources: sources, PlaySessionId: guid() };
  }

  // ---- HTTP ----
  const send = (res, status, body, type = 'application/json; charset=utf-8') => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(text) });
    res.end(text);
  };
  const noContent = (res) => { res.writeHead(204); res.end(); };
  const readJson = async (req) => { const c = []; for await (const b of req) { c.push(b); if (c.reduce((n, x) => n + x.length, 0) > 1e6) break; } try { return JSON.parse(Buffer.concat(c).toString('utf8') || '{}'); } catch { return {}; } };
  const userDto = () => ({
    Name: USER_NAME, ServerId: state.serverId, Id: state.userId, HasPassword: !!ctx.password(), HasConfiguredPassword: !!ctx.password(), HasConfiguredEasyPassword: false, EnableAutoLogin: false,
    LastLoginDate: new Date().toISOString(), LastActivityDate: new Date().toISOString(),
    Configuration: { PlayDefaultAudioTrack: true, SubtitleLanguagePreference: '', DisplayMissingEpisodes: false, SubtitleMode: 'Default', EnableLocalPassword: false, HidePlayedInLatest: true, RememberAudioSelections: true, RememberSubtitleSelections: true, EnableNextEpisodeAutoPlay: true },
    Policy: { IsAdministrator: false, IsHidden: false, IsDisabled: false, EnableAllFolders: true, EnableMediaPlayback: true, EnableAudioPlaybackTranscoding: false, EnableVideoPlaybackTranscoding: false, EnablePlaybackRemuxing: true, EnableContentDownloading: true, EnableRemoteAccess: true, EnableLiveTvAccess: false, EnableLiveTvManagement: false, EnableAllDevices: true, EnableAllChannels: true, EnablePublicSharing: false, EnableSyncTranscoding: false, AuthenticationProviderId: 'StreamHub', PasswordResetProviderId: 'StreamHub', InvalidLoginAttemptCount: 0, LoginAttemptsBeforeLockout: -1, MaxActiveSessions: 0, SyncPlayAccess: 'None' },
  });
  const publicInfo = (host) => ({ LocalAddress: `http://${host}`, ServerName: 'StreamHub', Version: SERVER_VERSION, ProductName: 'Jellyfin Server', OperatingSystem: process.platform, Id: state.serverId, StartupWizardCompleted: true });
  const tokenOf = (req, q) => {
    const h = req.headers;
    const header = `${h['x-emby-authorization'] || ''} ${h.authorization || ''}`;
    return h['x-emby-token'] || h['x-mediabrowser-token'] || /Token="([^"]+)"/i.exec(header)?.[1] || q.get('api_key') || q.get('apikey') || '';
  };
  const empty = (res) => send(res, 200, { Items: [], TotalRecordCount: 0, StartIndex: 0 });
  const unknown = new Set();

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const q = new URLSearchParams([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
    const p = url.pathname.replace(/\/+$/, '').replace(/^\/emby(?=\/)/i, '') || '/';
    const lp = p.toLowerCase(), method = req.method === 'HEAD' ? 'GET' : req.method;
    const host = req.headers.host || 'localhost';

    // open endpoints: a client needs these before it can sign in
    if (lp === '/system/info/public') return send(res, 200, publicInfo(host));
    if (lp === '/system/ping') return send(res, 200, '"Jellyfin Server"');
    if (lp === '/branding/configuration') return send(res, 200, { LoginDisclaimer: '', CustomCss: '', SplashscreenEnabled: false });
    if (lp === '/branding/css' || lp === '/branding/css.css') return send(res, 200, '', 'text/css');
    if (lp === '/users/public') return send(res, 200, []);
    if (lp === '/quickconnect/enabled') return send(res, 200, 'false');
    if (lp === '/users/authenticatebyname' && method === 'POST') {
      const b = await readJson(req);
      const pw = ctx.password();
      if (pw && !sameSecret(b.Pw ?? b.Password ?? '', pw)) return send(res, 401, { error: 'Incorrect password' });
      const token = guid();
      state.tokens[token] = { at: Date.now() };
      const keep = Object.entries(state.tokens).sort((a, b) => b[1].at - a[1].at).slice(0, 50); // old devices fall off
      state.tokens = Object.fromEntries(keep);
      save();
      return send(res, 200, { User: userDto(), SessionInfo: { Id: guid(), UserId: state.userId, UserName: USER_NAME, ServerId: state.serverId, Client: 'StreamHub', DeviceName: 'StreamHub', IsActive: true, SupportsRemoteControl: false, PlayableMediaTypes: ['Video'], SupportedCommands: [], AdditionalUsers: [] }, AccessToken: token, ServerId: state.serverId });
    }

    // images may be fetched without a token (Jellyfin does the same), and everything else needs one
    const img = /^\/items\/([0-9a-f]{32})\/images\/(\w+)(?:\/\d+)?$/.exec(lp);
    if (!img && !state.tokens[tokenOf(req, q)]) return send(res, 401, { error: 'Not signed in' });

    if (img) {
      const e = await entryFor(img[1]).catch(() => null), wantBackdrop = /backdrop/.test(img[2]);
      const meta = (rel) => (rel ? ctx.metaFor(rel).catch(() => null) : null);
      let src = null;
      if (e?.t === 'episode') src = e.still || (await meta(e.seriesRel))?.[wantBackdrop ? 'backdrop' : 'poster'];
      else if (e?.t === 'season') src = (await ctx.tmdbSeason(e.path, e.n ?? 1).catch(() => null))?.poster || (await meta(e.seriesRel))?.poster;
      else if (/^(backdrop|primary|thumb|logo|banner)$/.test(img[2])) {
        const m = await meta(e?.t ? e.path : relOf(img[1]));
        src = wantBackdrop ? m?.backdrop || m?.poster : m?.poster;
      }
      if (!src) return send(res, 404, { error: 'No image' });
      return ctx.image(req, res, src);
    }
    if (lp === '/system/info') return send(res, 200, { ...publicInfo(host), HasPendingRestart: false, IsShuttingDown: false, SupportsLibraryMonitor: false, WebSocketPortNumber: 0, CanSelfRestart: false, CanLaunchWebBrowser: false, HasUpdateAvailable: false });
    if (lp === '/users/me') return send(res, 200, userDto());
    if (/^\/users\/[0-9a-f]{32}$/.test(lp)) return send(res, 200, userDto());
    if (lp === '/userviews' || /^\/users\/[0-9a-f]{32}\/views$/.test(lp)) {
      const items = (await ctx.views()).map(viewDto);
      return send(res, 200, { Items: items, TotalRecordCount: items.length, StartIndex: 0 });
    }

    // items
    const one = /^(?:\/users\/[0-9a-f]{32})?\/items\/([0-9a-f]{32})$/.exec(lp);
    if (one && method === 'GET') {
      const dto = await dtoFor(one[1], { full: true });
      return dto ? send(res, 200, dto) : send(res, 404, { error: 'Unknown item' });
    }
    if (/^(?:\/users\/[0-9a-f]{32})?\/items\/resume$|^\/useritems\/resume$/.test(lp)) return send(res, 200, await resumeDto(q));
    if (/^(?:\/users\/[0-9a-f]{32})?\/items$/.test(lp)) {
      const ids = q0(q, 'ids').split(',').filter(Boolean).map(asId);
      if (ids.length) { const items = (await Promise.all(ids.map((i) => dtoFor(i, { full: true })))).filter(Boolean); return send(res, 200, page(items, q)); }
      return send(res, 200, await queryItems(q));
    }
    const shows = /^\/shows\/([0-9a-f]{32})\/(seasons|episodes)$/.exec(lp);
    if (shows) return send(res, 200, await showItems(shows[1], shows[2], q));
    if (lp === '/shows/nextup') return send(res, 200, await nextUp(q));
    if (/^\/items\/[0-9a-f]{32}\/(similar|ancestors|intros|thememedia|specialfeatures|localtrailers|remoteimages|instantmix)$/.test(lp)) return /similar|thememedia/.test(lp) ? empty(res) : send(res, 200, []);
    if (/\/items\/latest$|^\/(genres|studios|persons|artists|musicgenres|playlists)$/.test(lp)) return /latest$/.test(lp) ? send(res, 200, []) : empty(res);
    const pb = /^\/items\/([0-9a-f]{32})\/playbackinfo$/.exec(lp);
    if (pb) {
      const info = await playbackInfo(pb[1], tokenOf(req, q));
      return info ? send(res, 200, info) : send(res, 404, { error: 'Nothing to play here' });
    }
    const st = /^\/videos\/([0-9a-f]{32})\/(?:stream|original)(?:\.\w+)?$|^\/videos\/([0-9a-f]{32})\/[0-9a-f]{32}\/stream(?:\.\w+)?$|^\/items\/([0-9a-f]{32})\/download$/.exec(lp);
    if (st) {
      const id = (q.get('mediasourceid') || '').replace(/-/g, '').toLowerCase() || st[1] || st[2] || st[3];
      let rel = relOf(id) || relOf(st[1] || st[2] || st[3]);
      if (!rel) return send(res, 404, { error: 'Unknown item' });
      if (rel.startsWith('v:') || rel.startsWith('series:') || rel.startsWith('season:')) rel = null;
      if (!rel) return send(res, 404, { error: 'Not a file' });
      return ctx.stream(req, res, rel);
    }

    // external subtitle files for players that load them themselves (mpv)
    const sb = /^\/videos\/[0-9a-f]{32}\/([0-9a-f]{32})\/subtitles\/(\d+)(?:\/\d+)?\/stream(?:\.(\w+))?$/.exec(lp);
    if (sb) {
      const rel = subFiles.get(`${sb[1]}:${sb[2]}`);
      if (!rel) return send(res, 404, { error: 'Unknown subtitle' });
      const f = await ctx.subtitle(rel);
      const wantVtt = sb[3] === 'vtt';
      const body = wantVtt && f.ext === 'srt' ? srtToVtt(f.text) : f.text;
      return send(res, 200, body, wantVtt ? 'text/vtt; charset=utf-8' : 'application/x-subrip; charset=utf-8');
    }

    // watched state and progress
    const ses = /^\/sessions\/playing(?:\/(progress|stopped))?$/.exec(lp);
    if (ses && method === 'POST') {
      const b = await readJson(req), id = String(b.ItemId || '').replace(/-/g, '').toLowerCase();
      const e = id && (await entryFor(id));
      if (e && !e.isDir && !e.view) {
        const d = state.data[id] = { ...state.data[id], rel: e.path, name: e.title || cleanName(e.name), at: Date.now(), ...(e.t === 'episode' ? { series: e.seriesRel, sn: e.sn, en: e.n } : {}) };
        if (typeof b.PositionTicks === 'number') d.pos = b.PositionTicks / TICKS;
        if (ses[1] === 'stopped') {
          const dur = d.dur || (b.RunTimeTicks ? b.RunTimeTicks / TICKS : 0);
          if (dur && d.pos / dur > 0.92) { d.played = true; d.pos = 0; }
          save();
        } else if (ses[1] === 'progress') save();
      }
      return noContent(res);
    }
    const played = /^\/userplayeditems\/([0-9a-f]{32})$|^\/users\/[0-9a-f]{32}\/playeditems\/([0-9a-f]{32})$/.exec(lp);
    if (played && (method === 'POST' || method === 'DELETE')) {
      const id = played[1] || played[2], e = await entryFor(id);
      if (e && !e.view) { state.data[id] = { ...state.data[id], rel: e.path, name: e.title || cleanName(e.name), played: method === 'POST', pos: 0, at: Date.now(), ...(e.t === 'episode' ? { series: e.seriesRel, sn: e.sn, en: e.n } : {}) }; save(); }
      return send(res, 200, userData(id));
    }
    const fav = /^\/users\/[0-9a-f]{32}\/favoriteitems\/([0-9a-f]{32})$|^\/userfavoriteitems\/([0-9a-f]{32})$/.exec(lp);
    if (fav && (method === 'POST' || method === 'DELETE')) {
      const id = fav[1] || fav[2];
      state.data[id] = { ...state.data[id], fav: method === 'POST' }; save();
      return send(res, 200, userData(id));
    }
    const ud = /^\/useritems\/([0-9a-f]{32})\/userdata$/.exec(lp);
    if (ud) return send(res, 200, userData(ud[1]));

    // things clients ask for and we don't have
    if (/^\/sessions\/capabilities(?:\/full)?$/.test(lp) && method === 'POST') return noContent(res);
    if (/^\/displaypreferences\//.test(lp)) return method === 'POST' ? noContent(res) : send(res, 200, { Id: lp.split('/').pop(), SortBy: 'SortName', SortOrder: 'Ascending', RememberIndexing: false, RememberSorting: false, ScrollDirection: 'Horizontal', ShowBackdrop: true, ShowSidebar: false, CustomPrefs: {}, Client: 'emby', IndexBy: '' });
    if (/^\/sessions$/.test(lp)) return send(res, 200, []);
    if (!unknown.has(`${method} ${lp}`)) { unknown.add(`${method} ${lp}`); console.log(`Jellyfin API: unhandled ${method} ${p}`); }
    return send(res, 404, { error: 'Not found' });
  }

  const reset = () => { indexes.clear(); live.clear(); };
  return { handle, reset, serverId: () => state.serverId, userName: USER_NAME, close: () => { clearTimeout(saveTimer); } };
}
