// Live TV: the channels of your M3U playlists, grouped, with favourites, and a viewer that plays one at a time.
// app.js hands over what it owns (icons, helpers) so this file doesn't reach into it.

const monogram = (name) => (name.match(/[\p{L}\p{N}]/u) || ['•'])[0].toUpperCase();
/** Chromium plays our Matroska stream; engines that only claim WebM support (Safari) get MP4. */
const wantsMp4 = () => /^((?!chrome|chromium|android|edg).)*safari/i.test(navigator.userAgent) || !document.createElement('video').canPlayType('video/webm');

export function createLive({ I, $, esc, enc, api, store, pauseAudio }) {
  const fav = new Set(store.get('livefav', []));
  const saveFav = () => store.set('livefav', [...fav]);
  const st = { channels: [], errors: [], group: store.get('livegroup', ''), shown: [], cur: -1, fmt: wantsMp4() ? 'mp4' : 'mkv', retried: false, q: '' };
  const root = $('liveView'), video = $('liveVideo');

  async function load(refresh = false) {
    const d = await api(`/api/iptv${refresh ? '?refresh=1' : ''}`);
    st.channels = d.channels; st.errors = d.errors || [];
  }

  const logo = (c) => (c.logo
    ? `<img src="${esc(c.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:'${esc(monogram(c.name))}'}))">`
    : `<b>${esc(monogram(c.name))}</b>`);

  /** The Live TV page: group chips, then the channels. */
  async function render(into, { refresh = false } = {}) {
    into.innerHTML = '<p class="status">Loading channels…</p>';
    try { await load(refresh); } catch (e) { into.innerHTML = `<p class="status error">${esc(e.message)}</p>`; return; }
    draw(into);
  }
  function draw(into) {
    const groups = [...new Set(st.channels.map((c) => c.group))];
    const group = st.group === '★' || groups.includes(st.group) ? st.group : '';
    const q = st.q.toLowerCase();
    st.shown = st.channels.filter((c) => (!group || (group === '★' ? fav.has(c.id) : c.group === group)) && (!q || c.name.toLowerCase().includes(q)));
    const chip = (v, label, n) => `<button class="chip${group === v ? ' on' : ''}" data-lg="${esc(v)}">${esc(label)}<small>${n}</small></button>`;
    into.innerHTML = `<div class="live-page">
      ${st.errors.map((e) => `<p class="status error">${esc(e)}</p>`).join('')}
      <div class="live-bar"><input id="liveQ" type="search" placeholder="Find a channel…" value="${esc(st.q)}" spellcheck="false">
        <button class="btn" id="liveRefresh" title="Reload the playlists">Reload</button></div>
      <div class="live-chips">${chip('', 'All', st.channels.length)}${fav.size ? chip('★', '★ Favourites', st.channels.filter((c) => fav.has(c.id)).length) : ''}${groups.map((g) => chip(g, g, st.channels.filter((c) => c.group === g).length)).join('')}</div>
      <div class="live-grid">${st.shown.map((c, i) => `<div class="ch" data-i="${i}" role="button" tabindex="0"><span class="ch-logo">${logo(c)}</span><span class="ch-name">${esc(c.name)}</span>
        <button class="ch-fav${fav.has(c.id) ? ' on' : ''}" data-fav="${esc(c.id)}" title="Favourite" aria-label="Favourite">${fav.has(c.id) ? '★' : '☆'}</button></div>`).join('')}</div>
      ${st.shown.length ? '' : `<p class="status">${st.channels.length ? 'No channels match.' : 'No channels yet. Add an M3U playlist in Settings → Live TV.'}</p>`}</div>`;
    const q2 = into.querySelector('#liveQ');
    q2.oninput = () => { st.q = q2.value; const pos = q2.selectionStart; draw(into); const n = into.querySelector('#liveQ'); n.focus(); n.setSelectionRange(pos, pos); };
    into.querySelector('#liveRefresh').onclick = () => render(into, { refresh: true });
    into.querySelectorAll('[data-lg]').forEach((b) => { b.onclick = () => { st.group = b.dataset.lg; store.set('livegroup', st.group); draw(into); }; });
    into.querySelectorAll('.ch').forEach((el) => {
      el.onclick = (e) => {
        const f = e.target.closest('[data-fav]');
        if (f) { fav.has(f.dataset.fav) ? fav.delete(f.dataset.fav) : fav.add(f.dataset.fav); saveFav(); return draw(into); }
        play(Number(el.dataset.i));
      };
      el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
    });
  }

  /* ---------- the viewer ---------- */
  function play(i) {
    if (!st.shown.length) return;
    st.cur = (i + st.shown.length) % st.shown.length;
    const c = st.shown[st.cur];
    st.retried = false;
    pauseAudio?.();
    const pv = $('video'); if (pv && !pv.paused) pv.pause();
    root.hidden = false; document.body.style.overflow = 'hidden';
    $('liveName').textContent = c.name; $('liveGroup').textContent = c.group;
    $('liveMsg').textContent = 'Connecting…'; $('liveMsg').hidden = false;
    video.src = `/live?id=${enc(c.id)}&fmt=${st.fmt}`;
    video.play().catch(() => { /* a click is needed first */ });
    root.focus();
  }
  function close() {
    root.hidden = true; video.pause(); video.removeAttribute('src'); video.load();
    if ($('player').hidden || $('player').classList.contains('mini')) document.body.style.overflow = '';
  }
  const isOpen = () => !root.hidden;

  function init() {
    $('liveClose').innerHTML = I.close; $('livePrev').innerHTML = `<span class="flip">${I.next}</span>`; $('liveNext').innerHTML = I.next;
    $('liveClose').onclick = close;
    $('livePrev').onclick = () => play(st.cur - 1);
    $('liveNext').onclick = () => play(st.cur + 1);
    $('liveFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.().catch(() => {}));
    video.addEventListener('playing', () => { $('liveMsg').hidden = true; });
    video.addEventListener('waiting', () => { $('liveMsg').textContent = 'Buffering…'; $('liveMsg').hidden = false; });
    video.addEventListener('error', () => {
      if (!video.getAttribute('src')) return;
      if (!st.retried) { st.retried = true; st.fmt = st.fmt === 'mkv' ? 'mp4' : 'mkv'; const c = st.shown[st.cur]; video.src = `/live?id=${enc(c.id)}&fmt=${st.fmt}`; video.play().catch(() => {}); return; }
      $('liveMsg').textContent = 'This channel isn’t working right now.'; $('liveMsg').hidden = false;
    });
    document.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); play(st.cur - 1); }
      else if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); play(st.cur + 1); }
      else if (e.key === 'f') { $('liveFull').click(); }
      else if (e.key === 'm') { video.muted = !video.muted; }
      else if (e.key === 'Backspace') e.stopPropagation();
    }, true);
  }
  return { init, render, close, isOpen, hasChannels: () => st.channels.length > 0 };
}
