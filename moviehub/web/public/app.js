const $ = (id) => document.getElementById(id);
const grid = $('grid'), statusEl = $('status'), video = $('video');
let currentPath = '', items = [], servers = [];

const enc = (p) => encodeURIComponent(p);
const setStatus = (msg, err = false) => { statusEl.textContent = msg; statusEl.className = err ? 'error' : ''; };
const stem = (n) => n.replace(/\.[^.]+$/, '');

async function api(url, opts) {
  const r = await fetch(url, opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
  return body;
}

async function open(path) {
  setStatus('Loading…');
  try {
    const data = await api(`/api/browse?path=${enc(path)}`);
    currentPath = data.path; items = data.items; servers = data.servers || [];
    $('filter').value = '';
    history.replaceState(null, '', '#' + currentPath);
    renderCrumbs(); render();
    const n = items.filter((i) => i.kind !== 'sub').length;
    setStatus(n ? '' : 'This folder has no movies or sub-folders.');
  } catch (e) {
    setStatus(e.message, true);
    if (/not configured/.test(e.message)) openSettings();
  }
}

function renderCrumbs() {
  const nav = $('crumbs'); nav.replaceChildren();
  const parts = currentPath.split('/').filter(Boolean);
  const mk = (label, p) => { const a = document.createElement('a'); a.textContent = label; a.onclick = () => open(p); return a; };
  nav.append(mk('Home', ''));
  let acc = '';
  parts.forEach((seg, i) => {
    acc += seg + '/';
    if (i === 0 && servers.length < 2) return; // single server: Home is its root
    nav.append(' / ', mk(i === 0 ? servers[Number(seg)] || seg : decodeURIComponent(seg), acc));
  });
}

function render() {
  const q = $('filter').value.trim().toLowerCase();
  grid.replaceChildren();
  for (const it of items) {
    if (it.kind === 'sub' || (q && !it.name.toLowerCase().includes(q))) continue;
    const card = document.createElement('div');
    const isServer = !currentPath;
    card.className = 'card'; card.tabIndex = 0;
    const ico = document.createElement('span'); ico.className = 'ico'; ico.textContent = isServer && servers.length > 1 ? '🖥' : it.isDir ? '📁' : '🎬';
    const label = document.createElement('div'); label.textContent = it.isDir ? it.name : stem(it.name);
    if (!it.isDir) {
      const pos = savedPos(it.path);
      if (pos > 30) { const s = document.createElement('small'); s.textContent = `Resume at ${fmt(pos)}`; label.append(s); }
    }
    card.append(ico, label);
    const go = () => (it.isDir ? open(it.path) : play(it));
    card.onclick = go;
    card.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    grid.append(card);
  }
}

const fmt = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const posKey = (p) => 'pos:' + p;
function savedPos(p) { try { return Number(localStorage.getItem(posKey(p))) || 0; } catch { return 0; } }
function savePos(p, t, d) {
  try { if (d && t > d - 60) localStorage.removeItem(posKey(p)); else if (t > 5) localStorage.setItem(posKey(p), String(t)); } catch { /* private mode */ }
}

let playing = null;
function play(item) {
  playing = item;
  $('title').textContent = stem(item.name);
  $('playerMsg').textContent = '';
  video.replaceChildren();
  for (const s of items.filter((i) => i.kind === 'sub' && stem(i.name).toLowerCase().startsWith(stem(item.name).toLowerCase()))) {
    const t = document.createElement('track');
    t.kind = 'subtitles'; t.label = s.name; t.src = `/subs?path=${enc(s.path)}`; t.srclang = 'en';
    video.append(t);
  }
  video.src = `/stream?path=${enc(item.path)}`;
  const resume = savedPos(item.path);
  video.onloadedmetadata = () => { if (resume > 30 && resume < video.duration - 60) video.currentTime = resume; };
  $('player').hidden = false;
  video.play().catch(() => {});
  if (/\.(mkv|avi|wmv|flv|ts)$/i.test(item.name) && !video.canPlayType('video/x-matroska')) {
    $('playerMsg').textContent = 'This format may not play in Safari. If it stays black, open MovieHub in Chrome.';
  }
}
video.onerror = () => { $('playerMsg').textContent = 'This file could not be played in this browser (unsupported video/audio codec). Try Chrome, or VLC.'; };
video.ontimeupdate = () => { if (playing && Math.floor(video.currentTime) % 5 === 0) savePos(playing.path, video.currentTime, video.duration); };

function closePlayer() {
  if (playing) savePos(playing.path, video.currentTime, video.duration);
  video.pause(); video.removeAttribute('src'); video.replaceChildren(); video.load();
  $('player').hidden = true; playing = null; render();
  if (document.fullscreenElement) document.exitFullscreen();
}
$('closeBtn').onclick = closePlayer;
document.addEventListener('keydown', (e) => {
  if ($('player').hidden) return;
  if (e.key === 'Escape') closePlayer();
  else if (e.key === 'f') (document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen());
  else if (e.key === ' ') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
  else if (e.key === 'ArrowRight') video.currentTime += 10;
  else if (e.key === 'ArrowLeft') video.currentTime -= 10;
});

async function openSettings() {
  const c = await api('/api/config');
  const f = $('settingsForm');
  f.servers.value = c.servers.join('\n'); f.username.value = c.username; f.password.value = '';
  f.password.placeholder = c.hasPassword ? '•••••• (saved — leave blank to keep)' : '';
  $('settings').showModal();
}
$('settingsBtn').onclick = openSettings;
$('cancelBtn').onclick = () => $('settings').close();
$('settingsForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const old = await api('/api/config');
    const keepPw = !f.password.value && old.hasPassword && f.username.value === old.username;
    await api('/api/config', { method: 'POST', body: JSON.stringify({ servers: f.servers.value, username: f.username.value, password: f.password.value, keepPassword: keepPw }) });
    $('settings').close();
    open('');
  } catch (err) { setStatus(err.message, true); }
};
$('filter').oninput = render;
open(decodeURIComponent(location.hash.slice(1)));
