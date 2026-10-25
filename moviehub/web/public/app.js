// MusingsofMaksudTV UI: library browser with posters, details sheet, and a player with audio/subtitle menus.
const $ = (id) => document.getElementById(id);
if (navigator.userAgent.includes('Electron')) document.documentElement.classList.add('electron');

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
  pip: P('<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="11" width="8" height="6" rx="1"/>'),
  full: P('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  unfull: P('<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>'),
  close: P('<path d="M18 6L6 18M6 6l12 12"/>'),
  check: P('<path d="M20 6L9 17l-5-5"/>'),
  file: P('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
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
    card.title = card.querySelector('.t').textContent;
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
const state = { view: '', path: '', items: [], servers: [], roots: [], config: null };

const folderCache = new Map();
function listFolder(path, { refresh = false } = {}) {
  if (refresh) folderCache.delete(path);
  if (!folderCache.has(path)) {
    const job = api(`/api/browse?path=${enc(path)}${refresh ? '&refresh=1' : ''}`);
    job.then((d) => { state.servers = d.servers || state.servers; state.roots = d.roots || state.roots; }, () => folderCache.delete(path));
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

const libraryOf = (path) => Number(path.split('/')[0]);
const libraryName = (path) => state.servers[libraryOf(path)] || 'Library';

function cardHtml(it, { wideArt = false, sub = '' } = {}) {
  const isDir = it.isDir;
  const name = isDir ? it.name : stem(it.name);
  const prog = !isDir && progressOf(it.path);
  const pct = prog && !prog.done && prog.dur ? Math.min(100, (prog.pos / prog.dur) * 100) : 0;
  return `<button class="card${wideArt ? ' wide-art' : ''}" data-path="${esc(it.path)}"${sub ? ' data-keep-sub="1"' : ''}>
    <div class="poster">
      <div class="ph" style="--h:${hue(name)}"><span class="ph-ico">${isDir && !isTitleFolder(name) ? I.folder : I.film}</span><b>${esc(name)}</b></div>
      <img alt="" loading="lazy">
      ${prog?.done ? `<span class="badge done">${I.check}Watched</span>` : ''}
      ${pct ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ''}
      <div class="hover-play"><span>${I.play}</span></div>
    </div>
    <div class="cap"><div class="t">${esc(name)}</div><div class="s">${esc(sub)}</div></div>
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

function rowShell({ title, sub = '', path = '' }) {
  return `<section class="row" data-row="${esc(path)}">
    <div class="row-head">${path ? `<a class="row-title" data-go="${esc(path)}">${esc(title)}<span class="see-all">See all ›</span></a>` : `<h2 class="row-title">${esc(title)}</h2>`}${sub ? `<small>${esc(sub)}</small>` : ''}</div>
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
    pickHero(items);
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

/* ----- hero ----- */
let heroItem = null, heroPending = false;
async function pickHero(items) {
  if (heroItem || heroPending || state.view !== 'home') return;
  heroPending = true;
  try {
    for (const it of items.slice(0, 12)) {
      const m = await meta(it.path);
      if (state.view !== 'home') return;
      if (m?.backdrop || m?.poster) { showHero(it, m); return; }
    }
  } finally { heroPending = false; }
}
function showHero(it, m) {
  heroItem = it;
  $('heroTitle').textContent = m.matched || m.title || it.name;
  $('heroMeta').innerHTML = [m.year, m.rating && `<span class="star">★</span> ${m.rating}`, esc(libraryName(it.path))].filter(Boolean).join('  ·  ');
  $('heroOverview').textContent = m.overview || '';
  $('heroArt').style.backgroundImage = `url("${m.backdrop || m.poster}")`;
  $('heroArt').classList.toggle('soft', !m.backdrop);
  $('heroPlay').innerHTML = `${I.play}Play`;
  $('hero').hidden = false;
  document.body.classList.add('has-hero');
}
function hideHero() { heroItem = null; $('hero').hidden = true; document.body.classList.remove('has-hero'); }
$('heroPlay').onclick = () => heroItem && activate(heroItem, { play: true });
$('heroInfo').onclick = () => heroItem && activate(heroItem);

/* ----- views ----- */
function resetView(view) {
  state.view = view;
  $('rows').innerHTML = ''; $('grid').innerHTML = ''; $('grid').className = '';
  $('status').textContent = ''; $('status').className = '';
  $('folderHead').hidden = view === 'home';
  $('welcome').hidden = true;
  if (view !== 'search') $('filter').value = ''; // a search left in the box must not hide a folder's contents
  if (view !== 'home') hideHero();
  window.scrollTo({ top: 0 });
}

function continueRowHtml() {
  const list = Object.values(history_).filter((h) => !h.done && h.pos > 30).sort((a, b) => b.at - a.at).slice(0, 15);
  if (!list.length) return '';
  return `<section class="row continue"><div class="row-head"><h2 class="row-title">Continue watching</h2></div>
    <div class="row-wrap"><div class="row-scroll wide">${list.map((h) => cardHtml({ name: h.name, path: h.path, isDir: false, kind: 'video' }, { wideArt: true, sub: `${fmt(h.dur - h.pos)} left` })).join('')}</div></div></section>`;
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
  const roots = state.roots.length ? state.roots : [libs.path];
  const listings = await Promise.all(roots.map((r) => listFolder(r).catch(() => null)));
  if (state.view !== 'home') return;
  $('status').textContent = '';
  let html = continueRowHtml();
  listings.forEach((l, i) => {
    if (!l) { html += `<p class="status error">Can’t reach “${esc(state.servers[i] || 'library')}” right now.</p>`; return; }
    if (isCategoryFolder(l.items)) {
      for (const d of sortCategories(l.items.filter((x) => x.isDir))) html += rowShell({ title: d.name, sub: roots.length > 1 ? state.servers[i] : '', path: d.path });
    } else {
      html += rowShell({ title: state.servers[i] || 'Library', path: l.path });
    }
  });
  $('rows').innerHTML = html;
  $('rows').querySelectorAll('.row[data-row]').forEach((r) => rowObserver.observe(r));
  $('rows').querySelectorAll('.continue .card').forEach((c2) => lazy.observe(c2));
  pickHero([...Object.values(history_)].filter((h) => !h.done && h.pos > 30).map((h) => ({ name: h.name, path: h.path, isDir: false, kind: 'video' })));
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
      const p = progressOf(v.path);
      const pct = p && !p.done && p.dur ? (p.pos / p.dur) * 100 : 0;
      return `<button class="ep" data-path="${esc(v.path)}"><span class="num">${epNumber(v.name, i)}</span>
        <span><div class="t">${esc(epTitle(v.name, i))}</div><div class="s">${p?.done ? 'Watched' : pct ? `${fmt(p.dur - p.pos)} left` : esc(stem(v.name))}</div></span>
        <span>${p?.done ? `<span class="check">${I.check}</span>` : pct ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</span></button>`;
    }).join('');
  } else {
    grid.innerHTML = visible.map((it) => cardHtml(it, { sub: sub ? sub(it) : '' })).join('');
    grid.querySelectorAll('.card').forEach((c) => lazy.observe(c));
  }
  if (state.view === 'folder') $('status').textContent = !visible.length ? (q ? 'Nothing here matches your search.' : 'This folder is empty.') : '';
}
const render = () => { if (state.view === 'folder' || state.view === 'search') renderGrid(gridItems, { sub: gridSub }); };

function renderNav() {
  const roots = state.roots;
  const cur = state.view === 'home' ? -1 : state.view === 'folder' ? libraryOf(state.path) : -2;
  $('nav').innerHTML = `<a href="#/" class="${cur === -1 ? 'on' : ''}">Home</a>` +
    state.servers.map((name, i) => `<a data-go="${esc(roots[i] || `${i}/`)}" class="${cur === i ? 'on' : ''}">${esc(name)}</a>`).join('');
}

function renderHead() {
  const idx = libraryOf(state.path);
  const root = state.roots[idx] || `${idx}/`;
  const crumbs = [['Home', null], [state.servers[idx] || 'Library', root]];
  if (state.path.startsWith(root)) {
    let acc = root;
    for (const seg of state.path.slice(root.length).split('/').filter(Boolean)) { acc += seg + '/'; crumbs.push([decodeURIComponent(seg), acc]); }
  }
  $('crumbs').innerHTML = crumbs.slice(0, -1).map(([l, p]) => (p ? `<a data-go="${esc(p)}">${esc(l)}</a>` : `<a href="#/">${esc(l)}</a>`)).join('<span>›</span>');
  $('folderTitle').textContent = crumbs[crumbs.length - 1][0];
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
  const h = history_[path];
  if (h) return { name: h.name, path, isDir: false, kind: 'video' };
  const name = decodeURIComponent(path.replace(/\/$/, '').split('/').pop());
  return { name, path, isDir: path.endsWith('/'), kind: path.endsWith('/') ? 'dir' : 'video' };
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('.card[data-path], .ep[data-path]');
  if (!el || el.closest('#player')) return;
  const item = findItem(el.dataset.path);
  if (el.classList.contains('ep') || el.closest('.continue')) return startPlayback(item);
  activate(item);
});

/* ---------------- details sheet ---------------- */
let detailsItem = null, detailsFolder = null;
async function showDetails(item, { metaPath = item.path, folder = null } = {}) {
  detailsItem = item; detailsFolder = folder;
  const p = progressOf(item.path);
  const name = folder ? folder.name : stem(item.name);
  $('dTitle').textContent = name;
  $('dMeta').textContent = ''; $('dOverview').textContent = ''; $('dFile').textContent = item.name;
  const h0 = hue(name);
  $('dHero').style.backgroundImage = `radial-gradient(120% 140% at 10% 0%, hsl(${h0} 50% 30%), hsl(${h0 + 40} 40% 12%) 70%)`;
  $('dPoster').innerHTML = `<div class="ph" style="--h:${h0}"><span class="ph-ico">${I.film}</span><b>${esc(name)}</b></div>`;
  const resume = p && !p.done && p.pos > 30;
  $('dPlay').innerHTML = `${I.play}${resume ? `Resume from ${fmt(p.pos)}` : 'Play'}`;
  $('dRestart').hidden = !resume;
  $('dFolder').hidden = !folder;
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
$('dPlay').onclick = () => { const it = detailsItem; closeDetails(); startPlayback(it); };
$('dRestart').onclick = () => { const it = detailsItem; closeDetails(); startPlayback(it, { from: 0 }); };
$('dFolder').onclick = () => { const f = detailsFolder; closeDetails(); if (f) go(f.path); };

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
  $('ffmpegNote').innerHTML = c.ffmpeg
    ? '✓ Sound &amp; format fix is on — every file plays with sound, and you can switch audio tracks and built-in subtitles.'
    : '⚠ ffmpeg was not found, so some files may play without sound and audio-track switching is off. Install it with <code>brew install ffmpeg</code> (the Mac app includes it).';
  if (!$('settings').open) $('settings').showModal();
}
async function saveConfig(body) {
  await api('/api/config', { method: 'POST', body: JSON.stringify(body) });
  metaCache.clear(); folderCache.clear();
  state.servers = []; state.roots = [];
  if (location.hash.replace(/^#\/?/, '')) location.hash = '#/'; else route();
}
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
    await saveConfig({ servers: f.servers.value, username: f.username.value, password: f.password.value, keepPassword: keepPw, tmdbKey: f.tmdbKey.value });
    $('settings').close();
  } catch (err) { alert(err.message); }
};

/* =====================================================================
   Player
   ===================================================================== */
const video = $('video');
const player = $('player');
const prefs = Object.assign({ volume: 1, muted: false, subSize: 1, subBg: 0, subLang: '', audioLang: '', speed: 1 }, store.get('prefs', {}));
const savePrefs = () => store.set('prefs', prefs);

const S = {
  item: null, list: [], probe: null, mode: 'direct', offset: 0, duration: 0, audio: 0,
  subs: { id: 'off', label: 'Off', cues: [], delay: 0 }, subOptions: [], pendingSeek: null, seekTimer: 0, saveTick: 0,
};

['pClose:back', 'pPlay:play', 'pBack:rew', 'pFwd:fwd', 'pNext:next', 'pMute:vol', 'pPip:pip', 'pFull:full'].forEach((p) => { const [id, ic] = p.split(':'); setIcon($(id), ic); });

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
  S.subs = { id: 'off', label: 'Off', cues: [], delay: 0 };
  $('pTitle').textContent = stem(item.name); $('pSub').textContent = '';
  banner(''); $('upNext').hidden = true;
  player.hidden = false; player.classList.add('loading');
  document.body.style.overflow = 'hidden';
  poke();
  meta(item.path).then((m) => { if (m && S.item === item) $('pSub').textContent = [m.show || m.matched, m.season != null && m.episode != null ? `S${m.season} · E${m.episode}` : m.year].filter(Boolean).join(' · '); });

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
  S.mode = !pr?.ffmpeg || (pr.direct && S.audio === 0) ? 'direct' : 'remux';
  if (pr && !pr.ffmpeg) banner('Some files may play without sound. Install ffmpeg (<code>brew install ffmpeg</code>) or use the MusingsofMaksudTV Mac app, which includes it.');

  buildSubOptions();
  const h = progressOf(item.path);
  const start = from ?? (h && !h.done && h.pos > 30 ? h.pos : 0);
  await load(start);
  autoPickSubtitle();
  updateButtons();
}

