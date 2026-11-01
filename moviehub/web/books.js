// Books from Google Books: by volume id, ISBN, or a search by title and author. Works without a key at a small shared quota
// (often used up), so an API key can be set in Settings.
const API = () => process.env.GOOGLE_BOOKS_API || 'https://www.googleapis.com/books/v1';
const cache = new Map();

async function call(key, path, params) {
  const u = new URL(`${API()}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (key) u.searchParams.set('key', key);
  const ck = u.href;
  if (!cache.has(ck)) {
    const job = fetch(u, { signal: AbortSignal.timeout(12000) }).then(async (r) => {
      if (r.status === 429) throw new Error('Google Books has used up its free allowance. Add a free Google Books API key in Settings');
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Google Books answered ${r.status}`);
      return r.json();
    });
    job.catch(() => cache.delete(ck));
    cache.set(ck, job);
  }
  return cache.get(ck);
}

const https = (u) => (u ? String(u).replace(/^http:/, 'https:').replace('&edge=curl', '') : null);
const shape = (v) => {
  const i = v.volumeInfo || {};
  const ids = i.industryIdentifiers || [];
  const isbn = ids.find((x) => x.type === 'ISBN_13')?.identifier || ids.find((x) => x.type === 'ISBN_10')?.identifier || '';
  return {
    id: v.id, kind: 'book', title: [i.title, i.subtitle].filter(Boolean).join(': '), authors: i.authors || [], year: Number(String(i.publishedDate || '').slice(0, 4)) || null,
    publisher: i.publisher || '', description: String(i.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), isbn, pages: i.pageCount || null,
    cover: https(i.imageLinks?.thumbnail || i.imageLinks?.smallThumbnail), link: i.infoLink || null,
  };
};

export async function bookById(key, id) {
  const j = await call(key, `/volumes/${encodeURIComponent(id)}`, {});
  return j ? shape(j) : null;
}
export async function bookByIsbn(key, isbn) {
  const j = await call(key, '/volumes', { q: `isbn:${String(isbn).replace(/[^0-9Xx]/g, '')}`, maxResults: '1' });
  return j?.items?.[0] ? shape(j.items[0]) : null;
}
export async function searchBooks(key, q) {
  const j = await call(key, '/volumes', { q, maxResults: '10', printType: 'books' });
  return (j?.items || []).map(shape);
}
