// "Is this the right title?": cast under a title, the IDs of the match, and a dialog to change it by name or by ID
// (TMDB / IMDb for films, TheAudioDB for albums, Google Books / ISBN for books).
// app.js hands over what it owns (helpers, a way to refresh the page) so this file doesn't reach into it.

const mono = (n, esc) => esc((String(n).match(/[\p{L}\p{N}]/u) || ['•'])[0].toUpperCase());

/** The IDs of a match as labelled chips, so you can see what it's matched to. `ids` is [[label, value, link?]]. */
export function idChips(ids, esc) {
  return ids.filter(([, v]) => v).map(([label, v, href]) => {
    const inner = `<span>${esc(label)}</span><b>${esc(v)}</b>`;
    return href ? `<a class="idchip" href="${esc(href)}" target="_blank" rel="noopener" title="Open ${esc(label)} in your browser">${inner}</a>` : `<span class="idchip">${inner}</span>`;
  }).join('');
}

/** The cast as a Jellyfin-style carousel (8 to a page, with arrows), with the director, genres and the TMDB and IMDb IDs. */
export function castHtml(c, esc) {
  if (!c || (!c.cast?.length && !c.director?.length && !c.imdbId && !c.tmdbId)) return '';
  const people = (c.cast || []).map((p) => `<div class="cm" title="${esc(p.name)}${p.role ? ' as ' + esc(p.role) : ''}">
    ${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : `<b>${mono(p.name, esc)}</b>`}<span>${esc(p.name)}</span><small>${esc(p.role)}</small></div>`).join('');
  const facts = [c.director?.length ? `Directed by ${c.director.map(esc).join(', ')}` : '', c.genres?.length ? c.genres.map(esc).join(' · ') : ''].filter(Boolean).join('  ·  ');
  const ids = idChips([
    ['TMDB ID', c.tmdbId && String(c.tmdbId), c.tmdbId && `https://www.themoviedb.org/${c.tmdbType === 'tv' ? 'tv' : 'movie'}/${c.tmdbId}`],
    ['IMDb ID', c.imdbId, c.imdbId && `https://www.imdb.com/title/${c.imdbId}/`],
  ], esc);
  return `${facts ? `<p class="cast-facts">${facts}</p>` : ''}${ids ? `<div class="idchips">${ids}</div>` : ''}
    ${people ? `<div class="cast-wrap"><button type="button" class="cast-arrow left" aria-label="Earlier cast" hidden>‹</button><div class="cast">${people}</div><button type="button" class="cast-arrow right" aria-label="More cast" hidden>›</button></div>` : ''}`;
}

/** Makes the arrows of a cast carousel work: each press moves one page, and an arrow hides when there's nowhere to go. */
export function wireCast(root) {
  const wrap = root.querySelector('.cast-wrap');
  if (!wrap) return;
  const strip = wrap.querySelector('.cast'), left = wrap.querySelector('.left'), right = wrap.querySelector('.right');
  const update = () => {
    const max = strip.scrollWidth - strip.clientWidth;
    left.hidden = strip.scrollLeft < 4; right.hidden = strip.scrollLeft > max - 4;
  };
  const page = (d) => strip.scrollBy({ left: d * strip.clientWidth, behavior: 'smooth' });
  left.onclick = () => page(-1); right.onclick = () => page(1);
  strip.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(strip);
  update();
}

/** What each kind of title is matched against: the fields, where to search, where to save. */
const PROVIDERS = {
  tmdb: { name: 'TMDB', hint: 'Choose the right film or series, so its poster, plot and cast are correct.',
    fields: [['tmdb', 'TMDB ID', '603'], ['imdb', 'IMDb ID', 'tt0133093']],
    search: (enc, q) => `/api/meta-search?q=${enc(q)}`, save: '/api/meta-id',
    body: (f, init, type) => (f.imdb && f.imdb !== init.imdb && f.tmdb === init.tmdb ? { imdb: f.imdb } : { tmdb: f.tmdb || '', ...(type ? { type } : {}) }),
    hit: (r) => ({ tmdb: String(r.id), type: r.type }), empty: 'Type a TMDB ID or an IMDb ID, or pick a title from the list.' },
  album: { name: 'TheAudioDB', hint: 'Choose the right album, so its cover and description are correct. Search as “artist” or “artist - album”.',
    fields: [['id', 'TheAudioDB album ID', '2115888']],
    search: (enc, q) => `/api/info-search?kind=album&q=${enc(q)}`, save: '/api/info-id',
    body: (f) => ({ kind: 'album', id: f.id }), hit: (r) => ({ kind: 'album', id: String(r.id) }), empty: 'Type an album ID, or pick one from the list.' },
  book: { name: 'Google Books', hint: 'Choose the right book, so its cover, author and description are correct.',
    fields: [['id', 'Google Books ID', 'zyTCAlFPjgYC'], ['isbn', 'ISBN', '978-0-553-80457-7']],
    search: (enc, q) => `/api/info-search?kind=book&q=${enc(q)}`, save: '/api/info-id',
    body: (f, init) => ({ kind: 'book', id: f.isbn && f.isbn !== init.isbn ? f.isbn : f.id || f.isbn }), hit: (r) => ({ kind: 'book', id: String(r.id) }), empty: 'Type a Google Books ID or an ISBN, or pick a book from the list.' },
};

