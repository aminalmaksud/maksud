// Downloads (Mac app only: enabled when DOWNLOAD_DIR is set). Movies are saved with their subtitle files and
// can be played offline through the same player (paths "local/<file name>").
import fs from 'node:fs';
import path from 'node:path';
import { VIDEO_EXT, SUB_EXT, extOf } from './listing.js';

export const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || '';
export const downloadsEnabled = () => !!DOWNLOAD_DIR;

const jobs = new Map(); // source path -> job

const safeName = (n) => n.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_').slice(0, 240);

/** Starts (or resumes) downloading `url` to DOWNLOAD_DIR/name. Interrupted downloads continue where they stopped. */
export function startDownload({ id, url, name, headers, extras = [] }) {
  const existing = jobs.get(id);
  if (existing && existing.status === 'downloading') return existing;
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const file = path.join(DOWNLOAD_DIR, safeName(name));
  const job = { id, name: path.basename(file), file, total: 0, received: 0, speed: 0, status: 'downloading', error: '', ac: new AbortController() };
  jobs.set(id, job);
  run(job, url, headers).catch((e) => {
    if (job.status === 'cancelled') return;
    job.status = 'error'; job.error = e.message;
  });
  // subtitle files next to the movie, so they work offline too
  for (const x of extras) {
    fetch(x.url, { headers }).then(async (r) => { if (r.ok) fs.writeFileSync(path.join(DOWNLOAD_DIR, safeName(x.name)), Buffer.from(await r.arrayBuffer())); }).catch(() => {});
  }
  return job;
}

async function run(job, url, headers) {
  const part = job.file + '.part';
  let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  let res = await fetch(url, { headers: { ...headers, ...(have ? { range: `bytes=${have}-` } : {}) }, signal: job.ac.signal });
  if (have && res.status !== 206) { have = 0; } // server ignored the range: start over
  if (!res.ok) throw new Error(`Server answered ${res.status}`);
  const len = Number(res.headers.get('content-length')) || 0;
  job.total = len ? have + len : 0;
  job.received = have;
  const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
  let windowBytes = 0, windowStart = Date.now();
  try {
    for await (const chunk of res.body) {
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      job.received += chunk.length;
      windowBytes += chunk.length;
      const dt = Date.now() - windowStart;
      if (dt > 1000) { job.speed = Math.round((windowBytes * 1000) / dt); windowBytes = 0; windowStart = Date.now(); }
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  fs.renameSync(part, job.file);
  job.status = 'done'; job.speed = 0;
}

export function cancelDownload(id) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'cancelled';
  job.ac.abort();
  setTimeout(() => { try { fs.unlinkSync(job.file + '.part'); } catch { /* already gone */ } }, 300);
  jobs.delete(id);
}

export function deleteDownloaded(name) {
  const file = path.join(DOWNLOAD_DIR, safeName(name));
  if (!file.startsWith(DOWNLOAD_DIR)) return;
  try { fs.unlinkSync(file); } catch { /* gone */ }
  const stem = name.replace(/\.[^.]+$/, '');
  for (const f of safeList()) if (SUB_EXT.has(extOf(f)) && f.startsWith(stem)) { try { fs.unlinkSync(path.join(DOWNLOAD_DIR, f)); } catch { /* gone */ } }
  for (const [id, j] of jobs) if (j.file === file) jobs.delete(id);
}

const safeList = () => { try { return fs.readdirSync(DOWNLOAD_DIR); } catch { return []; } };

/** Active / failed jobs plus everything already in the folder. */
export function listDownloads() {
  const active = [...jobs.values()].filter((j) => j.status !== 'done').map(({ ac, file, ...j }) => j);
  const done = safeList().filter((f) => VIDEO_EXT.has(extOf(f))).map((f) => {
    const st = fs.statSync(path.join(DOWNLOAD_DIR, f));
    return { name: f, path: `local/${encodeURIComponent(f)}`, size: st.size, at: st.mtimeMs };
  }).sort((a, b) => b.at - a.at);
  return { dir: DOWNLOAD_DIR, active, done };
}

/** Folder listing in the same shape as a library folder, for the player (subtitles, next episode). */
export function localEntries() {
  return safeList().filter((f) => !f.endsWith('.part')).map((f) => {
    const ext = extOf(f);
    const kind = VIDEO_EXT.has(ext) ? 'video' : SUB_EXT.has(ext) ? 'sub' : null;
    return kind && { name: f, path: `local/${encodeURIComponent(f)}`, isDir: false, kind };
  }).filter(Boolean);
}

/** Absolute file path for "local/<name>", or null if it isn't inside the downloads folder. */
export function localFile(rel) {
  const name = decodeURIComponent(String(rel).replace(/^local\//, ''));
  const file = path.join(DOWNLOAD_DIR, safeName(name));
  return DOWNLOAD_DIR && file.startsWith(DOWNLOAD_DIR + path.sep) && fs.existsSync(file) ? file : null;
}
