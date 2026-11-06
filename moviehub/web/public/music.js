// Music: an album's track list, and a bar at the bottom that keeps playing while you browse.
// app.js hands over what it owns (icons, helpers) so this file doesn't reach into it.

const NATIVE = new Set(['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac']); // the rest (WMA, APE...) goes through ffmpeg
const extOf = (n) => n.slice(n.lastIndexOf('.') + 1).toLowerCase();
const stemOf = (n) => n.replace(/\.[^.]+$/, '');
const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/** "01 - Song Name.mp3" -> { n: 1, title: "Song Name" }; the album and artist come from the folders it sits in. */
export function trackInfo(item) {
  const stem = stemOf(item.name).replace(/[_]+/g, ' ');
  const m = /^\s*(\d{1,3})\s*[-.)\s]+\s*(.+)$/.exec(stem);
  const segs = decode(item.path).replace(/\/$/, '').split('/'); // "<library>/Artist/Album/01 Song.mp3"
  const folders = segs.slice(1, -1);
  return {
    n: m ? Number(m[1]) : null, title: (m ? m[2] : stem).replace(/\s+/g, ' ').trim() || item.name,
    album: folders.at(-1) || '', artist: folders.length > 1 ? folders.at(-2) : '',
  };
}

export function createMusic({ I, $, esc, enc, fmt, api, pauseVideo }) {
  const audio = new Audio();
  audio.preload = 'metadata';
  const st = { tracks: [], order: [], pos: -1, shuffle: false, repeat: 'off' };
  let shown = [];       // the tracks listed on the page, for clicks on a row
  let seeking = false;
  const prefs = (() => { try { return JSON.parse(localStorage.getItem('mh.music')) || {}; } catch { return {}; } })();
  const savePrefs = () => { try { localStorage.setItem('mh.music', JSON.stringify({ vol: audio.volume, shuffle: st.shuffle, repeat: st.repeat })); } catch { /* private mode */ } };
  audio.volume = prefs.vol ?? 0.9; st.shuffle = !!prefs.shuffle; st.repeat = prefs.repeat || 'off';

  const current = () => st.tracks[st.order[st.pos]] || null;
  const srcFor = (t) => (NATIVE.has(extOf(t.name)) ? `/stream?path=${enc(t.path)}` : `/api/audio?path=${enc(t.path)}`);

  /** The list of tracks on an album page. */
  function renderTracks(items) {
    shown = items;
    const rows = items.map((t, i) => {
      const info = trackInfo(t);
      return `<div class="trk" data-i="${i}" data-path="${esc(t.path)}" role="button" tabindex="0">
        <span class="trk-n">${info.n ?? i + 1}</span><span class="trk-eq" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="trk-t">${esc(info.title)}</span>
        <span class="trk-x">${esc(extOf(t.name).toUpperCase())}</span></div>`;
    }).join('');
    return `<div class="tracks">${rows}</div>`;
  }
  function markNow() {
    const p = current()?.path;
    document.querySelectorAll('.trk').forEach((r) => {
      r.classList.toggle('on', r.dataset.path === p);
      r.classList.toggle('paused', r.dataset.path === p && audio.paused);
    });
  }

  function shuffleOrder(first) {
    const idx = st.tracks.map((_, i) => i).filter((i) => i !== first);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return first == null ? idx : [first, ...idx];
  }
  function setOrder(startIndex) {
    st.order = st.shuffle ? shuffleOrder(startIndex) : st.tracks.map((_, i) => i);
    st.pos = st.shuffle ? 0 : startIndex;
  }

  function load(posInOrder) {
    st.pos = posInOrder;
    const t = current();
    if (!t) return;
    pauseVideo();
    audio.src = srcFor(t);
    audio.play().catch(() => { /* needs a click first */ });
    const info = trackInfo(t);
    $('abTitle').textContent = info.title;
    $('abSub').textContent = [info.artist, info.album].filter(Boolean).join(' · ');
    $('audioBar').hidden = false; document.body.classList.add('has-audio');
    art(t);
    markNow(); sync();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: info.title, artist: info.artist, album: info.album });
    }
  }
  /** Cover: the picture inside the file, else a picture in the folder, else a note. */
  function art(t) {
    const box = $('abArt');
    box.innerHTML = I.audio;
    const img = new Image();
    img.alt = '';
    img.onload = () => { if (current() === t) { box.innerHTML = ''; box.append(img); } };
    img.onerror = () => {
      const dir = t.path.replace(/[^/]+$/, '');
      api(`/api/meta?path=${enc(dir)}`).then((m) => { if (m?.poster && current() === t) { const i2 = new Image(); i2.alt = ''; i2.onload = () => { if (current() === t) { box.innerHTML = ''; box.append(i2); } }; i2.src = m.poster; } }, () => {});
    };
    img.src = `/api/art?path=${enc(t.path)}`;
  }

  function play(items, index) {
    st.tracks = items;
    setOrder(index);
    load(st.pos);
  }
  const step = (d) => {
    if (!st.tracks.length) return;
    let p = st.pos + d;
    if (p >= st.order.length) { if (st.repeat === 'all') p = 0; else return stopAtEnd(); }
    if (p < 0) p = 0;
    load(p);
  };
  const stopAtEnd = () => { audio.pause(); sync(); markNow(); };
  const toggle = () => { if (!current()) return; audio.paused ? audio.play().catch(() => {}) : audio.pause(); };
  function stop() { audio.pause(); audio.removeAttribute('src'); audio.load(); st.tracks = []; st.order = []; st.pos = -1; $('audioBar').hidden = true; document.body.classList.remove('has-audio'); markNow(); }

  function sync() {
    $('abPlay').innerHTML = audio.paused ? I.play : I.pause;
    $('abPlay').title = audio.paused ? 'Play' : 'Pause';
    $('abShuffle').classList.toggle('on', st.shuffle);
    $('abRepeat').classList.toggle('on', st.repeat !== 'off');
    $('abRepeat').dataset.mode = st.repeat;
    $('abRepeat').title = { off: 'Repeat: off', all: 'Repeat: all', one: 'Repeat: this track' }[st.repeat];
    $('abMute').innerHTML = audio.muted || audio.volume === 0 ? I.mute : I.vol;
    $('abVol').value = Math.round((audio.muted ? 0 : audio.volume) * 100);
  }

  function init() {
    $('abPrev').innerHTML = `<span class="flip">${I.next}</span>`; $('abNext').innerHTML = I.next;
    $('abShuffle').innerHTML = I.shuffle; $('abRepeat').innerHTML = I.repeat; $('abClose').innerHTML = I.close;
    $('abPlay').onclick = toggle;
    $('abNext').onclick = () => step(1);
    $('abPrev').onclick = () => { if (audio.currentTime > 4 || st.pos === 0) audio.currentTime = 0; else step(-1); };
    $('abShuffle').onclick = () => {
      const cur = st.order[st.pos];
      st.shuffle = !st.shuffle;
      if (st.tracks.length) { st.order = st.shuffle ? shuffleOrder(cur) : st.tracks.map((_, i) => i); st.pos = st.shuffle ? 0 : cur; }
      savePrefs(); sync();
    };
    $('abRepeat').onclick = () => { st.repeat = { off: 'all', all: 'one', one: 'off' }[st.repeat]; savePrefs(); sync(); };
    $('abClose').onclick = stop;
    $('abMute').onclick = () => { audio.muted = !audio.muted; sync(); };
    $('abVol').oninput = (e) => { audio.muted = false; audio.volume = Number(e.target.value) / 100; savePrefs(); sync(); };
    const seek = $('abSeek');
    seek.oninput = () => { seeking = true; $('abCur').textContent = fmt((seek.value / 1000) * (audio.duration || 0)); };
    seek.onchange = () => { if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; seeking = false; };
    audio.addEventListener('timeupdate', () => {
      if (!seeking && audio.duration) { $('abSeek').value = Math.round((audio.currentTime / audio.duration) * 1000); $('abCur').textContent = fmt(audio.currentTime); }
    });
    audio.addEventListener('loadedmetadata', () => { $('abDur').textContent = Number.isFinite(audio.duration) ? fmt(audio.duration) : ''; });
    audio.addEventListener('play', () => { sync(); markNow(); });
    audio.addEventListener('pause', () => { sync(); markNow(); });
    audio.addEventListener('ended', () => { if (st.repeat === 'one') { audio.currentTime = 0; audio.play(); } else step(1); });
    audio.addEventListener('error', () => { if (current()) { $('abSub').textContent = 'Can’t play this file'; } });
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      ms.setActionHandler('play', toggle); ms.setActionHandler('pause', toggle);
      ms.setActionHandler('previoustrack', () => $('abPrev').click()); ms.setActionHandler('nexttrack', () => step(1));
    }
    document.addEventListener('click', (e) => {
      const row = e.target.closest('.trk');
      if (!row) return;
      const i = Number(row.dataset.i);
      if (current()?.path === shown[i]?.path && st.tracks === shown) toggle(); else play(shown, i);
    });
    document.addEventListener('keydown', (e) => {
      const row = e.target.closest?.('.trk');
      if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
    });
    sync();
  }

  const setShuffle = (on) => { st.shuffle = !!on; savePrefs(); sync(); };
  return { init, renderTracks, markNow, play, stop, pause: () => audio.pause(), playing: () => !audio.paused, current, shuffleOn: () => st.shuffle, setShuffle };
}