function sourceUrl(t) {
  return S.mode === 'direct' ? `/stream?path=${enc(S.item.path)}` : `/remux?path=${enc(S.item.path)}&t=${t}&audio=${S.audio}`;
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
  } else {
    let start = t;
    try { start = (await api(`/api/seek-point?path=${enc(item.path)}&t=${t}`)).start; } catch { /* use t */ }
    if (S.item !== item) return;
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

function closePlayer() {
  if (S.item) saveProgress(S.item, now(), duration());
  closeMenu();
  S.item = null;
  video.pause(); video.removeAttribute('src'); video.load();
  player.hidden = true; document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen();
  $('subLayer').firstElementChild.textContent = '';
  refreshAfterPlayback();
}

/** Progress bars and "Continue watching" reflect what was just watched. */
function refreshAfterPlayback() {
  if (state.view !== 'home') return render();
  const old = document.querySelector('#rows .continue');
  const html = continueRowHtml();
  if (old) old.outerHTML = html; else if (html) $('rows').insertAdjacentHTML('afterbegin', html);
  $('rows').querySelectorAll('.continue .card').forEach((c) => lazy.observe(c));
}

function nextItem() {
  if (!S.item) return null;
  const i = S.list.findIndex((v) => v.path === S.item.path);
  return i >= 0 ? S.list[i + 1] || null : null;
}

/* ----- events ----- */
video.addEventListener('waiting', () => player.classList.add('loading'));
video.addEventListener('playing', () => { player.classList.remove('loading'); updateButtons(); });
video.addEventListener('canplay', () => player.classList.remove('loading'));
video.addEventListener('pause', updateButtons);
video.addEventListener('play', updateButtons);
video.addEventListener('timeupdate', () => {
  updateTime();
  if (S.item && ++S.saveTick % 20 === 0) saveProgress(S.item, now(), duration());
  // A direct stream that decodes no audio: the file's sound format isn't supported natively, convert it.
  if (S.mode === 'direct' && S.probe?.ffmpeg && S.probe.audio?.length && video.currentTime > 3 && video.webkitAudioDecodedByteCount === 0) {
    S.mode = 'remux'; toast('Fixing sound…'); load(video.currentTime);
  }
});
video.addEventListener('error', () => {
  if (!S.item || !video.getAttribute('src')) return;
  if (S.mode === 'direct' && S.probe?.ffmpeg) { S.mode = 'remux'; toast('Switching to compatibility mode…'); load(now()); return; }
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
  setIcon($('pMute'), video.muted || video.volume === 0 ? 'mute' : 'vol');
  setIcon($('pFull'), document.fullscreenElement ? 'unfull' : 'full');
  $('pNext').hidden = !nextItem();
  const a = S.probe?.audio || [];
  $('pAudio').hidden = !a.length;
  $('pAudio').innerHTML = `${I.audio}<span>${esc(a.find((x) => x.index === S.audio)?.label || 'Audio')}</span>`;
  $('pSubs').innerHTML = `${I.cc}<span>${esc(S.subs.id === 'off' ? 'Subtitles' : S.subs.label)}</span>`;
  $('pSubs').classList.toggle('on', S.subs.id !== 'off');
  $('pSpeed').innerHTML = `${I.speed}<span>${prefs.speed === 1 ? '1×' : prefs.speed + '×'}</span>`;
  $('pPip').hidden = !document.pictureInPictureEnabled;
}

function updateTime() {
  const t = now(), d = duration();
  $('pTime').textContent = `${fmt(t)} / ${fmt(d)}`;
  const pct = d ? (t / d) * 100 : 0;
  $('seekPlayed').style.width = pct + '%';
  $('seekKnob').style.left = pct + '%';
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
$('pClose').onclick = closePlayer;
$('pMute').onclick = () => { video.muted = !video.muted; prefs.muted = video.muted; savePrefs(); updateButtons(); };
$('pVol').oninput = (e) => { video.volume = Number(e.target.value); video.muted = false; prefs.volume = video.volume; prefs.muted = false; savePrefs(); updateButtons(); };
video.volume = prefs.volume; video.muted = prefs.muted; $('pVol').value = prefs.volume;
$('pFull').onclick = toggleFull;
$('pPip').onclick = () => (document.pictureInPictureElement ? document.exitPictureInPicture() : video.requestPictureInPicture()).catch(() => {});
function toggleFull() { document.fullscreenElement ? document.exitFullscreen() : player.requestFullscreen(); }
document.addEventListener('fullscreenchange', () => { player.classList.toggle('fs', !!document.fullscreenElement); updateButtons(); });
video.addEventListener('click', () => { if (!$('menu').hidden) return closeMenu(); togglePlay(); });
video.addEventListener('dblclick', toggleFull);

/* ----- auto-hide controls ----- */
let idleTimer = 0;
function poke() {
  player.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!video.paused && $('menu').hidden) player.classList.add('idle'); }, 2600);
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

$('pAudio').onclick = () => {
  const a = S.probe?.audio || [];
  openMenu('audio', `<h4>Audio track</h4>${a.map((x) => opt(x.index, x.label, [codecName(x.codec), channelsName(x.channels)].filter(Boolean).join(' · '), x.index === S.audio)).join('')}`);
};

$('pSpeed').onclick = () => {
  openMenu('speed', `<h4>Playback speed</h4>${[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => opt(s, s === 1 ? 'Normal' : s + '×', '', prefs.speed === s)).join('')}`);
};

$('pSubs').onclick = () => openMenu('subs', subsMenuHtml());

function subsMenuHtml() {
  const ext = S.subOptions.filter((o) => o.type === 'file');
  const emb = S.subOptions.filter((o) => o.type === 'embedded');
  return `<h4>Subtitles</h4>${opt('off', 'Off', '', S.subs.id === 'off')}
    ${ext.length ? `<h4>From the server</h4>${ext.map((o) => opt(o.id, o.label, o.sub, S.subs.id === o.id)).join('')}` : ''}
    ${emb.length ? `<h4>Built into the file</h4>${emb.map((o) => opt(o.id, o.label, o.text ? o.sub : 'Image subtitles — can’t be shown', S.subs.id === o.id, !o.text)).join('')}` : ''}
    <h4>More</h4>${opt('load', 'Load a subtitle file…', '.srt or .vtt from your Mac', false)}
    <div class="stepper"><span>Size</span><div><button data-act="size-">A−</button><output>${Math.round(prefs.subSize * 100)}%</output><button data-act="size+">A+</button></div></div>
    <div class="stepper"><span>Timing</span><div><button data-act="delay-">−0.5s</button><output>${S.subs.delay > 0 ? '+' : ''}${S.subs.delay.toFixed(1)}s</output><button data-act="delay+">+0.5s</button></div></div>
    <div class="stepper"><span>Background</span><div><button data-act="bg">${prefs.subBg ? 'On' : 'Off'}</button></div></div>`;
}

$('menu').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act) {
    if (act === 'size-') prefs.subSize = Math.max(0.6, +(prefs.subSize - 0.1).toFixed(1));
    if (act === 'size+') prefs.subSize = Math.min(2, +(prefs.subSize + 0.1).toFixed(1));
    if (act === 'delay-') S.subs.delay = +(S.subs.delay - 0.5).toFixed(1);
    if (act === 'delay+') S.subs.delay = +(S.subs.delay + 0.5).toFixed(1);
    if (act === 'bg') prefs.subBg = prefs.subBg ? 0 : 0.55;
    savePrefs(); applySubStyle();
    $('menu').innerHTML = subsMenuHtml();
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
  } else if (menuFor === 'speed') {
    prefs.speed = Number(id); savePrefs(); video.playbackRate = prefs.speed; closeMenu(); updateButtons();
  } else if (menuFor === 'subs') {
    closeMenu();
    if (id === 'load') return $('subFile').click();
    selectSubtitle(id);
  }
});
document.addEventListener('mousedown', (e) => {
  if (!$('menu').hidden && !e.target.closest('#menu') && !e.target.closest('.pill-btn')) closeMenu();
});

