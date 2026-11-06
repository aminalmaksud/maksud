// Albums from TheAudioDB (free key "123" for personal use; a patron key can be set in Settings): cover, year, genre, description.
const API = () => process.env.AUDIODB_API || 'https://www.theaudiodb.com/api/v1/json';
const cache = new Map();
let chain = Promise.resolve(); // the free key allows about 30 requests a minute: one at a time, spaced a little
const spaced = (fn) => { const run = chain.then(fn); chain = run.then(() => new Promise((r) => setTimeout(r, 150)), () => new Promise((r) => setTimeout(r, 150))); return run; };

async function call(key, file, params) {
  const u = new URL(`${API()}/${encodeURIComponent(key || '123')}/${file}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const ck = u.href;
  if (!cache.has(ck)) {
    const job = spaced(async () => {
      const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
      if (r.status === 429) throw new Error('TheAudioDB says too many requests: try again in a minute');
      if (!r.ok) throw new Error(`TheAudioDB answered ${r.status}`);
      return r.json();
    });
    job.catch(() => cache.delete(ck));
    cache.set(ck, job);
  }
  return cache.get(ck);
}

const shape = (a) => ({
  id: String(a.idAlbum), kind: 'album', title: a.strAlbum, artist: a.strArtist, year: Number(a.intYearReleased) || null,
  genre: a.strGenre || a.strStyle || '', description: a.strDescriptionEN || a.strDescription || '',
  cover: a.strAlbumThumbHQ || a.strAlbumThumb || null, rating: a.intScore ? Math.round(Number(a.intScore) * 10) / 10 : null,
});

export async function albumById(key, id) {
  const j = await call(key, 'album.php', { m: id });
  return j.album?.[0] ? shape(j.album[0]) : null;
}
/** Albums by an artist, or one album ("artist - album" or a separate album name). */
export async function searchAlbums(key, artist, album) {
  const j = await call(key, 'searchalbum.php', album ? { s: artist, a: album } : { s: artist });
  return (j.album || []).map(shape);
}
