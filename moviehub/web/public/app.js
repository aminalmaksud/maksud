// MusingsofMaksudTV UI: library browser with posters, details sheet, and a player with audio/subtitle menus.
const $ = (id) => document.getElementById(id);
if (navigator.userAgent.includes('Electron')) document.documentElement.classList.add('electron');
const WIN = navigator.userAgent.includes('Windows');
const DEVICE = WIN ? 'PC' : 'Mac'; // "save it to this Mac / PC"
// The Windows app (StreamHub) has its own look: sidebar navigation, blue on slate, light/dark themes.
const SH = document.documentElement.classList.contains('streamhub');
const INSTALL_FFMPEG = WIN ? '<code>winget install ffmpeg</code>' : '<code>brew install ffmpeg</code>';

/* ---------------- icons ---------------- */
const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I = {
  back: P('<path d="M15 18l-6-6 6-6"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  refresh: P('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'),
  folder: P('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  film: P('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>'),
  server: P('<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>'),
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  rew: P('<path d="M11 17l-5-5 5-5"/><path d="M18 17l-5-5 5-5"/>'),
  fwd: P('<path d="M13 17l5-5-5-5"/><path d="M6 17l5-5-5-5"/>'),
  next: P('<path d="M5 4l10 8-10 8z"/><path d="M19 5v14"/>'),
  vol: P('<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  mute: P('<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>'),
  cc: P('<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M10 10.5a2.5 2.5 0 1 0 0 3M17 10.5a2.5 2.5 0 1 0 0 3"/>'),
  audio: P('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  speed: P('<path d="M12 12l4-4"/><path d="M3.3 16a9 9 0 1 1 17.4 0"/>'),
  download: P('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
  trash: P('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  pip: P('<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="11" width="8" height="6" rx="1"/>'),
  full: P('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  unfull: P('<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>'),
  close: P('<path d="M18 6L6 18M6 6l12 12"/>'),
  tv: P('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M17 2l-5 5-5-5"/>'),
  spark: P('<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>'),
  calendar: P('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  globe: P('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>'),
  star: P('<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>'),
  check: P('<path d="M20 6L9 17l-5-5"/>'),
  file: P('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  bookmark: P('<path d="M6 3h12v18l-6-4-6 4z"/>'),
  down: P('<path d="M6 9l6 6 6-6"/>'),
  expand: P('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  undo: P('<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/>'),
  home: P('<path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'),
  monitor: P('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: P('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
};
const setIcon = (el, name) => { el.innerHTML = I[name]; };
setIcon($('backBtn'), 'back'); setIcon($('settingsBtn'), 'gear'); setIcon($('refreshBtn'), 'refresh');
document.querySelector('.search-ico').innerHTML = I.search;
document.querySelector('.sheet-close').innerHTML = I.close;

/* ---------------- helpers ---------------- */
const enc = encodeURIComponent;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stem = (n) => n.replace(/\.[^.]+$/, '');
const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : m) + ':' + String(x).padStart(2, '0');
};
// "Dune.Part.Two.2024.1080p.mkv" -> { title: "Dune Part Two", year: "2024", quality: "1080p" }
const QUAL_RE = /\b(2160p|4k|1440p|1080p|720p|576p|480p)\b/i;
function niceName(raw) {
  const s = String(raw).replace(/\.(mkv|mp4|m4v|avi|mov|webm|ts|wmv|flv|mpg|mpeg)$/i, '').replace(/[._]+/g, ' ').trim();
  const year = (/\b(?:19|20)\d{2}\b/.exec(s) || [''])[0];
  const q = (QUAL_RE.exec(s) || ['', ''])[1];
  const title = s.replace(/\s*[([][^)\]]*\b(?:19|20)\d{2}\b.*$/, '').replace(/\s(?:19|20)\d{2}\b.*$/, '').replace(QUAL_RE, '').replace(/[\s\-–:([]+$/, '').trim();
  return { title: title || s, year: title ? year : '', quality: q.toLowerCase() === '4k' ? '4K' : q.toLowerCase() };
}

/** Cover for a title without a poster: a palette from the website, a pattern, a big serif initial and a gold frame. */
const PALETTES = [
  ['#a3242f', '#2a070b', '#f5cf5b'], ['#127052', '#06231a', '#f5cf5b'], ['#2f4fb0', '#0d1330', '#f0c94e'],
  ['#6d2bb0', '#1c0a2c', '#ffc9e0'], ['#c06a1c', '#3a1708', '#ffe2a8'], ['#0e7c8c', '#05262c', '#ffd27a'],
  ['#b0285f', '#2c0716', '#ffd0e0'], ['#7a6a16', '#1c1806', '#f5e6a0'], ['#c23b22', '#350d06', '#ffd38a'],
];
function coverHtml(name, { icon = I.film, cls = '' } = {}) {
  const n = niceName(name);
  const h = hue(n.title);
  const [a, b, c] = PALETTES[h % PALETTES.length];
  const mono = (n.title.match(/[\p{L}\p{N}]/u) || ['✦'])[0].toUpperCase();
  const tags = [n.year, n.quality].filter(Boolean).map((t) => `<i>${esc(t)}</i>`).join('');
  return `<div class="ph ${cls}" data-pat="${h % 4}" style="--a:${a};--b:${b};--c:${c}">
    <span class="ph-mono">${esc(mono)}</span><span class="ph-frame"></span><span class="ph-ico">${icon}</span>
    <span class="ph-text">${tags ? `<span class="ph-tags">${tags}</span>` : ''}<b>${esc(n.title)}</b></span></div>`;
}

async function api(url, opts) {
  const r = await fetch(url, opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
  return body;
}
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('mh.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mh.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

/* ---------------- watch history ---------------- */
const history_ = store.get('history', {});
function progressOf(path) { return history_[path]; }
/** Progress of an item, whichever of its versions (720p, 1080p…) was watched. */
const progressFor = (it) => (it.versions || [it]).map((v) => history_[v.path]).filter(Boolean).sort((a, b) => b.at - a.at)[0];
function forget(path) { delete history_[path]; store.set('history', history_); }

/* ---------------- My List ---------------- */
const myList = store.get('mylist', []);
const inList = (path) => myList.some((x) => x.path === path);
function toggleList(it) {
  const i = myList.findIndex((x) => x.path === it.path);
  if (i >= 0) myList.splice(i, 1);
  else myList.unshift({ path: it.path, name: it.name, isDir: !!it.isDir, kind: it.kind || (it.isDir ? 'dir' : 'video'), ...(it.versions ? { versions: it.versions } : {}), at: Date.now() });
  store.set('mylist', myList);
  const on = i < 0;
  document.querySelectorAll('[data-list]').forEach((b) => {
    if (b.dataset.list !== it.path) return;
    b.classList.toggle('on', on); b.innerHTML = on ? I.check : I.plus; b.title = on ? 'Remove from My List' : 'Add to My List';
  });
  if (state.view === 'home') refreshHomeRows();
  if (state.view === 'list') showList();
  return on;
}
function saveProgress(item, pos, dur) {
  if (!dur || pos < 5) return;
  const done = pos > dur - Math.min(120, dur * 0.05);
  history_[item.path] = { path: item.path, name: item.name, pos: done ? 0 : pos, dur, done, at: Date.now() };
  const keys = Object.keys(history_);
  if (keys.length > 500) keys.sort((a, b) => history_[a].at - history_[b].at).slice(0, keys.length - 500).forEach((k) => delete history_[k]);
  store.set('history', history_);
}

/* ---------------- metadata (posters) ---------------- */
const metaCache = new Map();
const meta = (path) => {
  if (!metaCache.has(path)) metaCache.set(path, api(`/api/meta?path=${enc(path)}`).catch(() => null));
  return metaCache.get(path);
};
const lazy = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    lazy.unobserve(e.target);
    fillCard(e.target);
  }
}, { rootMargin: '400px' });

async function fillCard(card) {
  const m = await meta(card.dataset.path);
  if (!m || !card.isConnected) return;
  const img = card.querySelector('img');
  const src = card.classList.contains('wide-art') ? m.backdrop || m.poster : m.poster;
  if (img && src) { img.onload = () => img.classList.add('ok'); img.src = src; }
  // Clean title ("Oppenheimer" instead of "Oppenheimer 2023 2160p"); keep the raw name as a tooltip.
  const title = m.show && m.episode != null ? null : m.matched || m.title;
  if (title && !card.classList.contains('tile')) {
    card.querySelector('.t').textContent = title;
    card.querySelector('.ph b').textContent = title;
  }
  const s = card.querySelector('.s');
  if (s && !card.dataset.keepSub) {
    const bits = [];
    if (m.year) bits.push(m.year);
    if (m.rating) bits.push(`<span class="star">★</span> ${m.rating}`);
    if (bits.length) s.innerHTML = bits.join(' · ');
  }
}

/* ---------------- browsing ---------------- */
const state = { view: '', path: '', items: [], servers: [], roots: [], groups: [], config: null };

// Every item seen while browsing, and the folder it was seen in (for breadcrumbs through joined folders).
const known = new Map(), trail = new Map();
function remember(l) {
  for (const it of l.items) {
    known.set(it.path, it);
    if (it.isDir && l.path) trail.set(it.path, { name: it.name, parent: l.path });
  }
}

const folderCache = new Map();
function listFolder(path, { refresh = false } = {}) {
  if (refresh) folderCache.delete(path);
  if (!folderCache.has(path)) {
    const job = api(`/api/browse?path=${enc(path)}${refresh ? '&refresh=1' : ''}`);
    job.then((d) => {
      state.servers = d.servers || state.servers; state.roots = d.roots || state.roots; state.groups = d.groups || state.groups;
      for (const g of state.groups) trail.set(g.root, { name: g.name, parent: null });
      remember(d);
    }, () => folderCache.delete(path));
    folderCache.set(path, job);
  }
  return folderCache.get(path);
}

// Folder-name heuristics for BDIX layouts like "English Movies/(2024) 1080p/Dune Part Two (2024) 1080p/".
const isYearFolder = (n) => /^[([]?\s*(?:19|20)\d{2}(?:\s*[-–&,]\s*(?:19|20)?\d{2,4})?\s*[)\]]?(?:\s*(?:1080p|720p|480p|2160p|4k|hd))?\s*$/i.test(n.trim());
const yearOf = (n) => Math.max(0, ...(n.match(/(?:19|20)\d{2}/g) || ['0']).map(Number));
const isTitleFolder = (n) => (/\b(?:19|20)\d{2}\b/.test(n) && !isYearFolder(n)) || /\bS\d{1,2}\b|\bseason\b/i.test(n);
const playable = (items) => items.filter((i) => i.kind === 'dir' || i.kind === 'video');

/** A folder of categories ("English Movies", "Hindi Movies", year folders…) is shown as rows; anything else as a grid. */
function isCategoryFolder(items) {
  const dirs = items.filter((i) => i.isDir), vids = items.filter((i) => i.kind === 'video');
  if (!dirs.length || vids.length || dirs.length > 60) return false;
  return dirs.filter((d) => !isTitleFolder(d.name)).length >= dirs.length * 0.7;
}
const sortCategories = (dirs) => (dirs.every((d) => isYearFolder(d.name)) ? [...dirs].sort((a, b) => yearOf(b.name) - yearOf(a.name)) : dirs);

/** What a row for `dirPath` shows: its titles, or for a folder of years, the newest year's titles. */
async function rowContent(dirPath) {
  const l = await listFolder(dirPath);
  let items = playable(l.items), note = '';
  const dirs = items.filter((i) => i.isDir);
  if (dirs.length && dirs.every((d) => isYearFolder(d.name) || !isTitleFolder(d.name)) && !items.some((i) => i.kind === 'video')) {
    const newest = dirs.some((d) => isYearFolder(d.name)) ? [...dirs].sort((a, b) => yearOf(b.name) - yearOf(a.name))[0] : dirs[0];
    items = playable((await listFolder(newest.path)).items);
    note = newest.name.replace(/[()[\]]/g, '').trim();
  }
  return { items: items.slice(0, 40), note };
}

// Joined folders ("v:…") list the real folders they stand for; the first one tells the section.
const decodeV = (p) => { try { return JSON.parse(atob(p.slice(2).replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; } };
const realPath = (p) => (String(p).startsWith('v:') ? decodeV(p)?.[0] || '' : String(p));
function groupIdxOf(path) {
  const p = realPath(path);
  if (!/^\d+\//.test(p)) return -1;
  const lib = Number(p.split('/')[0]);
  const g = state.groups.findIndex((x) => x.libs.includes(lib));
  return g >= 0 ? g : lib;
}
const libraryName = (path) => state.groups[groupIdxOf(path)]?.name || state.servers[Number(realPath(path).split('/')[0])] || 'Library';
const listButton = (it) => `<span class="card-act add${inList(it.path) ? ' on' : ''}" role="button" data-list="${esc(it.path)}" title="${inList(it.path) ? 'Remove from My List' : 'Add to My List'}">${inList(it.path) ? I.check : I.plus}</span>`;

function cardHtml(it, { wideArt = false, sub = '', forgettable = false } = {}) {
  const isDir = it.isDir;
  const name = isDir ? it.name : stem(it.name);
  const prog = !isDir && progressFor(it);
  const pct = prog && !prog.done && prog.dur ? Math.min(100, (prog.pos / prog.dur) * 100) : 0;
  const quals = (it.versions || []).map((v) => v.quality).filter(Boolean);
  return `<button class="card${wideArt ? ' wide-art' : ''}" data-path="${esc(it.path)}" title="${esc(name)}"${sub ? ' data-keep-sub="1"' : ''}>
    <div class="poster">
      ${coverHtml(name, { icon: isDir && !isTitleFolder(name) ? I.folder : I.film })}
      <img alt="" loading="lazy">
      ${quals.length > 1 ? `<span class="badge q">${esc(quals.join(' · '))}</span>` : ''}
      ${prog?.done ? `<span class="badge done">${I.check}Watched</span>` : ''}
      ${pct ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ''}
      <div class="hover-play"><span>${I.play}</span></div>
      ${forgettable ? `<span class="card-act x" role="button" data-forget="${esc(it.path)}" title="Remove from Continue watching">${I.close}</span>` : listButton(it)}
    </div>
    <div class="cap"><div class="t">${esc(niceName(name).title)}</div><div class="s">${esc(sub || niceName(name).year)}</div></div>
  </button>`;
}

/* ----- rows (Netflix-style) ----- */
const rowObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    rowObserver.unobserve(e.target);
    fillRow(e.target);
  }
}, { rootMargin: '600px' });

// Coloured icon tiles, like the category chips on musingsofmaksud.com.
const TILE_COLORS = ['#f08a1c', '#b3262d', '#1f8a5b', '#2f6fd1', '#8b3fd1', '#d4a33f', '#e23d6d', '#138a9e'];
function rowIcon(title) {
  const t = title.toLowerCase();
  const icon = isYearFolder(title) ? I.calendar : /anime|cartoon|animation/.test(t) ? I.spark : /series|tv|show|season|drama/.test(t) ? I.tv
    : /foreign|korean|hindi|bangla|tamil|telugu|english|chinese|japanese|dubbed/.test(t) ? I.globe : /top|imdb|best|award/.test(t) ? I.star : I.film;
  return `<span class="row-ico" style="--c:${TILE_COLORS[hue(title) % TILE_COLORS.length]}">${icon}</span>`;
}
// Each library's header panel gets its own colour, like the series pages on the website.
const PANELS = [
  'linear-gradient(118deg, #2a070b 0%, #561017 38%, #8a1b26 72%, #a52734 100%)',
  'linear-gradient(118deg, #1d0f08 0%, #4a2a17 35%, #a2732a 72%, #f0c94e 100%)',
  'linear-gradient(118deg, #06231a 0%, #0f4a35 40%, #1f8a5b 78%, #5cc489 100%)',
  'linear-gradient(118deg, #0d1330 0%, #1f2f6b 40%, #3d5fc4 78%, #7ea2ff 100%)',
  'linear-gradient(118deg, #1c0a2c 0%, #43166b 40%, #8b3fd1 78%, #c08bff 100%)',
];

function rowShell({ title, sub = '', path = '' }) {
  return `<section class="row" data-row="${esc(path)}">
    <div class="row-head">${rowIcon(title)}${path ? `<a class="row-title" data-go="${esc(path)}">${esc(title)}<span class="see-all">See all ›</span></a>` : `<h2 class="row-title">${esc(title)}</h2>`}${sub ? `<small>${esc(sub)}</small>` : ''}</div>
    <div class="row-wrap"><button class="row-arrow left" aria-label="Scroll left">${I.back}</button>
      <div class="row-scroll"><div class="row-skel"></div><div class="row-skel"></div><div class="row-skel"></div><div class="row-skel"></div><div class="row-skel"></div><div class="row-skel"></div></div>
      <button class="row-arrow right" aria-label="Scroll right">${I.back}</button></div>
  </section>`;
}

async function fillRow(section) {
  const scroller = section.querySelector('.row-scroll');
  try {
    const { items, note } = await rowContent(section.dataset.row);
    if (!items.length) { section.remove(); return; }
    if (note) section.querySelector('.row-head').insertAdjacentHTML('beforeend', `<small>Newest · ${esc(note)}</small>`);
    scroller.innerHTML = items.map((it) => cardHtml(it)).join('');
    scroller.querySelectorAll('.card').forEach((c) => lazy.observe(c));
    heroOffer(items);
  } catch {
    section.remove();
  }
}

document.addEventListener('click', (e) => {
  const arrow = e.target.closest('.row-arrow');
  if (!arrow) return;
  const sc = arrow.parentElement.querySelector('.row-scroll');
  sc.scrollBy({ left: (arrow.classList.contains('left') ? -1 : 1) * sc.clientWidth * 0.85, behavior: 'smooth' });
});

/* ----- hero: a slideshow of featured titles ----- */
// Rows finish loading in any order; each offers a few random titles. Titles with a backdrop make the best
// slides, then ones with a poster; plain covers fill in only when nothing else has art.
const HERO_MAX = 8;
const hero = { slides: [], i: -1, queue: [], busy: false, plain: [], epoch: 0 };
let heroItem = null;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

async function heroOffer(items) {
  if (state.view !== 'home') return;
  hero.queue.push(...shuffle(items.filter((i) => i.isDir || i.kind === 'video').slice(0, 12)).slice(0, 3));
  if (hero.busy) return;
  hero.busy = true;
  const epoch = hero.epoch;
  try {
    while (hero.queue.length && hero.slides.length < HERO_MAX) {
      const it = hero.queue.shift();
      if (hero.slides.some((x) => x.it.path === it.path)) continue;
      const m = await meta(it.path);
      if (epoch !== hero.epoch || state.view !== 'home') return;
      if (m?.backdrop || m?.poster) addSlide(it, m);
      else hero.plain.push({ it, m: m || {} });
    }
    // No art anywhere yet: show covers so the panel is never empty.
    while (hero.slides.length < 3 && hero.plain.length) addSlide(...Object.values(hero.plain.shift()));
  } finally { if (epoch === hero.epoch) hero.busy = false; }
}

function addSlide(it, m) {
  const art = m.backdrop || '';
  const el = document.createElement('div');
  el.className = 'hero-slide' + (art ? '' : ' soft');
  if (art || m.poster) el.style.backgroundImage = `url("${art || m.poster}")`;
  $('heroArt').append(el);
  hero.slides.push({ it, m, el });
  $('heroDots').innerHTML = hero.slides.map((_, i) => `<button data-slide="${i}" aria-label="Slide ${i + 1}"${i === hero.i ? ' class="on"' : ''}></button>`).join('');
  $('hero').classList.toggle('multi', hero.slides.length > 1);
  if (hero.i < 0) showSlide(0);
}

function showSlide(i) {
  if (!hero.slides.length) return;
  i = (i + hero.slides.length) % hero.slides.length;
  const first = hero.i < 0;
  hero.i = i;
  const { it, m, el } = hero.slides[i];
  heroItem = it;
  hero.slides.forEach((s) => s.el.classList.toggle('on', s.el === el));
  $('heroDots').querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i));
  const text = $('heroText');
  const fill = () => {
    $('heroTitle').textContent = m.matched || m.title || niceName(it.name).title;
    $('heroMeta').innerHTML = [m.year || niceName(it.name).year, m.rating && `<span class="star">★</span> ${m.rating}`, esc(libraryName(it.path))].filter(Boolean).join('  ·  ');
    $('heroOverview').textContent = m.overview || '';
    $('heroPlay').innerHTML = `${I.play}Play`;
    $('heroList').innerHTML = inList(it.path) ? `${I.check}My List` : `${I.plus}My List`;
    $('heroList').dataset.list = it.path;
    // Without a backdrop the poster (or a cover) stands on the right, like a book on a shelf.
    $('heroPoster').innerHTML = m.backdrop ? '' : m.poster ? `<img src="${esc(m.poster)}" alt="">` : coverHtml(it.name);
    $('heroPoster').hidden = !!m.backdrop;
    text.classList.remove('out');
  };
  if (first) fill(); else { text.classList.add('out'); setTimeout(fill, 260); }
  // Restart the progress line; when it finishes the next slide comes in (hovering pauses it).
  const bar = $('heroTimer');
  bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
  $('hero').hidden = false;
  document.body.classList.add('has-hero');
}
$('heroTimer').addEventListener('animationend', () => { if (hero.slides.length > 1 && state.view === 'home') showSlide(hero.i + 1); });
$('heroPrev').onclick = () => showSlide(hero.i - 1);
$('heroNext').onclick = () => showSlide(hero.i + 1);
$('heroDots').addEventListener('click', (e) => { const b = e.target.closest('[data-slide]'); if (b) showSlide(Number(b.dataset.slide)); });
function hideHero() {
  hero.epoch++; hero.slides = []; hero.i = -1; hero.queue = []; hero.plain = []; hero.busy = false; heroItem = null;
  $('heroArt').innerHTML = ''; $('heroDots').innerHTML = ''; $('hero').hidden = true; $('hero').classList.remove('multi');
  document.body.classList.remove('has-hero');
}
$('heroPlay').onclick = () => heroItem && activate(heroItem, { play: true });
$('heroInfo').onclick = () => heroItem && activate(heroItem);
$('heroList').onclick = () => { if (heroItem) { const on = toggleList(heroItem); $('heroList').innerHTML = `${on ? I.check : I.plus}My List`; } };
setIcon($('heroPrev'), 'back'); setIcon($('heroNext'), 'back');

/* ----- views ----- */
function resetView(view) {
  state.view = view;
  $('rows').innerHTML = ''; $('grid').innerHTML = ''; $('grid').className = '';
  $('status').textContent = ''; $('status').className = '';
  $('folderHead').hidden = view === 'home';
  $('welcome').hidden = true;
  if (view !== 'search') $('filter').value = ''; // a search left in the box must not hide a folder's contents
  hideHero();
  window.scrollTo({ top: 0 });
}

const continueList = () => Object.values(history_).filter((h) => !h.done && h.pos > 30).sort((a, b) => b.at - a.at).slice(0, 15);
function continueRowHtml() {
  const list = continueList();
  if (!list.length) return '';
  return `<section class="row continue"><div class="row-head"><span class="row-ico" style="--c:#d4a33f">${I.play}</span><h2 class="row-title">Continue watching</h2><small class="hint-x">Hover a title and press × to remove it</small></div>
    <div class="row-wrap"><div class="row-scroll wide">${list.map((h) => cardHtml({ name: h.name, path: h.path, isDir: false, kind: 'video' }, { wideArt: true, sub: `${fmt(h.dur - h.pos)} left`, forgettable: true })).join('')}</div></div></section>`;
}
function myListRowHtml() {
  if (!myList.length) return '';
  myList.forEach((x) => { if (!known.has(x.path)) known.set(x.path, x); });
  return `<section class="row mylist"><div class="row-head"><span class="row-ico" style="--c:#e23d6d">${I.bookmark}</span><a class="row-title" href="#/list">My List<span class="see-all">See all ›</span></a><small>${myList.length}</small></div>
    <div class="row-wrap"><button class="row-arrow left" aria-label="Scroll left">${I.back}</button><div class="row-scroll">${myList.slice(0, 30).map((x) => cardHtml(x)).join('')}</div><button class="row-arrow right" aria-label="Scroll right">${I.back}</button></div></section>`;
}
/** Re-draws "Continue watching" and "My List" on Home in place. */
function refreshHomeRows() {
  if (state.view !== 'home') return;
  for (const [sel, html] of [['.continue', continueRowHtml()], ['.mylist', myListRowHtml()]]) {
    const old = document.querySelector(`#rows ${sel}`);
    if (old) { if (html) old.outerHTML = html; else old.remove(); }
    else if (html) {
      const after = sel === '.mylist' && document.querySelector('#rows .continue');
      if (after) after.insertAdjacentHTML('afterend', html); else $('rows').insertAdjacentHTML('afterbegin', html);
    }
  }
  $('rows').querySelectorAll('.continue .card, .mylist .card').forEach((c) => lazy.observe(c));
}

async function showHome() {
  resetView('home');
  renderNav();
  let c;
  try { c = state.config = await api('/api/config'); } catch (e) { $('status').textContent = e.message; $('status').className = 'error'; return; }
  if (!c.servers.length) { $('welcome').hidden = false; hideHero(); return; }
  $('status').textContent = 'Loading your libraries…';
  let libs;
  try { libs = await listFolder(''); } catch (e) { $('status').textContent = e.message; $('status').className = 'error'; return; }
  if (state.view !== 'home') return;
  renderNav();
  // One block of rows per section; libraries that share a name ("Movies", "Movies 1080p") are one section.
  const groups = state.groups.length ? state.groups : [{ name: 'Library', root: libs.path }];
  const listings = await Promise.all(groups.map((g) => listFolder(g.root).catch(() => null)));
  if (state.view !== 'home') return;
  $('status').textContent = '';
  let html = continueRowHtml() + myListRowHtml();
  listings.forEach((l, i) => {
    const g = groups[i];
    if (!l) { html += `<p class="status error">Can’t reach “${esc(g.name)}” right now.</p>`; return; }
    if (isCategoryFolder(l.items)) {
      for (const d of sortCategories(l.items.filter((x) => x.isDir))) html += rowShell({ title: d.name, sub: groups.length > 1 ? g.name : '', path: d.path });
    } else {
      html += rowShell({ title: g.name, path: l.path });
    }
  });
  $('rows').innerHTML = html;
  $('rows').querySelectorAll('.row[data-row]').forEach((r) => rowObserver.observe(r));
  $('rows').querySelectorAll('.continue .card, .mylist .card').forEach((c2) => lazy.observe(c2));
  heroOffer(myList.slice(0, 6));
}

function showList() {
  resetView('list');
  renderNav();
  $('crumbs').innerHTML = '<a href="#/">Home</a>';
  $('folderTitle').textContent = 'My List';
  $('folderSub').textContent = myList.length ? `${myList.length} saved for later` : '';
  $('folderHead').style.setProperty('--panel', PANELS[4]);
  $('backBtn').hidden = false;
  myList.forEach((x) => { if (!known.has(x.path)) known.set(x.path, x); });
  gridItems = myList.slice(); gridSub = (it) => (it.isDir ? libraryName(it.path) : '');
  $('grid').innerHTML = gridItems.map((it) => cardHtml(it, { sub: gridSub(it) })).join('');
  $('grid').querySelectorAll('.card').forEach((c) => lazy.observe(c));
  $('status').textContent = myList.length ? '' : 'Nothing saved yet. Press + on any poster, or “My List” on a movie, to keep it here for later.';
}

async function showFolder(path, { refresh = false } = {}) {
  resetView('folder');
  $('status').textContent = 'Loading…';
  let l;
  try { l = await listFolder(path, { refresh }); } catch (e) {
    if (state.view === 'folder') { $('status').textContent = e.message; $('status').className = 'error'; }
    return;
  }
  if (state.view !== 'folder') return;
  state.path = l.path; state.items = l.items;
  renderNav(); renderHead();
  $('status').textContent = '';
  if (isCategoryFolder(l.items)) {
    $('rows').innerHTML = sortCategories(l.items.filter((x) => x.isDir)).map((d) => rowShell({ title: d.name, path: d.path })).join('');
    $('rows').querySelectorAll('.row[data-row]').forEach((r) => rowObserver.observe(r));
  } else {
    renderGrid(playable(l.items));
  }
}

async function showSearch(q) {
  resetView('search');
  $('filter').value = q;
  $('folderTitle').textContent = `Results for “${q}”`;
  $('crumbs').innerHTML = ''; $('folderSub').textContent = '';
  $('status').textContent = 'Searching…';
  try {
    const r = await api(`/api/search?q=${enc(q)}`);
    if (state.view !== 'search') return;
    if (!r.searchable) {
      $('status').textContent = 'These servers don’t support searching everything at once. Open a folder and type to filter it.';
      return;
    }
    $('status').textContent = r.items.length ? '' : 'Nothing found. Try fewer words, or the original title.';
    $('folderSub').textContent = r.items.length ? `${r.items.length} result${r.items.length > 1 ? 's' : ''}` : '';
    remember({ path: '', items: r.items });
    renderGrid(r.items, { sub: (it) => it.library || '' });
  } catch (e) { $('status').textContent = e.message; $('status').className = 'error'; }
}

/* ----- grid / episodes ----- */
const EPISODE_RE = /\bS\d{1,2} ?E\d{1,3}\b|\b\d{1,2}x\d{2}\b|\b(?:ep|episode|e)[ ._-]?\d{1,3}\b|\s-\s\d{1,4}\b|^\d{1,3}\b/i;
const isEpisodeFolder = (videos) => videos.length >= 2 && videos.filter((v) => EPISODE_RE.test(v.name)).length >= videos.length * 0.6;

function epNumber(name, i) {
  const m = /\bS\d{1,2} ?E(\d{1,3})\b|\b\d{1,2}x(\d{2})\b|\b(?:ep|episode|e)[ ._-]?(\d{1,3})\b|\s-\s(\d{1,4})\b|^(\d{1,3})\b/i.exec(name);
  return m ? Number(m.slice(1).find(Boolean)) : i + 1;
}

/** "Breaking.Bad.S01E02.720p.mkv" -> "Episode 2"; keeps real episode titles ("S01E02 - Cat's in the Bag"). */
function epTitle(name, i) {
  const s = stem(name).replace(/[._]+/g, ' ');
  const m = /\bS\d{1,2} ?E\d{1,3}\b\s*[-–:]?\s*(.*)$/i.exec(s);
  const rest = m && m[1].replace(/\b(2160p|1080p|720p|480p|web.?dl|webrip|bluray|hdtv|x26[45]|h ?26[45]|hevc|aac|10bit).*$/i, '').trim();
  return rest && rest.length > 2 ? rest : `Episode ${epNumber(name, i)}`;
}

let gridItems = [], gridSub = null;
function renderGrid(items, { sub = null } = {}) {
  gridItems = items; gridSub = sub;
  const grid = $('grid');
  const q = state.view === 'folder' ? $('filter').value.trim().toLowerCase() : '';
  const visible = items.filter((i) => !q || i.name.toLowerCase().includes(q));
  const videos = visible.filter((i) => i.kind === 'video');
  const episodes = state.view === 'folder' && !visible.some((i) => i.isDir) && isEpisodeFolder(videos);
  grid.className = episodes ? 'list' : '';
  if (episodes) {
    grid.innerHTML = videos.map((v, i) => {
      const p = progressFor(v);
      const pct = p && !p.done && p.dur ? (p.pos / p.dur) * 100 : 0;
      return `<button class="ep" data-path="${esc(v.path)}"><span class="num">${epNumber(v.name, i)}</span>
        <span><div class="t">${esc(epTitle(v.name, i))}</div><div class="s">${p?.done ? 'Watched' : pct ? `${fmt(p.dur - p.pos)} left` : esc(stem(v.name))}</div></span>
        <span class="ep-end">${p?.done ? `<span class="check">${I.check}</span>` : pct ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}${p ? `<span class="ep-x" role="button" data-forget="${esc(p.path)}" title="${p.done ? 'Mark as unwatched' : 'Remove progress'}">${I.undo}</span>` : ''}</span></button>`;
    }).join('');
  } else {
    grid.innerHTML = visible.map((it) => cardHtml(it, { sub: sub ? sub(it) : '' })).join('');
    grid.querySelectorAll('.card').forEach((c) => lazy.observe(c));
  }
  if (state.view === 'folder') $('status').textContent = !visible.length ? (q ? 'Nothing here matches your search.' : 'This folder is empty.') : '';
}
const render = () => { if (state.view === 'folder' || state.view === 'search') renderGrid(gridItems, { sub: gridSub }); };

function renderNav() {
  const cur = state.view === 'home' ? -1 : state.view === 'folder' ? groupIdxOf(state.path) : -2;
  if (SH) return renderSideNav(cur);
  $('nav').innerHTML = `<a href="#/" class="${cur === -1 ? 'on' : ''}">Home</a>` +
    state.groups.map((g, i) => `<a data-go="${esc(g.root)}" class="${cur === i ? 'on' : ''}">${esc(g.name)}</a>`).join('') +
    `<a href="#/list" class="${state.view === 'list' ? 'on' : ''}">My List</a>` +
    (state.config?.downloads ? `<a href="#/downloads" class="${state.view === 'downloads' ? 'on' : ''}">⬇ Downloads</a>` : '');
}

/** StreamHub's sidebar: the same places as the Mac app's tabs, with icons, plus the Server page. */
function renderSideNav(cur) {
  const item = (on, attrs, icon, label, extra = '') => `<a ${attrs} class="${on ? 'on' : ''}" title="${esc(label)}">${icon}<span>${esc(label)}</span>${extra}</a>`;
  const sectionIcon = (name) => (/anime|cartoon|animation/i.test(name) ? I.spark : /series|tv|show|season|drama/i.test(name) ? I.tv : I.film);
  $('nav').innerHTML = item(cur === -1, 'href="#/"', I.home, 'Home') +
    state.groups.map((g, i) => item(cur === i, `data-go="${esc(g.root)}"`, sectionIcon(g.name), g.name)).join('') +
    item(state.view === 'list', 'href="#/list"', I.bookmark, 'My List') +
    (state.config?.downloads ? item(state.view === 'downloads', 'href="#/downloads"', I.download, 'Downloads', '<em id="dlBadge" hidden></em>') : '') +
    item(state.view === 'server', 'href="#/server"', I.server, 'Server');
  if (state.config?.downloads) {
    api('/api/downloads').then((d) => {
      const n = d.active.filter((j) => j.status === 'downloading').length;
      const b = $('dlBadge');
      if (b) { b.textContent = n; b.hidden = !n; }
    }).catch(() => {});
  }
}

function renderHead() {
  const idx = groupIdxOf(state.path);
  const g = state.groups[idx];
  // Walk up through the folders this one was opened from; joined folders have no path of their own to split.
  let crumbs = [];
  for (let p = state.path, n = 0; p && n < 30; n++) {
    const t = trail.get(p);
    if (!t) { crumbs = null; break; }
    crumbs.unshift([t.name, p]);
    if (!t.parent) break;
    p = t.parent;
  }
  if (!crumbs || !crumbs.length || trail.get(crumbs[0][1])?.parent) {
    // Opened directly (e.g. after a restart): rebuild from the real path under its library.
    const lib = Number(realPath(state.path).split('/')[0]);
    const root = state.roots[lib] || `${lib}/`;
    const path = realPath(state.path);
    crumbs = [[g?.name || state.servers[lib] || 'Library', g?.root || root]];
    if (path.startsWith(root)) {
      let acc = root;
      for (const seg of path.slice(root.length).split('/').filter(Boolean)) { acc += seg + '/'; crumbs.push([decodeURIComponent(seg), acc]); }
    }
    if (state.path.startsWith('v:')) crumbs[crumbs.length - 1][1] = state.path;
  }
  crumbs.unshift(['Home', null]);
  $('crumbs').innerHTML = crumbs.slice(0, -1).map(([l, p]) => (p ? `<a data-go="${esc(p)}">${esc(l)}</a>` : `<a href="#/">${esc(l)}</a>`)).join('<span>›</span>');
  $('folderTitle').textContent = crumbs[crumbs.length - 1][0];
  $('folderHead').style.setProperty('--panel', PANELS[Math.max(0, idx) % PANELS.length]);
  const dirs = state.items.filter((i) => i.isDir).length, vids = state.items.filter((i) => i.kind === 'video').length;
  $('folderSub').textContent = [dirs && `${dirs} folder${dirs > 1 ? 's' : ''}`, vids && `${vids} video${vids > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
  $('backBtn').hidden = false;
}

/* ----- routing ----- */
const go = (path) => { location.hash = '#/f/' + enc(path); };
function route({ refresh = false } = {}) {
  const h = location.hash.replace(/^#\/?/, '');
  $('backBtn').hidden = !h;
  if (h.startsWith('f/')) return showFolder(decodeURIComponent(h.slice(2)), { refresh });
  if (h.startsWith('search/')) return showSearch(decodeURIComponent(h.slice(7)));
  if (h === 'downloads') return showDownloads();
  if (h === 'list') return showList();
  if (h === 'server' && SH) return showServer();
  return showHome();
}
window.addEventListener('hashchange', () => route());
$('backBtn').onclick = () => history.back();
$('refreshBtn').onclick = () => { metaCache.clear(); folderCache.clear(); route({ refresh: true }); };
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-go]');
  if (a) { e.preventDefault(); go(a.dataset.go); }
});

let searchTimer = 0;
$('filter').addEventListener('input', () => {
  clearTimeout(searchTimer);
  if (state.view === 'folder') return render(); // inside a folder: filter it instantly
  const q = $('filter').value.trim();
  if (q.length >= 2) searchTimer = setTimeout(() => { location.hash = '#/search/' + enc(q); }, 450);
});
$('filter').addEventListener('keydown', (e) => {
  const q = $('filter').value.trim();
  if (e.key === 'Enter' && q.length >= 2) { clearTimeout(searchTimer); location.hash = '#/search/' + enc(q); }
});

/** Click on a card: folders open; a folder holding just a movie opens that movie's details directly. */
async function activate(item, { play = false } = {}) {
  if (!item.isDir) return play ? startPlayback(item) : showDetails(item);
  let l = null;
  try { l = await listFolder(item.path); } catch { /* open it anyway and show the error there */ }
  const vids = l ? l.items.filter((i) => i.kind === 'video') : [];
  const episodic = /\bseason\b|^s\d{1,2}$|\bseries\b/i.test(item.name) || vids.some((v) => EPISODE_RE.test(v.name));
  if (l && vids.length && vids.length <= 3 && !episodic && !l.items.some((i) => i.isDir)) {
    const main = vids.find((v) => !/sample|trailer/i.test(v.name)) || vids[0];
    return play ? startPlayback(main) : showDetails(main, { metaPath: item.path, folder: item });
  }
  go(item.path);
}

function findItem(path) {
  for (const list of [gridItems, state.items]) { const it = list.find((i) => i.path === path); if (it) return it; }
  if (known.has(path)) return known.get(path);
  const h = history_[path];
  if (h) return { name: h.name, path, isDir: false, kind: 'video' };
  const real = realPath(path);
  const name = decodeURIComponent(real.replace(/\/$/, '').split('/').pop());
  const dir = real.endsWith('/');
  return { name, path, isDir: dir, kind: dir ? 'dir' : 'video' };
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('.card[data-path], .ep[data-path]');
  if (!el || el.closest('#player')) return;
  const item = findItem(el.dataset.path);
  if (el.classList.contains('ep') || el.closest('.continue')) return startPlayback(item);
  activate(item);
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-list]:not(#heroList), [data-forget]');
  if (!b) return;
  e.stopPropagation(); e.preventDefault();
  if (b.dataset.list) {
    const it = findItem(b.dataset.list);
    toast2(toggleList(it) ? 'Added to My List' : 'Removed from My List');
  } else {
    forget(b.dataset.forget);
    toast2('Removed from Continue watching');
    if (state.view === 'home') refreshHomeRows(); else render();
  }
}, true);
/** A small note at the bottom of the window (the player has its own toast). */
let toast2Timer = 0;
function toast2(msg) {
  const t = $('note'); t.textContent = msg; t.hidden = false; t.classList.remove('out');
  clearTimeout(toast2Timer); toast2Timer = setTimeout(() => t.classList.add('out'), 1800);
}

/* ---------------- downloads (Mac and Windows apps) ---------------- */
const fmtBytes = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(0) + ' MB' : Math.round(n / 1e3) + ' KB');
let dlTimer = 0;
async function downloadItem(item) {
  try {
    const r = await api('/api/downloads', { method: 'POST', body: JSON.stringify({ path: item.path }) });
    return r;
  } catch (e) { alert(e.message); return null; }
}

async function showDownloads() {
  resetView('downloads');
  renderNav();
  $('crumbs').innerHTML = '<a href="#/">Home</a>';
  $('folderTitle').textContent = 'Downloads';
  $('folderHead').style.setProperty('--panel', PANELS[1]);
  $('backBtn').hidden = false;
  const tick = async () => {
    if (state.view !== 'downloads') return;
    let d;
    try { d = await api('/api/downloads'); } catch (e) { $('status').textContent = e.message; return; }
    $('folderSub').innerHTML = `Saved in <code>${esc(d.dir.replace(/^\/Users\/[^/]+|^[A-Z]:\\Users\\[^\\]+/i, '~'))}</code> · watch them without the internet <button class="btn mini" id="revealBtn">Show in ${WIN ? 'Explorer' : 'Finder'}</button>`;
    $('revealBtn').onclick = () => api('/api/reveal').catch(() => {});
    $('rows').innerHTML = d.active.length ? `<div class="dl-list">${d.active.map((j) => {
      const pct = j.total ? Math.floor((j.received / j.total) * 100) : 0;
      return `<div class="dl"><div class="dl-main"><b>${esc(stem(j.name))}</b>
        <small>${j.status === 'error' ? `Failed: ${esc(j.error)} — press Retry` : `${fmtBytes(j.received)}${j.total ? ' of ' + fmtBytes(j.total) : ''}${j.speed ? ' · ' + fmtBytes(j.speed) + '/s' : ''}`}</small>
        <div class="dl-bar"><i style="width:${pct}%"></i></div></div>
        <span class="dl-pct">${j.status === 'error' ? '!' : pct + '%'}</span>
        ${j.status === 'error' ? `<button class="btn mini" data-retry="${esc(j.id)}">Retry</button>` : ''}
        <button class="btn mini" data-cancel="${esc(j.id)}">Cancel</button></div>`;
    }).join('')}</div>` : '';
    gridItems = d.done.map((f) => ({ name: f.name, path: f.path, isDir: false, kind: 'video', size: f.size }));
    $('grid').innerHTML = gridItems.map((it) => cardHtml(it, { sub: fmtBytes(it.size) }).replace('<div class="hover-play">',
      `<span class="dl-del" data-del="${esc(it.name)}" title="Delete download">${I.trash}</span><div class="hover-play">`)).join('');
    $('grid').querySelectorAll('.card').forEach((c) => lazy.observe(c));
    $('status').textContent = !d.active.length && !d.done.length ? `Nothing downloaded yet. Press ⬇ in the player or on a movie to save it to this ${DEVICE}.` : '';
    clearTimeout(dlTimer);
    if (d.active.some((j) => j.status === 'downloading')) dlTimer = setTimeout(tick, 1500);
  };
  tick();
}
document.addEventListener('click', async (e) => {
  const c = e.target.closest('[data-cancel],[data-retry],[data-del]');
  if (!c) return;
  e.stopPropagation(); e.preventDefault();
  if (c.dataset.cancel) await api(`/api/downloads?id=${enc(c.dataset.cancel)}`, { method: 'DELETE' });
  if (c.dataset.retry) await api('/api/downloads', { method: 'POST', body: JSON.stringify({ path: c.dataset.retry }) });
  if (c.dataset.del && confirm(`Delete this download from your ${DEVICE}?`)) await api(`/api/downloads?name=${enc(c.dataset.del)}`, { method: 'DELETE' });
  if (state.view === 'downloads') showDownloads();
}, true);

/* ---------------- server page (StreamHub) ---------------- */
const fmtUptime = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)} h ${Math.floor((sec % 3600) / 60)} min` : `${Math.max(1, Math.floor(sec / 60))} min`);
async function showServer() {
  resetView('server');
  renderNav();
  $('crumbs').innerHTML = '';
  $('folderTitle').textContent = 'Server';
  $('folderSub').textContent = 'StreamHub runs a small server on this PC that reads your libraries and plays them.';
  $('backBtn').hidden = false;
  $('status').textContent = 'Checking your libraries…';
  let st;
  try { st = await api('/api/status'); } catch (e) { $('status').textContent = e.message; $('status').className = 'error'; return; }
  if (state.view !== 'server') return;
  $('status').textContent = '';
  const ok = st.libraries.filter((l) => l.ms !== null).length;
  const row = (k, v) => `<div class="sv-kv"><span>${esc(k)}</span><code>${esc(v)}</code></div>`;
  const lib = (l) => `<div class="sv-lib"><div><b>${esc(l.name)}</b><code>${esc(l.url)}</code></div>
    <span class="sv-ping ${l.ms === null ? 'bad' : l.ms > 300 ? 'slow' : 'ok'}"><i></i>${l.ms === null ? 'Can’t reach' : l.ms > 300 ? `Slow · ${l.ms} ms` : `${l.ms} ms`}</span></div>`;
  $('rows').innerHTML = `<div class="sv-grid">
    <section class="sv-card"><h3><i class="sv-dot"></i>Running<small>Up ${esc(fmtUptime(st.uptime))}</small></h3>
      <div class="sv-stats"><div><span>Libraries</span><b>${ok}/${st.libraries.length}</b></div><div><span>Sound fix</span><b>${st.ffmpeg ? 'On' : 'Off'}</b></div>
      <div><span>Downloads</span><b>${st.downloads ? 'On' : 'Off'}</b></div></div></section>
    <section class="sv-card"><h3>System</h3>
      ${row('Address', location.host)}${row('FFmpeg', st.ffmpeg ? `${st.ffmpeg} · ready` : 'not found')}${st.downloads ? row('Downloads', st.downloads) : ''}${st.version ? row('Version', st.version) : ''}</section>
    <section class="sv-card wide"><h3>Libraries<a class="sv-link" id="svManage">Manage</a></h3>
      ${st.libraries.length ? st.libraries.map(lib).join('') : '<p class="sv-empty">No libraries yet. Add a server in Settings.</p>'}</section>
  </div>`;
  $('svManage').onclick = openSettings;
}

/* ---------------- details sheet ---------------- */
let detailsItem = null, detailsFolder = null, detailsVersion = 0;
/** The file to play: the chosen version (720p, 1080p…) of the movie in the sheet. */
function detailsPlayable() {
  const v = detailsItem?.versions?.[detailsVersion];
  return v ? { ...detailsItem, path: v.path, name: v.name } : detailsItem;
}
function renderDetailsActions() {
  const item = detailsPlayable();
  const vs = detailsItem.versions || [];
  // Resume the version that was being watched, if it's another one.
  const p = progressOf(item.path);
  const resume = p && !p.done && p.pos > 30;
  $('dPlay').innerHTML = `${I.play}${resume ? `Resume from ${fmt(p.pos)}` : 'Play'}`;
  $('dRestart').hidden = !resume;
  $('dForget').hidden = !p;
  $('dForget').innerHTML = `${I.undo}${p?.done ? 'Mark as unwatched' : 'Remove from Continue watching'}`;
  $('dVersions').hidden = vs.length < 2;
  $('dVersions').innerHTML = vs.length < 2 ? '' : `<span>Quality</span>${vs.map((v, i) => `<button class="chip${i === detailsVersion ? ' on' : ''}" data-ver="${i}" title="${esc(v.name)}">${esc(v.quality)}${history_[v.path] && !history_[v.path].done ? ' ·<small>in progress</small>' : ''}</button>`).join('')}`;
  const listIt = detailsFolder || detailsItem;
  $('dList').innerHTML = inList(listIt.path) ? `${I.check}In My List` : `${I.plus}My List`;
  $('dList').classList.toggle('on', inList(listIt.path));
  $('dFile').textContent = item.name;
}
async function showDetails(item, { metaPath = item.path, folder = null } = {}) {
  detailsItem = item; detailsFolder = folder;
  // Start on the version last watched, else the best one.
  const vs = item.versions || [];
  detailsVersion = Math.max(0, vs.findIndex((v) => v.path === progressFor(item)?.path));
  const name = folder ? folder.name : stem(item.name);
  $('dTitle').textContent = niceName(name).title;
  $('dMeta').textContent = ''; $('dOverview').textContent = '';
  const [a, b] = PALETTES[hue(niceName(name).title) % PALETTES.length];
  $('dHero').style.backgroundImage = `radial-gradient(120% 140% at 10% 0%, ${a}, ${b} 70%)`;
  $('dPoster').innerHTML = coverHtml(name);
  renderDetailsActions();
  $('dFolder').hidden = !folder;
  $('dDownload').hidden = !state.config?.downloads || item.path.startsWith('local/');
  $('dDownload').innerHTML = `${I.download}Download`;
  $('details').hidden = false;
  $('dPlay').focus();
  const m = await meta(metaPath);
  if (!m || detailsItem !== item) return;
  $('dTitle').textContent = m.matched || m.title;
  $('dMeta').innerHTML = [m.year, m.rating && `<span class="star">★</span> ${m.rating}`, m.show && esc(m.show), esc(libraryName(item.path))].filter(Boolean).join('  ·  ');
  $('dOverview').textContent = m.overview || '';
  if (m.backdrop) $('dHero').style.backgroundImage = `url("${m.backdrop}")`;
  if (m.poster) {
    $('dPoster').innerHTML = `<img src="${esc(m.poster)}" alt="">`;
    if (!m.backdrop) $('dHero').style.backgroundImage = `linear-gradient(rgba(20,22,29,.35), rgba(20,22,29,.35)), url("${m.poster}")`;
  } else $('dPoster').querySelector('.ph b').textContent = m.matched || m.title;
}
const closeDetails = () => { $('details').hidden = true; detailsItem = null; };
$('details').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDetails(); });
$('dPlay').onclick = () => { const it = detailsPlayable(); closeDetails(); startPlayback(it); };
$('dRestart').onclick = () => { const it = detailsPlayable(); closeDetails(); startPlayback(it, { from: 0 }); };
$('dVersions').addEventListener('click', (e) => { const b = e.target.closest('[data-ver]'); if (b) { detailsVersion = Number(b.dataset.ver); renderDetailsActions(); } });
$('dList').onclick = () => { toggleList(detailsFolder || detailsItem); renderDetailsActions(); };
$('dForget').onclick = () => {
  forget(detailsPlayable().path);
  renderDetailsActions();
  if (state.view === 'home') refreshHomeRows(); else render();
};
$('dFolder').onclick = () => { const f = detailsFolder; closeDetails(); if (f) go(f.path); };
$('dDownload').onclick = async () => {
  const r = await downloadItem(detailsPlayable());
  if (r) { $('dDownload').innerHTML = `${I.check}Downloading — see Downloads`; }
};

/* ---------------- settings ---------------- */
const DHAKAFLIX = [
  'Movies | http://172.16.50.7/DHAKA-FLIX-7/',
  'Movies 1080p | http://172.16.50.14/DHAKA-FLIX-14/',
  'TV & Web Series | http://172.16.50.12/DHAKA-FLIX-12/',
  'Anime & Cartoons | http://172.16.50.10/DHAKA-FLIX-10/',
].join('\n');

async function openSettings() {
  const c = await api('/api/config');
  state.config = c;
  const f = $('settingsForm');
  f.servers.value = c.servers.join('\n'); f.username.value = c.username; f.password.value = ''; f.tmdbKey.value = c.tmdbKey || '';
  f.password.placeholder = c.hasPassword ? '•••••• (saved)' : '';
  f.opensubsKey.value = c.opensubsKey || ''; f.opensubsUser.value = c.opensubsUser || ''; f.opensubsPass.value = ''; f.subdlKey.value = c.subdlKey || '';
  f.opensubsPass.placeholder = c.hasOpensubsPass ? '•••••• (saved)' : 'optional';
  markTheme();
  $('ffmpegNote').innerHTML = c.ffmpeg
    ? '✓ Sound &amp; format fix is on — every file plays with sound, and you can switch audio tracks and built-in subtitles.'
    : `⚠ ffmpeg was not found, so some files may play without sound and audio-track switching is off. Install it with ${INSTALL_FFMPEG} (the Mac and Windows apps include it).`;
  if (!$('settings').open) $('settings').showModal();
}
async function saveConfig(body) {
  await api('/api/config', { method: 'POST', body: JSON.stringify(body) });
  metaCache.clear(); folderCache.clear();
  state.servers = []; state.roots = [];
  if (location.hash.replace(/^#\/?/, '')) location.hash = '#/'; else route();
}
function markTheme() {
  document.querySelectorAll('[data-theme-pick]').forEach((b) => b.classList.toggle('on', b.dataset.themePick === document.documentElement.dataset.theme));
  if (!SH) return;
  const m = prefs.shTheme || 'system';
  document.querySelectorAll('[data-sh-theme]').forEach((b) => b.classList.toggle('on', b.dataset.shTheme === m));
  $('shThemeName').textContent = m[0].toUpperCase() + m.slice(1);
  $('shTheme').querySelector('.sh-ico').innerHTML = { system: I.monitor, light: I.sun, dark: I.moon }[m];
}
// StreamHub: System (follows Windows) / Light / Dark. The page applies it before first paint too (index.html).
const lightQuery = matchMedia('(prefers-color-scheme: light)');
function applyShTheme() {
  const m = prefs.shTheme || 'system';
  document.documentElement.dataset.theme = (m === 'system' ? lightQuery.matches : m === 'light') ? 'sh-light' : 'sh-dark';
  markTheme();
}
function setShTheme(m) { prefs.shTheme = m; savePrefs(); applyShTheme(); }
document.querySelectorAll('[data-sh-theme]').forEach((b) => { b.onclick = () => setShTheme(b.dataset.shTheme); });
$('shTheme').onclick = () => setShTheme({ system: 'light', light: 'dark', dark: 'system' }[prefs.shTheme || 'system']);
lightQuery.addEventListener('change', () => { if (SH) applyShTheme(); });
document.querySelectorAll('[data-theme-pick]').forEach((b) => {
  b.onclick = () => { document.documentElement.dataset.theme = b.dataset.themePick; prefs.theme = b.dataset.themePick; savePrefs(); markTheme(); };
});
$('settingsBtn').onclick = openSettings;
$('cancelBtn').onclick = () => $('settings').close();
$('dhakaflixBtn').onclick = () => { $('settingsForm').servers.value = DHAKAFLIX; };
$('welcomeOwn').onclick = openSettings;
$('welcomeDhakaflix').onclick = () => saveConfig({ servers: DHAKAFLIX, keepPassword: true }).catch((e) => alert(e.message));
$('settingsForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const keepPw = !f.password.value && state.config?.hasPassword && f.username.value === state.config.username;
    await saveConfig({
      servers: f.servers.value, username: f.username.value, password: f.password.value, keepPassword: keepPw, tmdbKey: f.tmdbKey.value,
      opensubsKey: f.opensubsKey.value, opensubsUser: f.opensubsUser.value, opensubsPass: f.opensubsPass.value,
      keepOpensubsPass: !f.opensubsPass.value && state.config?.hasOpensubsPass && f.opensubsUser.value === state.config.opensubsUser, subdlKey: f.subdlKey.value,
    });
    $('settings').close();
  } catch (err) { alert(err.message); }
};

/* =====================================================================
   Player
   ===================================================================== */
const video = $('video');
const player = $('player');
const prefs = Object.assign({
  volume: 1, muted: false, subLang: '', audioLang: '', speed: 1,
  subSize: 1, subBg: 0, subFont: 'sans', subColor: '#ffffff', subEdge: 'shadow', subPos: 'low', subSearchLangs: ['en', 'bn'],
}, store.get('prefs', {}));
const savePrefs = () => store.set('prefs', prefs);
// Audio / subtitle sync are properties of a particular file, so they're remembered per video.
const syncs = store.get('sync', {});
const syncOf = (path) => syncs[path] || { a: 0, s: 0 };
function saveSync() {
  if (!S.item) return;
  if (S.adelay || S.subs.delay) syncs[S.item.path] = { a: S.adelay, s: S.subs.delay }; else delete syncs[S.item.path];
  store.set('sync', syncs);
}

const S = {
  item: null, list: [], probe: null, mode: 'direct', fmt: 'mkv', offset: 0, duration: 0, audio: 0, adelay: 0, adelayTimer: 0,
  subs: { id: 'off', label: 'Off', cues: [], delay: 0 }, subOptions: [], online: [], subTab: 'tracks', pendingSeek: null, seekTimer: 0, saveTick: 0,
};

['pClose:down', 'mExpand:expand', 'mClose:close', 'pPlay:play', 'pBack:rew', 'pFwd:fwd', 'pNext:next', 'pMute:vol', 'pPip:pip', 'pFull:full', 'pDownload:download'].forEach((p) => { const [id, ic] = p.split(':'); setIcon($(id), ic); });
$('pDownload').title = `Download to this ${DEVICE}`;
if (WIN) $('backBtn').title = 'Back (Ctrl+[)';

const now = () => (S.pendingSeek ?? (S.mode === 'remux' ? S.offset + video.currentTime : video.currentTime));
const duration = () => S.duration || (Number.isFinite(video.duration) ? video.duration : 0);

let toastTimer = 0;
function toast(msg, ms = 1400) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
function banner(html) { $('pBanner').innerHTML = html || ''; $('pBanner').hidden = !html; }

async function startPlayback(item, { from } = {}) {
  closeMenu();
  S.item = item;
  S.folder = []; S.list = [];
  S.probe = null; S.duration = 0; S.offset = 0; S.pendingSeek = null;
  const sync = syncOf(item.path);
  S.adelay = sync.a;
  S.subs = { id: 'off', label: 'Off', cues: [], delay: sync.s };
  S.online = [];
  $('pTitle').textContent = stem(item.name); $('pSub').textContent = '';
  banner(''); $('upNext').hidden = true;
  player.hidden = false; player.classList.remove('mini'); player.classList.add('loading');
  document.body.style.overflow = 'hidden';
  poke();
  meta(item.path).then((m) => {
    if (!m || S.item !== item) return;
    if (m.show && m.episode != null) $('pTitle').textContent = m.show;
    else if (m.matched || m.title) $('pTitle').textContent = m.matched || m.title;
    $('pSub').textContent = [m.show || m.matched, m.season != null && m.episode != null ? `S${m.season} · E${m.episode}` : m.year].filter(Boolean).join(' · ');
  });

  // The video's own folder gives its subtitle files and the next episode, wherever it was opened from.
  const [probe, folder] = await Promise.all([
    api(`/api/probe?path=${enc(item.path)}`).catch((e) => { banner(esc(e.message)); return null; }),
    listFolder(item.path.replace(/[^/]+$/, '')).then((l) => l.items, () => state.items),
  ]);
  if (S.item !== item) return;
  S.probe = probe; S.folder = folder; S.list = folder.filter((i) => i.kind === 'video');
  const pr = S.probe;
  S.duration = pr?.duration || 0;
  // Preferred audio language, else the track the file marks as default.
  const audio = pr?.audio || [];
  const byLang = prefs.audioLang && audio.find((a) => a.lang === prefs.audioLang);
  S.audio = (byLang || audio.find((a) => a.default) || audio[0] || { index: 0 }).index;
  S.mode = !pr?.ffmpeg || (pr.direct && S.audio === 0 && !S.adelay) ? 'direct' : 'remux';
  // Converted streams are Matroska (exact sync, true timestamps); MP4 only where Matroska can't play.
  S.fmt = video.canPlayType('video/webm') ? 'mkv' : 'mp4';
  if (pr && !pr.ffmpeg) banner(`Some files may play without sound. Install ffmpeg (${INSTALL_FFMPEG}) or use the MusingsofMaksudTV Mac or Windows app, which includes it.`);

  S.stereo = stereos[item.path] || detectStereo(item.name, pr?.video);
  layoutStereo();
  if (S.stereo !== 'off' && !stereos[item.path]) toast('3D movie: showing it in 2D', 2200);

  buildSubOptions();
  const h = progressOf(item.path);
  const start = from ?? (h && !h.done && h.pos > 30 ? h.pos : 0);
  await load(start);
  autoPickSubtitle();
  updateButtons();
}

/* ----- 3D movies: show one eye, so a side-by-side or top-and-bottom file plays as a normal 2D picture ----- */
// 3D releases pack both eyes into each frame. "Half" ones (HSBS, HOU) squeeze each eye into half of a 16:9 frame;
// "full" ones are twice as wide (3840×1080) or tall. Detected from the file name and frame shape; you can override it
// per video from the speed menu.
const stereos = store.get('stereo', {});
function detectStereo(name, v) {
  const n = String(name).replace(/[._]+/g, ' ');
  const is3d = /\b3D\b/i.test(n);
  if (/\b(?:H ?SBS|HSBS|Half ?SBS|F ?SBS|Full ?SBS|SBS|Side ?by ?Side)\b/i.test(n)) return 'sbs';
  if (is3d && /\b(?:H ?OU|HOU|H ?TAB|Half ?OU|F ?OU|Full ?OU|OU|TAB|Top ?(?:and|&)? ?Bottom|Over ?Under)\b/i.test(n)) return 'tab';
  if (v?.width && v?.height && v.width / v.height >= 3.2) return 'sbs';
  if (is3d) return 'sbs'; // most 3D releases are side by side
  return 'off';
}
const STEREO_NAMES = { off: 'Off: show the file as it is', sbs: 'Side by side → 2D', tab: 'Top and bottom → 2D' };
/** Sizes the video so only the left (or top) eye shows, at its true shape, centred in the player. */
function layoutStereo() {
  const st = video.style;
  const mode = S.stereo || 'off';
  const vw = video.videoWidth || S.probe?.video?.width, vh = video.videoHeight || S.probe?.video?.height;
  if (mode === 'off' || !vw || !vh) {
    for (const k of ['inset', 'left', 'top', 'width', 'height', 'objectFit', 'clipPath']) st[k] = '';
    return;
  }
  // A "full" file's eye is half the frame; a "half" file's eye was squeezed and is meant to be shown at the frame's shape.
  const eye = mode === 'sbs' ? (vw / vh >= 3.2 ? vw / 2 / vh : vw / vh) : (vh / vw >= 0.9 ? vw / (vh / 2) : vw / vh);
  const W = player.clientWidth, H = player.clientHeight;
  const dw = Math.min(W, H * eye), dh = dw / eye;
  Object.assign(st, {
    inset: 'auto', left: `${(W - dw) / 2}px`, top: `${(H - dh) / 2}px`, objectFit: 'fill',
    width: `${mode === 'sbs' ? dw * 2 : dw}px`, height: `${mode === 'tab' ? dh * 2 : dh}px`,
    clipPath: mode === 'sbs' ? 'inset(0 50% 0 0)' : 'inset(0 0 50% 0)',
  });
}
function setStereo(mode, { remember = true } = {}) {
  S.stereo = mode;
  if (remember) { stereos[S.item.path] = mode; store.set('stereo', stereos); }
  layoutStereo(); updateButtons();
}
new ResizeObserver(() => { if (S.stereo && S.stereo !== 'off') layoutStereo(); }).observe(player);
video.addEventListener('loadedmetadata', layoutStereo);

function sourceUrl(t) {
  return S.mode === 'direct' ? `/stream?path=${enc(S.item.path)}` : `/remux?path=${enc(S.item.path)}&t=${t}&audio=${S.audio}&adelay=${S.adelay}&fmt=${S.fmt}`;
}

async function load(t) {
  const item = S.item;
  player.classList.add('loading');
  video.playbackRate = prefs.speed;
  if (S.mode === 'direct') {
    const url = sourceUrl(0);
    if (!video.src.endsWith(url)) {
      video.src = url;
      await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
    }
    video.currentTime = t;
  } else if (S.fmt === 'mkv') {
    // Matroska streams carry the movie's own timestamps: the player clock is the true position.
    S.offset = 0;
    S.pendingSeek = t; // until the new stream starts playing
    video.src = sourceUrl(t);
    // Safety net: if the engine ever restarts its clock at 0 instead of the movie's time, re-base on `t`.
    if (t > 5) {
      video.addEventListener('playing', () => {
        if (S.item === item && video.currentTime < t - 5) { S.offset = t - video.currentTime; S.pendingSeek = null; }
      }, { once: true });
    }
    video.playbackRate = prefs.speed;
    video.play().catch(() => {});
    return;
  } else {
    let start = t;
    try { start = (await api(`/api/seek-point?path=${enc(item.path)}&t=${t}`)).start; } catch { /* use t */ }
    if (S.item !== item) return;
    // MP4 fallback: each track restarts at zero, so the clock is offset by where the stream began.
    S.offset = start;
    video.src = sourceUrl(start);
  }
  S.pendingSeek = null;
  video.playbackRate = prefs.speed;
  video.play().catch(() => {});
}

function seekTo(t, { immediate = false } = {}) {
  const d = duration();
  t = Math.max(0, d ? Math.min(t, d - 1) : t);
  if (S.mode === 'direct') { video.currentTime = t; return; }
  // Converted streams restart ffmpeg on every seek, so coalesce rapid key presses.
  S.pendingSeek = t;
  updateTime();
  clearTimeout(S.seekTimer);
  S.seekTimer = setTimeout(() => load(t), immediate ? 0 : 450);
}
const skip = (s) => { seekTo(now() + s); toast(`${s > 0 ? '+' : '−'}${Math.abs(s)} s`, 600); };

/** Stops playback and closes the player (the × on the mini player). */
function closePlayer() {
  if (S.item) saveProgress(S.item, now(), duration());
  closeMenu();
  S.item = null;
  clearTimeout(upNextTimer); $('upNext').hidden = true;
  video.pause(); video.removeAttribute('src'); video.load();
  player.hidden = true; player.classList.remove('mini'); document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen();
  $('subLayer').firstElementChild.textContent = '';
  refreshAfterPlayback();
}

/** Back / Esc: the video keeps playing in a small window in the corner while you browse. */
const playerFull = () => !player.hidden && !player.classList.contains('mini');
function minimizePlayer() {
  if (!S.item) return closePlayer();
  saveProgress(S.item, now(), duration());
  closeMenu();
  if (document.fullscreenElement) document.exitFullscreen();
  player.classList.add('mini'); player.classList.remove('idle');
  document.body.style.overflow = '';
  $('mTitle').textContent = $('pTitle').textContent;
  updateButtons();
  refreshAfterPlayback();
}
function expandPlayer() {
  player.classList.remove('mini');
  document.body.style.overflow = 'hidden';
  poke();
}

/** Progress bars and "Continue watching" reflect what was just watched. */
function refreshAfterPlayback() {
  if (state.view === 'home') refreshHomeRows(); else render();
}

function nextItem() {
  if (!S.item) return null;
  const i = S.list.findIndex((v) => v.path === S.item.path);
  return i >= 0 ? S.list[i + 1] || null : null;
}

/* ----- events ----- */
video.addEventListener('waiting', () => player.classList.add('loading'));
video.addEventListener('playing', () => { player.classList.remove('loading'); updateButtons(); });
// A Matroska stream has started once its clock is near the position it was asked for.
video.addEventListener('timeupdate', () => {
  if (S.pendingSeek != null && S.mode === 'remux' && S.fmt === 'mkv' && video.currentTime > 0 && Math.abs(S.offset + video.currentTime - S.pendingSeek) < 30) S.pendingSeek = null;
});
video.addEventListener('canplay', () => player.classList.remove('loading'));
video.addEventListener('pause', updateButtons);
video.addEventListener('play', updateButtons);
video.addEventListener('timeupdate', () => {
  updateTime();
  if (S.item && ++S.saveTick % 20 === 0) saveProgress(S.item, now(), duration());
  pumpEmbeddedSubs();
  // A direct stream that decodes no audio: the file's sound format isn't supported natively, convert it.
  if (S.mode === 'direct' && S.probe?.ffmpeg && S.probe.audio?.length && video.currentTime > 3 && video.webkitAudioDecodedByteCount === 0) {
    S.mode = 'remux'; toast('Fixing sound…'); load(video.currentTime);
  }
});
video.addEventListener('error', () => {
  if (!S.item || !video.getAttribute('src')) return;
  if (S.mode === 'direct' && S.probe?.ffmpeg) { S.mode = 'remux'; toast('Switching to compatibility mode…'); load(now()); return; }
  if (S.mode === 'remux' && S.fmt === 'mkv') { S.fmt = 'mp4'; load(S.pendingSeek ?? now()); return; } // e.g. HEVC the engine can't take in Matroska
  player.classList.remove('loading');
  banner('This file could not be played. ' + (S.probe?.ffmpeg ? 'The file may be damaged or the server stopped sending it.' : 'Install ffmpeg to play more formats.'));
});
video.addEventListener('ended', () => {
  if (!S.item) return;
  saveProgress(S.item, duration(), duration());
  const n = nextItem();
  if (n) showUpNext(n);
});

let upNextTimer = 0;
function showUpNext(n) {
  let left = 8;
  $('upNext').hidden = false;
  const tick = () => {
    $('upNextTitle').textContent = `${stem(n.name)} — starting in ${left}s`;
    if (left-- <= 0) { $('upNext').hidden = true; startPlayback(n, { from: 0 }); return; }
    upNextTimer = setTimeout(tick, 1000);
  };
  clearTimeout(upNextTimer); tick();
  $('upNextPlay').onclick = () => { clearTimeout(upNextTimer); $('upNext').hidden = true; startPlayback(n, { from: 0 }); };
  $('upNextCancel').onclick = () => { clearTimeout(upNextTimer); $('upNext').hidden = true; };
}

function updateButtons() {
  setIcon($('pPlay'), video.paused ? 'play' : 'pause');
  setIcon($('mPlay'), video.paused ? 'play' : 'pause');
  const listed = S.item && inList(playerListItem().path);
  setIcon($('pList'), listed ? 'check' : 'plus');
  $('pList').title = listed ? 'In My List' : 'Add to My List';
  $('pList').classList.toggle('on', !!listed);
  setIcon($('pMute'), video.muted || video.volume === 0 ? 'mute' : 'vol');
  setIcon($('pFull'), document.fullscreenElement ? 'unfull' : 'full');
  $('pNext').hidden = !nextItem();
  const a = S.probe?.audio || [];
  $('pAudio').hidden = !a.length;
  $('pAudio').innerHTML = `${I.audio}<span>${esc(a.find((x) => x.index === S.audio)?.label || 'Audio')}</span>`;
  $('pSubs').innerHTML = `${I.cc}<span>${esc(S.subs.id === 'off' ? 'Subtitles' : S.subs.label)}</span>`;
  $('pSubs').classList.toggle('on', S.subs.id !== 'off');
  $('pSpeed').innerHTML = `${I.speed}<span>${prefs.speed === 1 ? '1×' : prefs.speed + '×'}</span>`;
  $('pStereo').hidden = !S.stereo || S.stereo === 'off';
  $('pStereo').innerHTML = '<span>3D → 2D</span>';
  $('pPip').hidden = !document.pictureInPictureEnabled;
  $('pDownload').hidden = !state.config?.downloads || !S.item || S.item.path.startsWith('local/');
}

function updateTime() {
  const t = now(), d = duration();
  $('pTime').textContent = `${fmt(t)} / ${fmt(d)}`;
  const pct = d ? (t / d) * 100 : 0;
  $('seekPlayed').style.width = pct + '%';
  $('seekKnob').style.left = pct + '%';
  $('mBar').style.width = pct + '%';
  let buf = 0;
  if (video.buffered.length) buf = (S.mode === 'remux' ? S.offset : 0) + video.buffered.end(video.buffered.length - 1);
  $('seekBuf').style.width = d ? Math.min(100, (buf / d) * 100) + '%' : '0';
}

/* ----- seek bar ----- */
const seekEl = $('seek');
const seekFrac = (e) => { const r = seekEl.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
seekEl.addEventListener('mousemove', (e) => {
  const f = seekFrac(e);
  $('seekTip').style.left = f * 100 + '%';
  $('seekTip').textContent = fmt(f * duration());
});
seekEl.addEventListener('mousedown', (e) => {
  seekEl.classList.add('drag');
  const move = (ev) => { S.pendingSeek = seekFrac(ev) * duration(); updateTime(); };
  const up = (ev) => {
    seekEl.classList.remove('drag');
    window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
    S.pendingSeek = null; seekTo(seekFrac(ev) * duration(), { immediate: true });
  };
  move(e);
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
});

/* ----- buttons ----- */
const togglePlay = () => (video.paused ? video.play() : video.pause());
$('pPlay').onclick = togglePlay;
$('pBack').onclick = () => skip(-10);
$('pFwd').onclick = () => skip(10);
$('pNext').onclick = () => { const n = nextItem(); if (n) { saveProgress(S.item, now(), duration()); startPlayback(n, { from: 0 }); } };
$('pClose').onclick = minimizePlayer;
$('mExpand').onclick = expandPlayer;
$('mClose').onclick = closePlayer;
$('mPlay').onclick = () => togglePlay();
$('pList').onclick = () => {
  if (!S.item) return;
  const it = playerListItem();
  toast(toggleList(it) ? 'Added to My List' : 'Removed from My List', 1400);
  updateButtons();
};
/** What "My List" saves from the player: a series (the episode's folder), or the movie itself. */
function playerListItem() {
  const it = S.item;
  if (!EPISODE_RE.test(it.name) || it.path.startsWith('local/')) return known.get(it.path) || it;
  const dir = it.path.replace(/[^/]+$/, '');
  return known.get(dir) || { name: decodeURIComponent(dir.replace(/\/$/, '').split('/').pop()), path: dir, isDir: true, kind: 'dir' };
}
$('pMute').onclick = () => { video.muted = !video.muted; prefs.muted = video.muted; savePrefs(); updateButtons(); };
$('pVol').oninput = (e) => { video.volume = Number(e.target.value); video.muted = false; prefs.volume = video.volume; prefs.muted = false; savePrefs(); updateButtons(); };
video.volume = prefs.volume; video.muted = prefs.muted; $('pVol').value = prefs.volume;
$('pFull').onclick = toggleFull;
// Download the movie that's playing (Mac and Windows apps), showing progress on the button.
$('pDownload').onclick = async () => {
  const item = S.item;
  if (!item) return;
  const r = await downloadItem(item);
  if (!r) return;
  toast(`Downloading to your ${DEVICE} — find it in Downloads`, 2500);
  const btn = $('pDownload');
  const poll = async () => {
    if (S.item !== item) return;
    const d = await api('/api/downloads').catch(() => null);
    const j = d?.active.find((x) => x.id === item.path);
    if (j && j.status === 'downloading') {
      btn.innerHTML = `<span class="dl-ring">${j.total ? Math.floor((j.received / j.total) * 100) : 0}%</span>`;
      setTimeout(poll, 2000);
    } else if (j?.status === 'error') { btn.innerHTML = I.download; toast('Download failed — retry from Downloads', 3000); }
    else if (d?.done.some((f) => f.name === r.name)) { btn.innerHTML = I.check; toast('Downloaded ✓', 2000); }
  };
  poll();
};
$('pPip').onclick = () => (document.pictureInPictureElement ? document.exitPictureInPicture() : video.requestPictureInPicture()).catch(() => {});
function toggleFull() { document.fullscreenElement ? document.exitFullscreen() : player.requestFullscreen(); }
document.addEventListener('fullscreenchange', () => { player.classList.toggle('fs', !!document.fullscreenElement); updateButtons(); });
video.addEventListener('click', () => { if (player.classList.contains('mini')) return expandPlayer(); if (!$('menu').hidden) return closeMenu(); togglePlay(); });
video.addEventListener('dblclick', () => { if (!player.classList.contains('mini')) toggleFull(); });

/* ----- auto-hide controls ----- */
let idleTimer = 0;
function poke() {
  player.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!video.paused && $('menu').hidden && playerFull()) player.classList.add('idle'); }, 2600);
}
player.addEventListener('mousemove', poke);
player.addEventListener('mousedown', poke);

/* ----- menus ----- */
let menuFor = '';
function closeMenu() { $('menu').hidden = true; menuFor = ''; }
function openMenu(kind, html) {
  if (menuFor === kind) return closeMenu();
  menuFor = kind;
  $('menu').innerHTML = html;
  $('menu').hidden = false;
  poke();
}
const opt = (id, label, sub, on, disabled) =>
  `<button class="opt" data-id="${esc(id)}"${disabled ? ' aria-disabled="true"' : ''}><span class="tick">${on ? I.check : ''}</span><span class="lbl">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;

const codecName = (c) => ({ ac3: 'Dolby Digital', eac3: 'Dolby Digital+', dts: 'DTS', truehd: 'Dolby TrueHD', aac: 'AAC', mp3: 'MP3', opus: 'Opus', flac: 'FLAC', vorbis: 'Vorbis' }[c] || (c || '').toUpperCase());
const channelsName = (n) => (n >= 8 ? '7.1' : n >= 6 ? '5.1' : n === 2 ? 'Stereo' : n === 1 ? 'Mono' : n ? `${n} ch` : '');

const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} s`;
function audioMenuHtml() {
  const a = S.probe?.audio || [];
  return `<h4>Audio track</h4>${a.map((x) => opt(x.index, x.label, [codecName(x.codec), channelsName(x.channels)].filter(Boolean).join(' · '), x.index === S.audio)).join('')}
    <h4>Audio sync</h4>
    <div class="sync"><button data-act="a-0.5">−0.5</button><button data-act="a-0.1">−0.1</button><output>${signed(S.adelay)}</output><button data-act="a+0.1">+0.1</button><button data-act="a+0.5">+0.5</button></div>
    <p class="hint">Voices before lips move? Press <b>+</b>. After? Press <b>−</b>.${S.adelay ? ' <a data-act="a0">Reset</a>' : ''}</p>`;
}
$('pAudio').onclick = () => openMenu('audio', audioMenuHtml());

/** Audio sync: restart the converted stream with the sound shifted (debounced while clicking). */
function setAudioDelay(v) {
  if (!S.probe?.ffmpeg) return toast('Audio sync needs ffmpeg (built into the Mac and Windows apps)', 2500);
  S.adelay = Math.max(-20, Math.min(20, +v.toFixed(1)));
  saveSync();
  toast(`Audio ${signed(S.adelay)}`, 900);
  clearTimeout(S.adelayTimer);
  S.adelayTimer = setTimeout(() => { S.mode = 'remux'; load(now()); }, 600);
}

$('pSpeed').onclick = () => {
  openMenu('speed', `<h4>Playback speed</h4>${[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => opt(s, s === 1 ? 'Normal' : s + '×', '', prefs.speed === s)).join('')}
    <h4>3D movie</h4>${stereoOpts()}`);
};
const stereoOpts = () => Object.entries(STEREO_NAMES).map(([k, l]) => opt(`st:${k}`, l, k === 'off' ? '' : 'Shows one eye of a 3D file', (S.stereo || 'off') === k)).join('');
$('pStereo').onclick = () => openMenu('stereo', `<h4>3D movie</h4>${stereoOpts()}`);

$('pSubs').onclick = () => openMenu('subs', subsMenuHtml());

const SUB_FONTS = { sans: ['Clean', '"Plus Jakarta Sans", -apple-system, sans-serif'], serif: ['Classic', '"Fraunces", Georgia, serif'],
  rounded: ['Rounded', 'ui-rounded, "SF Pro Rounded", "Nunito", sans-serif'], fantasy: ['Epic', '"Cinzel", "Trajan Pro", serif'],
  bangla: ['বাংলা', '"Hind Siliguri", "Noto Sans Bengali", sans-serif'], mono: ['Typewriter', 'ui-monospace, "SF Mono", Menlo, monospace'] };
const SUB_COLORS = ['#ffffff', '#ffe066', '#7ef0ff', '#a8ff8a', '#ffb3d1', '#ffc58a'];
const SUB_EDGES = { shadow: 'Shadow', outline: 'Outline', glow: 'Glow', none: 'None' };
const SUB_BGS = [[0, 'None'], [0.4, 'Soft'], [0.8, 'Box']];
const SUB_POS = { low: ['Low', '7%'], mid: ['Middle', '14%'], high: ['High', '24%'] };
const chip = (act, label, on, style = '') => `<button class="chip${on ? ' on' : ''}" data-act="${act}"${style ? ` style="${style}"` : ''}>${label}</button>`;

function subsMenuHtml() {
  const tabs = `<div class="tabs">${[['tracks', 'Tracks'], ['style', 'Style'], ['sync', 'Sync']].map(([k, l]) => `<button class="${S.subTab === k ? 'on' : ''}" data-act="tab:${k}">${l}</button>`).join('')}</div>`;
  if (S.subTab === 'style') {
    return `${tabs}<div class="sub-preview" style="${subStyleCss()}"><span>The stars are bright tonight</span></div>
      <h4>Font</h4><div class="chips">${Object.entries(SUB_FONTS).map(([k, [l, f]]) => chip(`font:${k}`, l, prefs.subFont === k, `font-family:${f.replace(/"/g, "'")}`)).join('')}</div>
      <h4>Color</h4><div class="chips">${SUB_COLORS.map((c) => `<button class="swatch${prefs.subColor === c ? ' on' : ''}" data-act="color:${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>
      <h4>Edge</h4><div class="chips">${Object.entries(SUB_EDGES).map(([k, l]) => chip(`edge:${k}`, l, prefs.subEdge === k)).join('')}</div>
      <h4>Background</h4><div class="chips">${SUB_BGS.map(([v, l]) => chip(`bg:${v}`, l, prefs.subBg === v)).join('')}</div>
      <h4>Position</h4><div class="chips">${Object.entries(SUB_POS).map(([k, [l]]) => chip(`pos:${k}`, l, prefs.subPos === k)).join('')}</div>
      <div class="stepper"><span>Size</span><div><button data-act="size-">A−</button><output>${Math.round(prefs.subSize * 100)}%</output><button data-act="size+">A+</button></div></div>`;
  }
  if (S.subTab === 'sync') {
    return `${tabs}<h4>Subtitle sync</h4>
      <div class="sync"><button data-act="s-1">−1</button><button data-act="s-0.1">−0.1</button><output>${signed(S.subs.delay)}</output><button data-act="s+0.1">+0.1</button><button data-act="s+1">+1</button></div>
      <p class="hint">Words show up before they’re spoken? Press <b>+</b>. After? Press <b>−</b>. Keys: <b>[</b> <b>]</b> (hold Shift for 1 s).${S.subs.delay ? ' <a data-act="s0">Reset</a>' : ''}</p>
      <p class="hint">Saved for this video.</p>`;
  }
  const ext = S.subOptions.filter((o) => o.type === 'file');
  const emb = S.subOptions.filter((o) => o.type === 'embedded');
  return `${tabs}${opt('off', 'Off', '', S.subs.id === 'off')}
    ${ext.length ? `<h4>From the server</h4>${ext.map((o) => opt(o.id, o.label, o.sub, S.subs.id === o.id)).join('')}` : ''}
    ${emb.length ? `<h4>Built into the file</h4>${emb.map((o) => opt(o.id, o.label, o.text ? o.sub : 'Image subtitles — can’t be shown', S.subs.id === o.id, !o.text)).join('')}` : ''}
    ${S.online.length ? `<h4>Found online</h4>${S.online.map((o) => opt(o.id, o.label, o.sub, S.subs.id === o.id)).join('')}` : ''}
    <h4>More</h4>${opt('search', 'Search online…', 'OpenSubtitles and SubDL, like VLC', false)}${opt('load', 'Load a subtitle file…', `.srt or .vtt from your ${DEVICE}`, false)}`;
}

/* ----- online subtitle search (OpenSubtitles, SubDL) ----- */
$('menu').addEventListener('submit', (e) => {
  if (!e.target.matches('[data-ss]')) return;
  e.preventDefault();
  subFind.q = e.target.q.value.trim();
  runSubSearch();
});
const SEARCH_LANGS = [['en', 'English'], ['bn', 'বাংলা'], ['hi', 'हिन्दी'], ['ar', 'العربية'], ['es', 'Español'], ['fr', 'Français']];
let subFind = { q: '', busy: false, results: [], errors: [], needsKey: false, query: '' };
function subSearchHtml() {
  const langs = prefs.subSearchLangs;
  const f = subFind;
  const body = f.needsKey
    ? `<p class="hint">Add a free API key from OpenSubtitles.com or SubDL in <a data-act="sskeys">Settings</a> to search for subtitles online.</p>`
    : f.busy ? '<p class="hint">Searching…</p>'
    : `${f.errors.map((e) => `<p class="hint">⚠ ${esc(e)}</p>`).join('')}${f.results.length
      ? f.results.map((r, i) => opt(`r:${i}`, r.name || 'Subtitle', [langName(r.lang) || r.lang, r.provider, r.hashMatch ? 'Exact match for this file' : '', r.downloads ? `${r.downloads.toLocaleString()} downloads` : '', r.hi ? 'Hearing impaired' : '', r.machine ? 'Machine translated' : ''].filter(Boolean).join(' · '), false)).join('')
      : f.query ? '<p class="hint">Nothing found. Try another name or language.</p>' : ''}`;
  return `<h4>Search subtitles online</h4>
    <form class="ss-form" data-ss><input name="q" placeholder="${esc(f.query || 'Movie or series name')}" value="${esc(f.q)}" autocomplete="off" spellcheck="false"><button class="ss-go" type="submit">Search</button></form>
    <div class="chips">${SEARCH_LANGS.map(([c, l]) => chip(`sslang:${c}`, l, langs.includes(c))).join('')}</div>
    ${body}`;
}
async function runSubSearch() {
  const item = S.item;
  subFind = { ...subFind, busy: true, results: [], errors: [] };
  if (menuFor === 'subsearch') $('menu').innerHTML = subSearchHtml();
  try {
    const r = await api(`/api/subsearch?path=${enc(item.path)}&langs=${prefs.subSearchLangs.join(',')}&q=${enc(subFind.q)}`);
    if (S.item !== item) return;
    subFind = { ...subFind, busy: false, results: r.results, errors: r.errors, needsKey: r.needsKey, query: r.query || '' };
  } catch (e) {
    subFind = { ...subFind, busy: false, errors: [e.message] };
  }
  if (menuFor === 'subsearch') $('menu').innerHTML = subSearchHtml();
}
function openSubSearch() {
  subFind = { q: '', busy: false, results: [], errors: [], needsKey: false, query: '' };
  openMenu('subsearch', subSearchHtml());
  runSubSearch();
}
async function useOnlineSub(r) {
  const item = S.item;
  closeMenu();
  toast('Downloading subtitles…', 8000);
  try {
    const ep = S.item && meta(S.item.path);
    const m = ep ? await ep : null;
    const res = await fetch(`/api/subget?id=${enc(r.id)}${m?.episode != null ? `&ep=${m.episode}` : ''}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Download failed');
    const cues = parseCues(await res.text());
    if (S.item !== item) return;
    const id = 'o:' + r.id;
    if (!S.online.some((o) => o.id === id)) S.online.push({ id, label: `${langName(r.lang) || r.lang} — ${r.provider}`, sub: r.name, cues });
    S.subs = { ...S.subs, id, label: langName(r.lang) || 'Online', cues, type: 'file' };
    prefs.subLang = r.lang; savePrefs();
    toast(cues.length ? 'Subtitles loaded' : 'That file had no subtitles in it', 1800);
  } catch (e) { toast(e.message, 3000); }
  updateButtons();
}

$('menu').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act) {
    const [k, v] = act.includes(':') ? [act.slice(0, act.indexOf(':')), act.slice(act.indexOf(':') + 1)] : [act, ''];
    if (/^a[+-]/.test(act)) setAudioDelay(S.adelay + Number(act.slice(1)));
    else if (act === 'a0') setAudioDelay(0);
    else if (/^s[+-]/.test(act)) setSubDelay(S.subs.delay + Number(act.slice(1)));
    else if (act === 's0') setSubDelay(0);
    else if (k === 'tab') S.subTab = v;
    else if (k === 'sslang') {
      const l = prefs.subSearchLangs;
      prefs.subSearchLangs = l.includes(v) ? (l.length > 1 ? l.filter((x) => x !== v) : l) : [...l, v];
      savePrefs(); runSubSearch(); return;
    } else if (act === 'sskeys') { closeMenu(); minimizePlayer(); openSettings(); return; }
    else {
      if (act === 'size-') prefs.subSize = Math.max(0.6, +(prefs.subSize - 0.1).toFixed(1));
      if (act === 'size+') prefs.subSize = Math.min(2.2, +(prefs.subSize + 0.1).toFixed(1));
      if (k === 'font') prefs.subFont = v;
      if (k === 'color') prefs.subColor = v;
      if (k === 'edge') prefs.subEdge = v;
      if (k === 'bg') prefs.subBg = Number(v);
      if (k === 'pos') prefs.subPos = v;
      savePrefs(); applySubStyle();
    }
    $('menu').innerHTML = menuFor === 'audio' ? audioMenuHtml() : subsMenuHtml();
    return;
  }
  const o = e.target.closest('.opt');
  if (!o || o.getAttribute('aria-disabled') === 'true') return;
  const id = o.dataset.id;
  if (menuFor === 'audio') {
    const idx = Number(id);
    closeMenu();
    if (idx === S.audio) return;
    if (!S.probe?.ffmpeg) return toast('Install ffmpeg to switch audio tracks', 2500);
    S.audio = idx;
    prefs.audioLang = S.probe.audio.find((a) => a.index === idx)?.lang || ''; savePrefs();
    S.mode = 'remux';
    toast('Switching audio…');
    load(now());
    updateButtons();
  } else if (id.startsWith('st:')) {
    setStereo(id.slice(3)); closeMenu();
  } else if (menuFor === 'speed') {
    prefs.speed = Number(id); savePrefs(); video.playbackRate = prefs.speed; closeMenu(); updateButtons();
  } else if (menuFor === 'subsearch') {
    const r = subFind.results[Number(id.slice(2))];
    if (r) useOnlineSub(r);
  } else if (menuFor === 'subs') {
    if (id === 'search') return openSubSearch();
    closeMenu();
    if (id === 'load') return $('subFile').click();
    const on = S.online.find((o) => o.id === id);
    if (on) { S.subs = { ...S.subs, id, label: on.label, cues: on.cues, type: 'file' }; return updateButtons(); }
    selectSubtitle(id);
  }
});
document.addEventListener('mousedown', (e) => {
  if (!$('menu').hidden && !e.target.closest('#menu') && !e.target.closest('.pill-btn')) closeMenu();
});

/* ----- subtitles ----- */
function subStyleCss() {
  const edge = { shadow: '0 0 4px #000, 0 2px 6px rgba(0,0,0,.9)', outline: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 2px 4px #000',
    glow: `0 0 8px ${prefs.subColor}88, 0 0 2px #000, 0 2px 6px #000`, none: 'none' }[prefs.subEdge] || 'none';
  return `--sub:${prefs.subSize};--subbg:${prefs.subBg};--sub-color:${prefs.subColor};--sub-font:${(SUB_FONTS[prefs.subFont] || SUB_FONTS.sans)[1].replace(/"/g, "'")};--sub-shadow:${edge};--sub-bottom:${(SUB_POS[prefs.subPos] || SUB_POS.low)[1]}`;
}
function applySubStyle() { $('subLayer').setAttribute('style', subStyleCss()); }
function setSubDelay(v) {
  S.subs.delay = Math.max(-60, Math.min(60, +v.toFixed(1)));
  saveSync();
  toast(`Subtitles ${signed(S.subs.delay)}`, 900);
}
applySubStyle();

const langName = (code) => {
  if (!code) return '';
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code.length === 3 ? ({ eng: 'en', hin: 'hi', ben: 'bn', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', ara: 'ar', rus: 'ru', por: 'pt', ita: 'it', tam: 'ta', tel: 'te', urd: 'ur', ind: 'id', tur: 'tr' }[code] || code) : code); } catch { return code; }
};

function buildSubOptions() {
  const st = stem(S.item.name).toLowerCase();
  const files = S.folder.filter((i) => i.kind === 'sub')
    .map((s) => ({ s, match: stem(s.name).toLowerCase().startsWith(st) }))
    .sort((a, b) => Number(b.match) - Number(a.match));
  S.subOptions = [
    ...files.map(({ s, match }) => ({ id: 'f:' + s.path, type: 'file', path: s.path, label: guessSubLabel(s.name, st), sub: s.name, match })),
    ...(S.probe?.subs || []).map((x) => ({
      id: 'e:' + x.index, type: 'embedded', index: x.index, text: x.text, lang: x.lang,
      label: (x.lang ? langName(x.lang) : '') + (x.label && x.label !== x.lang.toUpperCase() ? ` — ${x.label.replace(/ · [A-Z]{2,3}$/, '')}` : '') || x.label,
      sub: x.forced ? 'Forced' : 'Built into the video',
    })),
  ];
}
function guessSubLabel(name, movieStem) {
  const rest = stem(name).slice(stem(name).toLowerCase().startsWith(movieStem) ? movieStem.length : 0).replace(/^[\s._-]+/, '');
  return rest ? langName(rest.split(/[\s._-]/)[0].toLowerCase()) || rest : 'Subtitle file';
}

function autoPickSubtitle() {
  // Remembered language first, then a file named like the movie.
  const want = prefs.subLang;
  let pick = null;
  if (want === 'off') return;
  if (want) pick = S.subOptions.find((o) => o.type === 'file' && o.match && o.label.toLowerCase().includes(langName(want).toLowerCase()))
    || S.subOptions.find((o) => o.type === 'embedded' && o.text && o.lang === want);
  pick ||= S.subOptions.find((o) => o.type === 'file' && o.match);
  if (pick) selectSubtitle(pick.id, { remember: false });
}

async function selectSubtitle(id, { remember = true } = {}) {
  const item = S.item;
  if (id === 'off') {
    S.subs = { ...S.subs, id: 'off', label: 'Off', cues: [], type: 'off' };
    if (remember) { prefs.subLang = 'off'; savePrefs(); }
    updateButtons(); return;
  }
  const o = S.subOptions.find((x) => x.id === id);
  if (!o) return;
  try {
    let text;
    if (o.type === 'embedded') {
      // Read in chunks around the playhead instead of the whole movie: shows up within seconds.
      S.subs = { ...S.subs, id, label: o.label, cues: [], type: 'embedded', index: o.index, ranges: [], loading: false, fails: 0 };
      if (remember) { prefs.subLang = o.lang || langCodeFromLabel(o.label); savePrefs(); }
      updateButtons();
      toast('Loading subtitles…', 4000);
      await pumpEmbeddedSubs();
      if (S.subs.id === id) $('toast').hidden = true;
      return;
    }
    text = await (await fetch(`/subs?path=${enc(o.path)}`)).text();
    if (S.item !== item) return;
    S.subs = { ...S.subs, id, label: o.label, cues: parseCues(text), type: 'file' };
    if (!S.subs.cues.length) toast('This subtitle file is empty', 2000);
    if (remember) { prefs.subLang = o.lang || langCodeFromLabel(o.label); savePrefs(); }
  } catch {
    toast('Could not load these subtitles', 2500);
  }
  updateButtons();
}
/** Keeps embedded subtitles loaded a little ahead of the playhead, a chunk at a time. */
async function pumpEmbeddedSubs() {
  const sb = S.subs;
  if (sb.type !== 'embedded' || sb.loading || sb.fails > 3 || !S.item) return;
  const t = Math.max(0, now() - sb.delay), d = duration();
  const r = sb.ranges.find(([a, b]) => t >= a - 1 && t < b);
  let from = null;
  if (!r) from = Math.max(0, t - 3);
  else if (r[1] - t < 90 && (!d || r[1] < d)) from = r[1];
  if (from == null) return;
  const dur = sb.ranges.length ? 300 : 120;
  sb.loading = true;
  try {
    const res = await fetch(`/api/embedded-sub?path=${enc(S.item.path)}&index=${sb.index}&from=${from.toFixed(2)}&dur=${dur}`);
    if (!res.ok) throw new Error();
    const cues = parseCues(await res.text());
    if (S.subs !== sb) return;
    const seen = new Set(sb.cues.map((c) => c.start + '|' + c.html));
    sb.cues = sb.cues.concat(cues.filter((c) => !seen.has(c.start + '|' + c.html))).sort((x, y) => x.start - y.start);
    sb.ranges.push([from, from + dur]);
  } catch {
    sb.fails++;
  } finally {
    sb.loading = false;
  }
}
const langCodeFromLabel = (l) => (/english/i.test(l) ? 'eng' : /bengali|bangla/i.test(l) ? 'ben' : /hindi/i.test(l) ? 'hin' : '');

$('subFile').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const cues = parseCues(await f.text());
  S.subs = { ...S.subs, id: 'local', label: f.name.replace(/\.[^.]+$/, ''), cues, type: 'file' };
  toast(cues.length ? 'Subtitles loaded' : 'No subtitles found in that file', 1600);
  e.target.value = '';
  updateButtons();
};

function parseTime(s) {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/.exec(s);
  return m ? (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000) : NaN;
}
function cleanCue(t) {
  return esc(t.replace(/\{\\[^}]*\}/g, '').replace(/\\N/g, '\n'))
    .replace(/&lt;(\/?)([ibu])&gt;/gi, '<$1$2>')
    .replace(/&lt;\/?(font|c|v|ruby|rt|lang)[^&]*&gt;/gi, '');
}
function parseCues(text) {
  const cues = [];
  for (const block of text.replace(/^﻿/, '').replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const start = parseTime(a), end = parseTime(b);
    const body = lines.slice(i + 1).join('\n').trim();
    if (!Number.isNaN(start) && !Number.isNaN(end) && body) cues.push({ start, end, html: cleanCue(body) });
  }
  return cues.sort((x, y) => x.start - y.start);
}

let lastSub = '';
function subLoop() {
  if (!player.hidden) {
    const t = now() - S.subs.delay;
    let html = '';
    if (S.subs.cues.length) html = S.subs.cues.filter((c) => c.start <= t && t < c.end).map((c) => c.html).join('\n');
    if (html !== lastSub) { $('subLayer').firstElementChild.innerHTML = html; lastSub = html; }
  }
  requestAnimationFrame(subLoop);
}
requestAnimationFrame(subLoop);

/* ----- keyboard ----- */
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea') && e.target.id !== 'pVol') {
    if (e.key === 'Escape' && e.target.id === 'filter') { e.target.value = ''; render(); e.target.blur(); }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'k') && !playerFull()) { e.preventDefault(); $('filter').focus(); return; }
  if (e.key === '/' && !playerFull() && $('details').hidden) { e.preventDefault(); $('filter').focus(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key === '[') { e.preventDefault(); if (playerFull()) minimizePlayer(); else history.back(); return; }
  if (!playerFull()) {
    if (e.key === 'Escape' && !$('details').hidden) closeDetails();
    else if (e.key === 'Backspace' && $('details').hidden && location.hash.length > 2) history.back();
    return;
  }
  poke();
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'k') { e.preventDefault(); togglePlay(); }
  else if (k === 'arrowright' || k === 'l') { e.preventDefault(); skip(e.shiftKey ? 30 : 10); }
  else if (k === 'arrowleft' || k === 'j') { e.preventDefault(); skip(e.shiftKey ? -30 : -10); }
  else if (k === 'arrowup') { e.preventDefault(); video.volume = Math.min(1, video.volume + 0.05); video.muted = false; prefs.volume = video.volume; savePrefs(); $('pVol').value = video.volume; toast(`Volume ${Math.round(video.volume * 100)}%`, 700); updateButtons(); }
  else if (k === 'arrowdown') { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.05); prefs.volume = video.volume; savePrefs(); $('pVol').value = video.volume; toast(`Volume ${Math.round(video.volume * 100)}%`, 700); updateButtons(); }
  else if (k === 'm') $('pMute').click();
  else if (k === 'f') toggleFull();
  else if (k === 'n') $('pNext').click();
  else if (k === 'c') { const on = S.subs.id !== 'off'; if (on) selectSubtitle('off'); else { const o = S.subOptions.find((x) => x.type === 'file' || x.text); if (o) selectSubtitle(o.id); else toast('No subtitles for this video', 1500); } }
  else if (k === 'a') { const a = S.probe?.audio || []; if (a.length > 1) $('pAudio').click(); }
  else if (k === '[' || k === ']' || k === '{' || k === '}') setSubDelay(S.subs.delay + ((k === ']' || k === '}') ? 1 : -1) * (e.shiftKey ? 1 : 0.1));
  else if (k === 'escape') { if (!$('menu').hidden) closeMenu(); else if (!document.fullscreenElement) minimizePlayer(); }
  else if (/^[0-9]$/.test(k) && duration()) seekTo(duration() * Number(k) / 10, { immediate: true });
});

/* ----- test hook (read-only): lets automated A/V sync tests read the player's clock ----- */
window.__mh = { now: () => now(), state: () => ({ mode: S.mode, offset: S.offset, adelay: S.adelay, sdelay: S.subs.delay, src: video.src, mini: player.classList.contains('mini'), playing: !video.paused }) };

/* ----- boot ----- */
if (!location.hash) history.replaceState(null, '', '#/');
api('/api/config').then((c) => { state.config = c; renderNav(); }).catch(() => {});
if (SH) {
  applyShTheme();
  $('shAddr').textContent = location.host;
  $('filter').placeholder = 'Search';
  document.querySelector('#hero .eyebrow').textContent = 'Featured';
  document.querySelector('#welcome .eyebrow').textContent = 'Welcome';
  document.querySelector('#welcome h1').innerHTML = 'Stream<span>Hub</span>';
  document.querySelector('#welcome p').textContent = 'Every movie, series and anime on your ISP’s BDIX servers, ready to play on this PC.';
}
route();
window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 30), { passive: true });
