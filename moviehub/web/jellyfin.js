// A Jellyfin-compatible API, so Jellyfin apps (the official ones, Streamyfin, Findroid, Swiftfin...) can browse and
// play your libraries from this computer. Version 1 shows each section as a "Home videos" library you browse folder by
// folder; every file plays directly (no transcoding). Typed Movie/Series/Episode items come later.
//
// server.js owns the libraries, so it hands this module what it needs (see `ctx` below) and runs the listener.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseName, extOf } from './listing.js';

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
    return { ...base(id), Name: v.name, SortName: v.name.toLowerCase(), Type: 'CollectionFolder', CollectionType: 'homevideos', IsFolder: true, ImageTags: {}, BackdropImageTags: [], ParentId: '' };
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

  async function entryFor(id) {
    if (live.has(id)) return live.get(id);
    const rel = relOf(id);
    if (!rel) return null;
    const views = await ctx.views();
    const v = views.find((x) => x.rel === rel);
    if (v) return { viewRel: v.rel, view: v };
    const name = decodeURIComponent(rel.replace(/\/$/, '').split('/').pop() || '');
    return { path: rel, name: name || rel, isDir: rel.endsWith('/') || rel.startsWith('v:'), kind: rel.endsWith('/') || rel.startsWith('v:') ? 'dir' : 'video' };
  }
  const dtoFor = async (id) => {
    const e = await entryFor(id);
    return !e ? null : e.view ? viewDto(e.view) : itemDto(e, '');
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
  async function resumeDto(q) {
    const rows = Object.entries(state.data).filter(([, d]) => d.pos > 0 && !d.played && d.rel).sort((a, b) => b[1].at - a[1].at);
    const items = [];
    for (const [id] of rows) { const dto = await dtoFor(id); if (dto) items.push(dto); }
    return page(items, q);
  }

  // ---- playback ----
  function mediaSource(id, rel, info, entry, name) {
    const streams = [];
    if (info?.video) streams.push({ Index: 0, Type: 'Video', Codec: info.video.codec, Width: info.video.width, Height: info.video.height, IsDefault: true, IsExternal: false, DisplayTitle: `${info.video.height || ''}p ${String(info.video.codec || '').toUpperCase()}`.trim() });
    const off = streams.length;
    (info?.audio || []).forEach((a, i) => streams.push({ Index: off + i, Type: 'Audio', Codec: a.codec, Channels: a.channels, Language: a.lang || undefined, Title: a.label, DisplayTitle: a.label, IsDefault: !!a.default || i === 0, IsExternal: false }));
    const off2 = streams.length;
    (info?.subs || []).forEach((s, i) => streams.push({ Index: off2 + i, Type: 'Subtitle', Codec: s.codec, Language: s.lang || undefined, Title: s.label, DisplayTitle: s.label, IsTextSubtitleStream: !!s.text, IsForced: !!s.forced, IsDefault: false, IsExternal: false, SupportsExternalStream: false, DeliveryMethod: 'Embed' }));
    const audioDefault = streams.find((s) => s.Type === 'Audio' && s.IsDefault)?.Index;
    return {
      Id: id, Name: name, Path: rel, Protocol: 'File', Type: 'Default', Container: extOf(rel.replace(/\/$/, '')), IsRemote: false,
      ...(Number.isFinite(entry?.size) ? { Size: entry.size } : {}), ...(info?.duration ? { RunTimeTicks: Math.round(info.duration * TICKS) } : {}),
      SupportsDirectPlay: true, SupportsDirectStream: true, SupportsTranscoding: false, ReadAtNativeFramerate: false, IgnoreDts: false, IgnoreIndex: false,
      GenPtsInput: false, SupportsProbing: false, VideoType: 'VideoFile', MediaStreams: streams, MediaAttachments: [], Formats: [], RequiredHttpHeaders: {},
      ...(audioDefault !== undefined ? { DefaultAudioStreamIndex: audioDefault } : {}), HasSegments: false,
    };
  }
  async function playbackInfo(id) {
    const e = await entryFor(id);
    if (!e || e.isDir || e.view) return null;
    const versions = e.versions?.length ? e.versions : [{ path: e.path, name: e.name, quality: '' }];
    const sources = [];
    for (const v of versions) {
      const info = await ctx.probe(v.path).catch(() => null);
      const sid = idOf(v.path);
      if (info?.duration) { state.data[id] = { ...state.data[id], dur: info.duration, rel: e.path, name: cleanName(e.name) }; }
      sources.push(mediaSource(sid, v.path, info, v, v.quality ? `${cleanName(v.name)} (${v.quality})` : cleanName(v.name)));
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
      const rel = relOf(img[1]);
      const m = rel ? await ctx.metaFor(rel).catch(() => null) : null;
      const src = /backdrop/.test(img[2]) ? m?.backdrop || m?.poster : /^(primary|thumb|logo|banner)$/.test(img[2]) ? m?.poster : null;
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
      const dto = await dtoFor(one[1]);
      return dto ? send(res, 200, dto) : send(res, 404, { error: 'Unknown item' });
    }
    if (/^(?:\/users\/[0-9a-f]{32})?\/items\/resume$|^\/useritems\/resume$/.test(lp)) return send(res, 200, await resumeDto(q));
    if (/^(?:\/users\/[0-9a-f]{32})?\/items$/.test(lp)) {
      const ids = q0(q, 'ids').split(',').filter(Boolean);
      if (ids.length) { const items = (await Promise.all(ids.map(dtoFor))).filter(Boolean); return send(res, 200, page(items, q)); }
      const parent = q0(q, 'parentid').replace(/-/g, '').toLowerCase();
      if (!parent) { const items = (await ctx.views()).map(viewDto); return send(res, 200, page(items, q)); }
      return send(res, 200, await childrenDto(parent, q));
    }
    if (/\/items\/latest$|^\/shows\/nextup$|^\/(genres|studios|persons|artists|musicgenres|playlists)$/.test(lp)) return /latest$/.test(lp) ? send(res, 200, []) : empty(res);
    const pb = /^\/items\/([0-9a-f]{32})\/playbackinfo$/.exec(lp);
    if (pb) {
      const info = await playbackInfo(pb[1]);
      return info ? send(res, 200, info) : send(res, 404, { error: 'Nothing to play here' });
    }
    const st = /^\/videos\/([0-9a-f]{32})\/(?:stream|original)(?:\.\w+)?$|^\/videos\/([0-9a-f]{32})\/[0-9a-f]{32}\/stream(?:\.\w+)?$|^\/items\/([0-9a-f]{32})\/download$/.exec(lp);
    if (st) {
      const id = (q.get('mediasourceid') || '').replace(/-/g, '').toLowerCase() || st[1] || st[2] || st[3];
      let rel = relOf(id) || relOf(st[1] || st[2] || st[3]);
      if (!rel) return send(res, 404, { error: 'Unknown item' });
      if (rel.startsWith('v:')) rel = null;
      if (!rel) return send(res, 404, { error: 'Not a file' });
      return ctx.stream(req, res, rel);
    }

    // watched state and progress
    const ses = /^\/sessions\/playing(?:\/(progress|stopped))?$/.exec(lp);
    if (ses && method === 'POST') {
      const b = await readJson(req), id = String(b.ItemId || '').replace(/-/g, '').toLowerCase();
      const e = id && (await entryFor(id));
      if (e && !e.isDir && !e.view) {
        const d = state.data[id] = { ...state.data[id], rel: e.path, name: cleanName(e.name), at: Date.now() };
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
      if (e && !e.view) { state.data[id] = { ...state.data[id], rel: e.path, name: cleanName(e.name), played: method === 'POST', pos: 0, at: Date.now() }; save(); }
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

  return { handle, serverId: () => state.serverId, userName: USER_NAME, close: () => { clearTimeout(saveTimer); } };
}
