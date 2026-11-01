// "Is this the right title?": cast under a title, and a dialog to pick the match by name or by its ID (TMDB, IMDb).
// app.js hands over what it owns (helpers, a way to refresh the page) so this file doesn't reach into it.

/** The cast as a row of round photos, with the director, genres and links to TMDB and IMDb. */
export function castHtml(c, esc) {
  if (!c || (!c.cast?.length && !c.director?.length && !c.imdbId)) return '';
  const mono = (n) => esc((n.match(/[\p{L}\p{N}]/u) || ['•'])[0].toUpperCase());
  const people = (c.cast || []).map((p) => `<div class="cm" title="${esc(p.name)}${p.role ? ' as ' + esc(p.role) : ''}">
    ${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : `<b>${mono(p.name)}</b>`}<span>${esc(p.name)}</span><small>${esc(p.role)}</small></div>`).join('');
  const facts = [
    c.director?.length ? `Directed by ${c.director.map(esc).join(', ')}` : '',
    c.genres?.length ? c.genres.map(esc).join(' · ') : '',
    c.imdbId ? `<a href="https://www.imdb.com/title/${esc(c.imdbId)}/" target="_blank" rel="noopener">IMDb ${esc(c.imdbId)}</a>` : '',
    c.tmdbId ? `<a href="https://www.themoviedb.org/${c.tmdbType === 'tv' ? 'tv' : 'movie'}/${c.tmdbId}" target="_blank" rel="noopener">TMDB ${c.tmdbId}</a>` : '',
  ].filter(Boolean).join('  ·  ');
  return `${facts ? `<p class="cast-facts">${facts}</p>` : ''}${people ? `<div class="cast">${people}</div>` : ''}`;
}

/** What each kind of title is matched against: where to search, where to save, and how to word the dialog. */
const PROVIDERS = {
  tmdb: { name: 'TMDB', hint: 'Pick the right title from TMDB, so its poster, plot and cast are correct.', idLabel: '…or use an ID', idHint: 'TMDB id (603), IMDb id (tt0133093) or an address', search: (enc, q) => `/api/meta-search?q=${enc(q)}`, save: '/api/meta-id',
    body: (v, type) => (/tt\d{5,}/i.test(v) ? { imdb: v } : { tmdb: v, ...(type ? { type } : {}) }), hit: (r) => ({ tmdb: String(r.id), type: r.type }), errEmpty: 'Type an ID, or pick a title from the list.' },
  album: { name: 'TheAudioDB', hint: 'Pick the album from TheAudioDB, so its cover and description are right. Search as “artist” or “artist - album”.', idLabel: '…or use an album ID', idHint: 'TheAudioDB album id (2115888) or its address', search: (enc, q) => `/api/info-search?kind=album&q=${enc(q)}`, save: '/api/info-id',
    body: (v) => ({ kind: 'album', id: v }), hit: (r) => ({ kind: 'album', id: String(r.id) }), errEmpty: 'Type an album ID, or pick one from the list.' },
  book: { name: 'Google Books', hint: 'Pick the book from Google Books, so its cover, author and description are right.', idLabel: '…or use an ISBN or Google Books ID', idHint: 'ISBN (978-0-553-80457-7), Google Books id or address', search: (enc, q) => `/api/info-search?kind=book&q=${enc(q)}`, save: '/api/info-id',
    body: (v) => ({ kind: 'book', id: v }), hit: (r) => ({ kind: 'book', id: String(r.id) }), errEmpty: 'Type an ISBN or ID, or pick a book from the list.' },
};

export function createMatcher({ esc, enc, api, I }) {
  let dlg = null;

  /**
   * Opens the dialog for the title at `path`. `onChanged()` runs after a match is saved or cleared.
   * Providers: only TMDB for now; the shape (search, then save by id) is what music and books will use too.
   */
  function open({ path, title, pinned = false, type = '', provider = 'tmdb', onChanged }) {
    close();
    const P = PROVIDERS[provider];
    dlg = document.createElement('dialog');
    dlg.className = 'match-dlg';
    dlg.innerHTML = `<form method="dialog">
      <h3>Match “${esc(title)}”</h3>
      <p class="mt-hint">${esc(P.hint)}</p>
      <label>Search by name<input name="q" value="${esc(title)}" spellcheck="false" autocomplete="off"></label>
      <div class="mt-results" id="mtResults" aria-live="polite"></div>
      <label>${esc(P.idLabel)}<input name="id" placeholder="${esc(P.idHint)}" spellcheck="false" autocomplete="off"></label>
      <p class="mt-err" id="mtErr" hidden></p>
      <div class="mt-btns">${pinned ? '<button type="button" class="btn quiet" id="mtReset">Back to automatic</button>' : ''}<span class="grow"></span>
        <button type="button" class="btn" id="mtCancel">Cancel</button><button class="btn gold" id="mtSave">Use this ID</button></div></form>`;
    document.body.append(dlg);
    const $q = (s) => dlg.querySelector(s), form = $q('form');
    const err = (m) => { $q('#mtErr').textContent = m || ''; $q('#mtErr').hidden = !m; };
    const save = async (body) => {
      err('');
      try { await api(P.save, { method: 'POST', body: JSON.stringify({ path, ...body }) }); close(); onChanged?.(); }
      catch (e) { err(e.message); }
    };
    $q('#mtCancel').onclick = close;
    $q('#mtReset')?.addEventListener('click', () => save({ clear: true }));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = form.id.value.trim();
      if (!v) return err(P.errEmpty);
      save(P.body(v, type));
    };
    let timer = 0, seq = 0;
    const search = async () => {
      const q = form.q.value.trim(), n = ++seq, box = $q('#mtResults');
      if (q.length < 2) { box.innerHTML = ''; return; }
      box.innerHTML = '<p class="mt-hint">Searching…</p>';
      try {
        const { results } = await api(P.search(enc, q));
        if (n !== seq) return;
        box.innerHTML = results.length ? results.map((r, i) => `<button type="button" class="mt-hit" data-i="${i}">
          ${r.poster ? `<img src="${esc(r.poster)}" alt="">` : '<i></i>'}<span><b>${esc(r.title)}</b> <small>${[r.year, r.type === 'tv' ? 'TV series' : r.type === 'movie' ? 'Movie' : '', r.id].filter(Boolean).join(' · ')}</small><em>${esc(r.overview)}</em></span></button>`).join('') : '<p class="mt-hint">Nothing found.</p>';
        box.querySelectorAll('.mt-hit').forEach((b) => { b.onclick = () => save(P.hit(results[b.dataset.i])); });
      } catch (e) { if (n === seq) box.innerHTML = ''; err(e.message); }
    };
    form.q.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 350); };
    dlg.showModal();
    form.q.select();
    search();
  }
  function close() { if (dlg) { dlg.close(); dlg.remove(); dlg = null; } }
  return { open, close };
}
