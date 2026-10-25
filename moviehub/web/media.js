// ffmpeg helpers: inspect a file, convert its audio (and video if needed) into something the
// player can decode, and pull out embedded text subtitles.
import { spawn, spawnSync } from 'node:child_process';
import { extOf } from './listing.js';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export const hasFfmpeg = (() => {
  try { return spawnSync(FFMPEG, ['-version']).status === 0 && spawnSync(FFPROBE, ['-version']).status === 0; } catch { return false; }
})();

const PLAYABLE_VIDEO = new Set(['h264', 'hevc', 'vp8', 'vp9', 'av1']);
const PLAYABLE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);
const TEXT_SUBS = new Set(['subrip', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']);

const headerArgs = (auth) => (auth ? ['-headers', `Authorization: ${auth}\r\n`] : []);

function run(cmd, args, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = []; let err = '';
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => {
      clearTimeout(t);
      code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.trim().split('\n').pop() || `${cmd} exited ${code}`));
    });
  });
}

const lang = (s) => s.tags?.language && s.tags.language !== 'und' ? s.tags.language : '';
const trackLabel = (s, i) => [s.tags?.title, lang(s).toUpperCase()].filter(Boolean).join(' · ') || `Track ${i + 1}`;

const probeCache = new Map();

/** Streams, duration and whether the browser engine can play the file as-is. */
export function probe(url, auth) {
  if (!probeCache.has(url)) {
    const job = run(FFPROBE, ['-v', 'error', ...headerArgs(auth), '-print_format', 'json', '-show_format', '-show_streams', url], { timeoutMs: 30000 })
      .then((buf) => {
        const j = JSON.parse(buf.toString('utf8'));
        const streams = j.streams || [];
        const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
        const audio = streams.filter((s) => s.codec_type === 'audio').map((s, i) => ({
          index: i, codec: s.codec_name, channels: s.channels || 0, label: trackLabel(s, i), lang: lang(s),
          default: !!s.disposition?.default,
        }));
        const subs = streams.filter((s) => s.codec_type === 'subtitle').map((s, i) => ({
          index: i, codec: s.codec_name, label: trackLabel(s, i), lang: lang(s), text: TEXT_SUBS.has(s.codec_name),
          forced: !!s.disposition?.forced,
        }));
        const tenBit = /10/.test(v?.profile || '') || /10le|10be/.test(v?.pix_fmt || '');
        const video = v ? { codec: v.codec_name, width: v.width, height: v.height, transcode: !PLAYABLE_VIDEO.has(v.codec_name) || (v.codec_name === 'h264' && tenBit) } : null;
        const container = extOf(new URL(url).pathname);
        const direct = ['mp4', 'm4v', 'webm', 'mov'].includes(container) && !!video && !video.transcode
          && audio.length <= 1 && (!audio.length || PLAYABLE_AUDIO.has(audio[0].codec));
        return { duration: Number(j.format?.duration) || 0, video, audio, subs, direct };
      });
    job.catch(() => probeCache.delete(url));
    probeCache.set(url, job);
  }
  return probeCache.get(url);
}

/**
 * When video is copied, output can only begin on a keyframe. Find the last keyframe at or before `t`
 * so the player knows exactly where the stream starts (otherwise seeking and subtitles drift).
 */
export async function keyframeBefore(url, auth, t) {
  if (t < 1) return 0;
  try {
    const out = await run(FFPROBE, ['-v', 'error', ...headerArgs(auth), '-select_streams', 'v:0',
      '-read_intervals', `${Math.max(0, t - 30)}%${t + 0.5}`, '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', url], { timeoutMs: 20000 });
    let best = -1;
    for (const line of out.toString('utf8').split('\n')) {
      const [pts, flags] = line.split(',');
      const v = Number(pts);
      if (flags?.startsWith('K') && v <= t + 0.05 && v > best) best = v;
    }
    return best >= 0 ? best : t;
  } catch {
    return t;
  }
}

/**
 * Starts ffmpeg writing fragmented MP4 to stdout, beginning at `start` seconds, with the chosen audio
 * track converted to stereo AAC. Video is copied unless the engine can't decode it.
 */
export function remux(url, auth, { start = 0, audio = 0, info }) {
  const v = info?.video;
  const a = info?.audio?.[audio];
  const videoArgs = !v ? [] : !v.transcode
    ? ['-c:v', 'copy', ...(v.codec === 'hevc' ? ['-tag:v', 'hvc1'] : [])]
    : process.platform === 'darwin'
      ? ['-c:v', 'h264_videotoolbox', '-b:v', '8M', '-pix_fmt', 'yuv420p']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p'];
  const audioArgs = !a ? ['-an'] : a.codec === 'aac' && a.channels <= 2 ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-ac', '2', '-b:a', '192k'];
  const args = [
    '-hide_banner', '-loglevel', 'error', ...headerArgs(auth),
    '-ss', String(start > 0 ? start + 0.01 : 0), '-i', url,
    '-map', '0:v:0?', ...(a ? ['-map', `0:a:${audio}`] : []),
    ...videoArgs, ...audioArgs, '-sn', '-dn',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1',
  ];
  return spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
}

const subCache = new Map();

/** Extracts embedded text subtitle track `index` as WebVTT. Has to read the whole file, so it's cached. */
export function extractSubtitle(url, auth, index) {
  const key = `${url}#${index}`;
  if (!subCache.has(key)) {
    const job = run(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...headerArgs(auth), '-i', url, '-map', `0:s:${index}`, '-f', 'webvtt', 'pipe:1'], { timeoutMs: 15 * 60000 })
      .then((b) => b.toString('utf8'));
    job.catch(() => subCache.delete(key));
    subCache.set(key, job);
  }
  return subCache.get(key);
}