export function createMatcher({ esc, enc, api, I }) {
  let dlg = null;

  /**
   * Opens the dialog for the item at `path`. `current` is what it is matched to now: { title, sub, poster, ids: { tmdb, imdb } or { id, isbn } }.
   * `onChanged()` runs after a match is saved or cleared.
   */
  function open({ path, title, current = null, pinned = false, type = '', provider = 'tmdb', onChanged }) {
    close();
    const P = PROVIDERS[provider], ids = current?.ids || {};
    dlg = document.createElement('dialog');
    dlg.className = 'match-dlg';
    const field = ([key, label, ph]) => `<label class="mt-field"><span>${esc(label)}</span><input name="${key}" value="${esc(ids[key] || '')}" placeholder="${esc(ph)}" spellcheck="false" autocomplete="off" inputmode="${key === 'tmdb' || (provider === 'album') ? 'numeric' : 'text'}"></label>`;
    dlg.innerHTML = `<form method="dialog">
      <header class="mt-head"><div><h3>Edit match</h3><p>${esc(P.hint)}</p></div><button type="button" class="icon-btn" id="mtX" title="Close (Esc)" aria-label="Close">${I.close}</button></header>
      <div class="mt-body">
        <section class="mt-current">
          <div class="mt-thumb">${current?.poster ? `<img src="${esc(current.poster)}" alt="">` : `<b>${mono(current?.title || title, esc)}</b>`}</div>
          <div class="mt-cur-text"><small>${pinned ? 'Matched by you' : current ? 'Matched automatically' : 'Not matched yet'}</small>
            <b>${esc(current?.title || title)}</b>${current?.sub ? `<span>${esc(current.sub)}</span>` : ''}</div>
        </section>
        <section class="mt-section"><h4>Change by ID</h4>
          <div class="mt-fields n${P.fields.length}">${P.fields.map(field).join('')}</div>
          <p class="mt-err" id="mtErr" hidden></p>
          <div class="mt-apply"><button class="btn gold" id="mtSave">Apply</button></div></section>
        <section class="mt-section"><h4>…or search ${esc(P.name)}</h4>
          <input class="mt-search" name="q" value="${esc(title)}" placeholder="Search by name" spellcheck="false" autocomplete="off" aria-label="Search by name">
          <div class="mt-results" id="mtResults" aria-live="polite"></div></section>
      </div>
      <footer class="mt-foot">${pinned ? '<button type="button" class="btn quiet" id="mtReset">Back to automatic</button>' : ''}<span class="grow"></span><button type="button" class="btn" id="mtCancel">Cancel</button></footer></form>`;
    document.body.append(dlg);
    const $q = (s) => dlg.querySelector(s), form = $q('form');
    const err = (m) => { $q('#mtErr').textContent = m || ''; $q('#mtErr').hidden = !m; };
    const save = async (body) => {
      err('');
      $q('#mtSave').disabled = true;
      try { await api(P.save, { method: 'POST', body: JSON.stringify({ path, ...body }) }); close(); onChanged?.(); }
      catch (e) { err(e.message); $q('#mtSave').disabled = false; }
    };
    $q('#mtCancel').onclick = close; $q('#mtX').onclick = close;
    $q('#mtReset')?.addEventListener('click', () => save({ clear: true }));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    form.onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(P.fields.map(([k]) => [k, form[k].value.trim()]));
      if (!Object.values(f).some(Boolean)) return err(P.empty);
      save(P.body(f, ids, type));
    };
    let timer = 0, seq = 0;
    const search = async () => {
      const q = form.q.value.trim(), n = ++seq, box = $q('#mtResults');
      if (q.length < 2) { box.innerHTML = ''; return; }
      box.innerHTML = '<p class="mt-note">Searching…</p>';
      try {
        const { results } = await api(P.search(enc, q));
        if (n !== seq) return;
        box.innerHTML = results.length ? results.map((r, i) => `<button type="button" class="mt-hit" data-i="${i}">
          <span class="mt-hit-img">${r.poster ? `<img src="${esc(r.poster)}" alt="" loading="lazy">` : `<b>${mono(r.title, esc)}</b>`}</span>
          <span class="mt-hit-text"><b>${esc(r.title)}</b><small>${[r.year, r.type === 'tv' ? 'TV series' : r.type === 'movie' ? 'Movie' : '', 'ID ' + r.id].filter(Boolean).join(' · ')}</small>${r.overview ? `<em>${esc(r.overview)}</em>` : ''}</span></button>`).join('') : '<p class="mt-note">Nothing found.</p>';
        box.querySelectorAll('.mt-hit').forEach((b) => { b.onclick = () => save(P.hit(results[b.dataset.i])); });
      } catch (e) { if (n === seq) box.innerHTML = ''; err(e.message); }
    };
    form.q.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 350); };
    dlg.showModal();
    (P.fields.length && !Object.values(ids).some(Boolean) ? form[P.fields[0][0]] : $q('#mtSave')).focus();
    search();
  }
  function close() { if (dlg) { dlg.close(); dlg.remove(); dlg = null; } }
  return { open, close };
}
