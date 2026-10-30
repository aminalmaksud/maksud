// A reader for books: PDF (pdf.js, bundled), EPUB (read from inside its zip by the server) and CBZ comics (page images).
// It remembers where you were in each book.

const extOf = (n) => n.slice(n.lastIndexOf('.') + 1).toLowerCase();
const stemOf = (n) => n.replace(/\.[^.]+$/, '');
const segs = (p) => p.split('/').map(encodeURIComponent).join('/');

export function createReader({ I, $, esc, enc, api, store }) {
  const root = $('reader'), body = $('rdBody'), ctl = $('rdCtl');
  const positions = store.get('readpos', {});
  let cur = null; // { item, save(), teardown(), key(e) }

  const remember = (path, v) => { positions[path] = { ...v, at: Date.now() }; store.set('readpos', positions); };
  const btn = (id, html, title) => `<button class="icon-btn" id="${id}" title="${esc(title)}">${html}</button>`;
  const bye = () => { if (cur) { cur.save?.(); cur.teardown?.(); cur = null; } };

  async function open(item) {
    bye();
    const ext = extOf(item.name);
    const title = stemOf(item.name).replace(/[._]+/g, ' ');
    $('rdTitle').textContent = title; $('rdSub').textContent = ''; ctl.innerHTML = ''; body.innerHTML = '<p class="rd-msg">Opening…</p>';
    root.hidden = false; root.dataset.kind = ext; document.body.style.overflow = 'hidden';
    try {
      cur = ext === 'pdf' ? await openPdf(item) : ext === 'epub' ? await openEpub(item) : await openCbz(item);
    } catch (e) {
      body.innerHTML = `<p class="rd-msg">Couldn’t open this book.<small>${esc(e.message || '')}</small></p>`;
    }
    root.focus();
  }
  function close() {
    bye();
    root.hidden = true; body.innerHTML = ''; ctl.innerHTML = '';
    if ($('player').hidden || $('player').classList.contains('mini')) document.body.style.overflow = '';
  }
  const isOpen = () => !root.hidden;

  /* ---------- flipbook (PDF and comics): pages turn like paper ---------- */
  let flipLib = null;
  const loadScript = (src) => (flipLib ??= new Promise((ok, no) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = () => { flipLib = null; no(new Error('Couldn’t load the flipbook')); }; document.head.append(el); }));
  const styleBtn = (isFlip) => btn('rdStyle', isFlip ? I.file : I.book, isFlip ? 'Single page view' : 'Flipbook view');
  const wantFlip = () => store.get('readerStyle', 'flip') === 'flip';
  const switchStyle = (item, toFlip) => { store.set('readerStyle', toFlip ? 'flip' : 'single'); open(item); };

  /**
   * Shows `count` pages as a book. `make(i)` gives a page's picture URL and `drop(i, url)` lets one go, so only the pages
   * around the one you're on are kept (a 500-page PDF doesn't fill memory). `start` is the page to open on (0-based).
   */
  async function flipbook(item, { count, aspect, start, make, drop }) {
    await loadScript('/vendor/pageflip/page-flip.browser.js');
    body.innerHTML = '<div class="rd-flip"><div id="rdBook"></div></div>';
    const book = $('rdBook');
    book.innerHTML = Array.from({ length: count }, (_, i) => `<div class="pf-page" data-i="${i}" data-density="${i === 0 || i === count - 1 ? 'hard' : 'soft'}"><span class="pf-n">${i + 1}</span></div>`).join('');
    const h = Math.min(Math.max(300, body.clientHeight - 28), 1500), w = Math.round(h * Math.min(1.2, Math.max(0.45, aspect)));
    const pf = new window.St.PageFlip(book, {
      width: w, height: h, size: 'stretch', minWidth: 160, maxWidth: 1400, minHeight: 220, maxHeight: 1600, showCover: true, usePortrait: true,
      mobileScrollSupport: false, maxShadowOpacity: 0.5, flippingTime: 700, startPage: start, autoSize: true,
    });
    pf.loadFromHTML(book.querySelectorAll('.pf-page'));
    const have = new Map(); // page -> its picture URL once it's ready
    let page = start, alive = true, queue = Promise.resolve();
    const pageEl = (i) => book.querySelector(`.pf-page[data-i="${i}"]`);
    const fill = (i) => {
      if (i < 0 || i >= count || have.has(i)) return;
      have.set(i, null);
      queue = queue.then(async () => {
        if (!alive || !have.has(i)) return;
        const url = await make(i).catch(() => null);
        if (!alive || !have.has(i) || !url) { have.delete(i); drop(i, url); return; }
        have.set(i, url);
        const el = pageEl(i);
        if (el) { const img = new Image(); img.alt = ''; img.draggable = false; img.src = url; el.append(img); el.classList.add('has-img'); }
      });
    };
    const around = (i) => {
      for (const d of [0, 1, -1, 2, -2, 3, 4, 5, -3]) fill(i + d);
      for (const [j, url] of [...have]) if (Math.abs(j - i) > 9) { have.delete(j); const el = pageEl(j); el?.querySelector('img')?.remove(); el?.classList.remove('has-img'); drop(j, url); }
    };
    const total = `/ ${count}`;
    ctl.innerHTML = `${btn('rdPrev', I.back, 'Previous page (←)')}<span class="rd-pg"><input id="rdPage" type="number" min="1" max="${count}" value="${start + 1}"> ${total}</span>${btn('rdNext', `<span class="flip">${I.back}</span>`, 'Next page (→)')}${styleBtn(true)}`;
    const show = (i) => { page = i; $('rdPage').value = i + 1; around(i); remember(item.path, { p: i + 1, i }); };
    pf.on('flip', (e) => show(e.data));
    $('rdPrev').onclick = () => pf.flipPrev(); $('rdNext').onclick = () => pf.flipNext();
    $('rdPage').onchange = (e) => { const n = Math.min(Math.max(1, Number(e.target.value) || 1), count) - 1; pf.turnToPage(n); show(n); };
    $('rdStyle').onclick = () => switchStyle(item, false);
    around(start);
    return {
      key: (e) => {
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { pf.flipNext(); return true; }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { pf.flipPrev(); return true; }
        if (e.key === 'Home') { pf.turnToPage(0); show(0); return true; }
        if (e.key === 'End') { pf.turnToPage(count - 1); show(count - 1); return true; }
        return false;
      },
      save: () => remember(item.path, { p: page + 1, i: page }),
      teardown: () => { alive = false; try { pf.destroy(); } catch { /* already gone */ } for (const [j, url] of have) drop(j, url); have.clear(); },
    };
  }

  /* ---------- PDF ---------- */
  async function openPdf(item) {
    const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ url: `/stream?path=${enc(item.path)}`, rangeChunkSize: 262144 }).promise;
    const saved = positions[item.path] || {};
    if (wantFlip()) {
      const first = (await doc.getPage(1)).getViewport({ scale: 1 });
      const book = await flipbook(item, {
        count: doc.numPages, aspect: first.width / first.height, start: Math.min(Math.max(0, (saved.p || 1) - 1), doc.numPages - 1),
        make: async (i) => {
          const pg = await doc.getPage(i + 1), v0 = pg.getViewport({ scale: 1 });
          const vp = pg.getViewport({ scale: Math.min(2.2, 1500 / v0.height) });
          const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          return new Promise((ok) => c.toBlob((b) => ok(b ? URL.createObjectURL(b) : null), 'image/jpeg', 0.9));
        },
        drop: (i, url) => { if (url) URL.revokeObjectURL(url); },
      });
      $('rdSub').textContent = `${doc.numPages} pages`;
      return { ...book, teardown: () => { book.teardown(); doc.destroy(); } };
    }
    let page = Math.min(Math.max(1, saved.p || 1), doc.numPages), zoom = saved.z || 'fit', task = null, alive = true, lastScale = 1;
    body.innerHTML = '<div class="rd-pdf"><canvas id="rdCanvas"></canvas></div>';
    ctl.innerHTML = `${btn('rdPrev', I.back, 'Previous page (←)')}<span class="rd-pg"><input id="rdPage" type="number" min="1" max="${doc.numPages}" value="${page}"> / ${doc.numPages}</span>${btn('rdNext', `<span class="flip">${I.back}</span>`, 'Next page (→)')}
      ${btn('rdZoomOut', '−', 'Zoom out')}${btn('rdFit', 'Fit', 'Fit to width')}${btn('rdZoomIn', '+', 'Zoom in')}${styleBtn(false)}`;
    $('rdStyle').onclick = () => switchStyle(item, true);
    const canvas = $('rdCanvas'), box = body.firstElementChild;
    async function render() {
      task?.cancel();
      const pg = await doc.getPage(page);
      if (!alive) return;
      const base = pg.getViewport({ scale: 1 });
      const scale = zoom === 'fit' ? Math.max(0.3, (box.clientWidth - 24) / base.width) : zoom;
      lastScale = scale;
      const vp = pg.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
      canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.width = `${vp.width / (window.devicePixelRatio || 1)}px`; canvas.style.height = `${vp.height / (window.devicePixelRatio || 1)}px`;
      task = pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      try { await task.promise; } catch { /* a newer page replaced it */ }
      $('rdPage').value = page; box.scrollTop = 0;
    }
    const go = (n) => { page = Math.min(Math.max(1, n), doc.numPages); render(); remember(item.path, { p: page, z: zoom }); };
    const setZoom = (z) => { zoom = z; render(); remember(item.path, { p: page, z: zoom }); };
    const scaleNow = () => lastScale;
    $('rdPrev').onclick = () => go(page - 1); $('rdNext').onclick = () => go(page + 1);
    $('rdPage').onchange = (e) => go(Number(e.target.value) || page);
    $('rdZoomIn').onclick = () => setZoom(Math.min(4, +(scaleNow() * 1.25).toFixed(2)));
    $('rdZoomOut').onclick = () => setZoom(Math.max(0.3, +(scaleNow() / 1.25).toFixed(2)));
    $('rdFit').onclick = () => setZoom('fit');
    const onResize = () => { if (zoom === 'fit') render(); };
    window.addEventListener('resize', onResize);
    $('rdSub').textContent = `${doc.numPages} pages`;
    await render();
    return {
      key: (e) => {
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { go(page + 1); return true; }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { go(page - 1); return true; }
        if (e.key === 'Home') { go(1); return true; }
        if (e.key === 'End') { go(doc.numPages); return true; }
        return false;
      },
      save: () => remember(item.path, { p: page, z: zoom }),
      teardown: () => { alive = false; task?.cancel(); window.removeEventListener('resize', onResize); doc.destroy(); },
    };
  }

  /* ---------- EPUB ---------- */
  async function openEpub(item) {
    const info = await api(`/api/epub?path=${enc(item.path)}`);
    if (!info.spine.length) throw new Error('This book has no pages');
    if (info.title) $('rdTitle').textContent = info.title;
    $('rdSub').textContent = info.author || '';
    const saved = positions[item.path] || {};
    let ch = Math.min(saved.c || 0, info.spine.length - 1), size = saved.s || 100, frac = saved.f || 0;
    body.innerHTML = '<iframe id="rdFrame" title="Book" sandbox="allow-same-origin"></iframe>';
    const frame = $('rdFrame');
    ctl.innerHTML = `${btn('rdPrev', I.back, 'Previous chapter')}<select id="rdToc" aria-label="Contents"></select>${btn('rdNext', `<span class="flip">${I.back}</span>`, 'Next chapter')}
      ${btn('rdSmaller', 'A−', 'Smaller text')}${btn('rdBigger', 'A+', 'Bigger text')}`;
    const toc = info.toc.length ? info.toc : info.spine.map((h, i) => ({ title: `Part ${i + 1}`, href: h }));
    $('rdToc').innerHTML = toc.map((t, i) => `<option value="${i}">${esc(t.title)}</option>`).join('');
    const url = (href) => `/epub/${info.id}/${segs(href)}`;
    const css = () => {
      const cs = getComputedStyle(document.body);
      const fg = cs.color, bg = getComputedStyle(root).backgroundColor, link = getComputedStyle(document.documentElement).getPropertyValue('--maroon') || '#a3242f';
      return `html{background:${bg}}body{background:${bg};color:${fg};font:${size}%/1.7 Georgia,'Times New Roman',serif;max-width:40em;margin:0 auto;padding:1.5em 1.4em 5em}
        img,svg,video{max-width:100%;height:auto}a{color:${link}}h1,h2,h3{line-height:1.25}table{max-width:100%}pre{white-space:pre-wrap}`;
    };
    function onLoad() {
      const doc = frame.contentDocument;
      if (!doc) return;
      const st = doc.createElement('style'); st.textContent = css(); doc.head.append(st);
      const where = decodeURIComponent(frame.contentWindow.location.pathname.replace(`/epub/${info.id}/`, ''));
      const i = info.spine.indexOf(where);
      if (i >= 0) ch = i;
      const t = toc.findIndex((x) => x.href.split('#')[0] === where);
      if (t >= 0) $('rdToc').value = String(t);
      const sc = doc.scrollingElement;
      if (frac) { sc.scrollTop = frac * (sc.scrollHeight - sc.clientHeight); frac = 0; }
      doc.addEventListener('scroll', () => { const s = doc.scrollingElement; remember(item.path, { c: ch, s: size, f: s.scrollHeight > s.clientHeight ? s.scrollTop / (s.scrollHeight - s.clientHeight) : 0 }); }, { passive: true });
      doc.addEventListener('keydown', (e) => { if (cur?.key(e)) e.preventDefault(); });
    }
    frame.addEventListener('load', onLoad);
    const show = (i, fragment = '') => { ch = Math.min(Math.max(0, i), info.spine.length - 1); frame.src = url(info.spine[ch]) + fragment; remember(item.path, { c: ch, s: size, f: 0 }); };
    $('rdPrev').onclick = () => show(ch - 1); $('rdNext').onclick = () => show(ch + 1);
    $('rdToc').onchange = (e) => { const t = toc[Number(e.target.value)]; const [f, frag] = t.href.split('#'); const i = info.spine.indexOf(f); if (i >= 0) { ch = i; frame.src = url(f) + (frag ? `#${frag}` : ''); } };
    const resize = (d) => { size = Math.min(220, Math.max(70, size + d)); const doc = frame.contentDocument; const st = doc?.head.querySelector('style:last-of-type'); if (st) st.textContent = css(); remember(item.path, { c: ch, s: size, f: 0 }); };
    $('rdSmaller').onclick = () => resize(-10); $('rdBigger').onclick = () => resize(10);
    frame.src = url(info.spine[ch]);
    return {
      key: (e) => {
        const sc = frame.contentDocument?.scrollingElement;
        if (e.key === 'ArrowRight' || e.key === 'PageDown' && sc && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) { show(ch + 1); return true; }
        if (e.key === 'ArrowLeft') { show(ch - 1); return true; }
        return false;
      },
      save: () => { const s = frame.contentDocument?.scrollingElement; if (s) remember(item.path, { c: ch, s: size, f: s.scrollHeight > s.clientHeight ? s.scrollTop / (s.scrollHeight - s.clientHeight) : 0 }); },
      teardown: () => frame.removeEventListener('load', onLoad),
    };
  }

  /* ---------- CBZ comics ---------- */
  async function openCbz(item) {
    const { pages } = await api(`/api/cbz?path=${enc(item.path)}`);
    if (!pages) throw new Error('No pages found in this file');
    const saved = positions[item.path] || {};
    if (wantFlip()) {
      const probe = new Image();
      probe.src = `/api/cbz-page?path=${enc(item.path)}&i=0`;
      await new Promise((ok) => { probe.onload = ok; probe.onerror = ok; });
      const book = await flipbook(item, {
        count: pages, aspect: probe.naturalWidth && probe.naturalHeight ? probe.naturalWidth / probe.naturalHeight : 0.66, start: Math.min(saved.i || 0, pages - 1),
        make: async (n) => `/api/cbz-page?path=${enc(item.path)}&i=${n}`, drop: () => {},
      });
      $('rdSub').textContent = `${pages} pages`;
      return book;
    }
    let i = Math.min(saved.i || 0, pages - 1), fit = saved.fit || 'width';
    body.innerHTML = '<div class="rd-comic" id="rdComic"><img id="rdImg" alt=""></div>';
    ctl.innerHTML = `${btn('rdPrev', I.back, 'Previous page (←)')}<span class="rd-pg"><span id="rdN"></span> / ${pages}</span>${btn('rdNext', `<span class="flip">${I.back}</span>`, 'Next page (→)')}${btn('rdFitBtn', I.expand, 'Fit width or height')}${styleBtn(false)}`;
    $('rdStyle').onclick = () => switchStyle(item, true);
    const img = $('rdImg'), box = $('rdComic');
    const src = (n) => `/api/cbz-page?path=${enc(item.path)}&i=${n}`;
    function show(n) {
      i = Math.min(Math.max(0, n), pages - 1);
      img.src = src(i); $('rdN').textContent = i + 1; box.scrollTop = 0;
      if (i + 1 < pages) new Image().src = src(i + 1); // the next page is ready when you turn to it
      remember(item.path, { i, fit });
    }
    const applyFit = () => { box.dataset.fit = fit; };
    $('rdPrev').onclick = () => show(i - 1); $('rdNext').onclick = () => show(i + 1);
    $('rdFitBtn').onclick = () => { fit = fit === 'width' ? 'height' : 'width'; applyFit(); remember(item.path, { i, fit }); };
    box.onclick = (e) => { const r = box.getBoundingClientRect(); show(e.clientX - r.left < r.width / 3 ? i - 1 : i + 1); };
    applyFit(); show(i);
    $('rdSub').textContent = `${pages} pages`;
    return {
      key: (e) => {
        if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { show(i + 1); return true; }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') { show(i - 1); return true; }
        return false;
      },
      save: () => remember(item.path, { i, fit }),
    };
  }

  function init() {
    $('rdClose').innerHTML = I.close;
    $('rdClose').onclick = close;
    document.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
      if (e.target.matches?.('input, select, textarea')) return;
      if (cur?.key(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
  }
  /** Where you were in a book, for "continue reading". */
  const lastRead = () => Object.entries(positions).sort((a, b) => b[1].at - a[1].at).map(([path, v]) => ({ path, ...v }));

  return { init, open, close, isOpen, lastRead };
}