/* ----- subtitles ----- */
function applySubStyle() {
  $('subLayer').style.setProperty('--sub', prefs.subSize);
  $('subLayer').style.setProperty('--subbg', prefs.subBg);
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
      sub: x.forced ? 'Forced' : 'Takes a moment to load the first time',
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
    S.subs = { ...S.subs, id: 'off', label: 'Off', cues: [] };
    if (remember) { prefs.subLang = 'off'; savePrefs(); }
    updateButtons(); return;
  }
  const o = S.subOptions.find((x) => x.id === id);
  if (!o) return;
  try {
    let text;
    if (o.type === 'file') text = await (await fetch(`/subs?path=${enc(o.path)}`)).text();
    else {
      toast('Loading subtitles from the file…', 60000);
      text = await (await fetch(`/api/embedded-sub?path=${enc(item.path)}&index=${o.index}`)).text();
      $('toast').hidden = true;
    }
    if (S.item !== item) return;
    S.subs = { ...S.subs, id, label: o.label, cues: parseCues(text) };
    if (!S.subs.cues.length) toast('This subtitle file is empty', 2000);
    if (remember) { prefs.subLang = o.lang || langCodeFromLabel(o.label); savePrefs(); }
  } catch {
    toast('Could not load these subtitles', 2500);
  }
  updateButtons();
}
const langCodeFromLabel = (l) => (/english/i.test(l) ? 'eng' : /bengali|bangla/i.test(l) ? 'ben' : /hindi/i.test(l) ? 'hin' : '');

$('subFile').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const cues = parseCues(await f.text());
  S.subs = { ...S.subs, id: 'local', label: f.name.replace(/\.[^.]+$/, ''), cues };
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
  if ((e.metaKey || e.ctrlKey) && e.key === 'f' && player.hidden) { e.preventDefault(); $('filter').focus(); return; }
  if (e.key === '/' && player.hidden && $('details').hidden) { e.preventDefault(); $('filter').focus(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key === '[') { e.preventDefault(); if (!player.hidden) closePlayer(); else history.back(); return; }
  if (player.hidden) {
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
  else if (k === '[' || k === ']') { S.subs.delay = +(S.subs.delay + (k === ']' ? 0.5 : -0.5)).toFixed(1); toast(`Subtitle timing ${S.subs.delay > 0 ? '+' : ''}${S.subs.delay.toFixed(1)} s`, 900); }
  else if (k === 'escape') { if (!$('menu').hidden) closeMenu(); else if (!document.fullscreenElement) closePlayer(); }
  else if (/^[0-9]$/.test(k) && duration()) seekTo(duration() * Number(k) / 10, { immediate: true });
});

/* ----- boot ----- */
if (!location.hash) history.replaceState(null, '', '#/');
route();
window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 30), { passive: true });
