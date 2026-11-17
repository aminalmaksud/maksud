"""Shorten a recording by trimming long pauses between words. Words are never cut.

Every pause longer than `max_gap` seconds is shortened to exactly `max_gap`: the extra time is taken out of
the middle of the pause, so half of `max_gap` of real silence stays after the previous word and half before
the next one. Pauses up to `max_gap` are left alone.

A stretch only counts as a pause if (1) no transcribed word is in it and (2) the audio is actually quiet
there. The second check protects anything the transcription may have missed (a mumbled word, a laugh).
"""

from __future__ import annotations

from fractions import Fraction
from pathlib import Path

import numpy as np

DEFAULT_GAP = 0.75
HOP = 0.01  # analysis frame, 10 ms
FADE = 0.008  # short fade at each splice so cuts never click

# output format per input extension: (encoder candidates, extension to write)
AUDIO_OUT = {
    ".mp3": (["libmp3lame", "mp3"], ".mp3"),
    ".wav": (["pcm_s16le"], ".wav"),
    ".aif": (["pcm_s16be"], ".aif"),
    ".aiff": (["pcm_s16be"], ".aiff"),
    ".flac": (["flac"], ".flac"),
    ".m4a": (["aac"], ".m4a"),
    ".aac": (["aac"], ".m4a"),
    ".ogg": (["libopus"], ".ogg"),
    ".opus": (["libopus"], ".opus"),
}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".webm"}
VIDEO_ENCODERS = [("libx264", {"crf": "18", "preset": "fast"}), ("h264_videotoolbox", {"q:v": "65"}),
                  ("mpeg4", {"qscale": "2"})]


def plan_cuts(audio: np.ndarray, sr: int, words, max_gap: float = 0.75, threshold_db: float = -35.0):
    """Return the stretches to remove as (start, end) seconds, sorted."""
    hop = int(sr * HOP)
    n = len(audio) // hop
    if n == 0:
        return []
    dur = len(audio) / sr
    db = 10 * np.log10(np.mean(audio[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-10)
    speech = np.zeros(n, bool)
    for w in words:
        speech[max(0, int(w.start / HOP)): min(n, int(np.ceil(w.end / HOP)))] = True
    # "Quiet" is below -35 dB, or for noisy recordings a little above the noise floor;
    # anything near speech loudness is always kept.
    floor = np.percentile(db, 10)
    level = np.median(db[speech]) if speech.any() else np.percentile(db, 90)
    thr = min(max(threshold_db, floor + 6), level - 12)
    quiet = db < thr
    # clicks and tiny noises (< 60 ms) inside a pause don't end the pause
    k, i = 6, 0
    while i < n:
        if not quiet[i]:
            j = i
            while j < n and not quiet[j]:
                j += 1
            if 0 < i and j < n and j - i < k and not speech[i:j].any():
                quiet[i:j] = True
            i = j
        else:
            i += 1
    quiet &= ~speech
    cuts, i, half = [], 0, max_gap / 2
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            a, b = i * HOP, (dur if j == n else j * HOP)
            if b - a > max_gap + 0.02:
                cuts.append((a + half, b - half))
            i = j
        else:
            i += 1
    return [(round(a, 3), round(b, 3)) for a, b in cuts if b - a > 0.01]


def map_time(t: float, cuts) -> float:
    """Where time t of the original ends up in the shortened file."""
    removed = 0.0
    for a, b in cuts:
        if t <= a:
            break
        removed += min(t, b) - a
    return t - removed


def shift_words(words, cuts):
    import engine

    return [engine.Word(w.text, round(map_time(w.start, cuts), 3), round(map_time(w.end, cuts), 3), w.logprob)
            for w in words]


def _codec_ok(name: str) -> bool:
    import av

    try:
        av.codec.Codec(name, "w")
        return True
    except Exception:
        return False


def output_path(src: str, folder: str) -> tuple[Path, list[str], bool]:
    """File name of the shortened copy, the encoders to try, and whether it is a video."""
    p = Path(src)
    ext = p.suffix.lower()
    if ext in VIDEO_EXT:
        out_ext = ext if ext in (".mp4", ".mov", ".m4v", ".mkv") else ".mp4"
        return Path(folder) / f"{p.stem}-shortened{out_ext}", ["aac"], True
    encs, out_ext = AUDIO_OUT.get(ext, (["aac"], ".m4a"))
    encs = [e for e in encs if _codec_ok(e)]
    if not encs:
        encs, out_ext = ["aac"], ".m4a"
    return Path(folder) / f"{p.stem}-shortened{out_ext}", encs, False


def render(src: str, dst: Path, cuts, audio_encoders: list[str], video: bool, progress=None, cancel=None,
           window: tuple[float, float] | None = None):
    """Write a copy of src with the `cuts` removed (audio, and video if present, kept in sync)."""
    import av

    tmp = dst.with_name(dst.stem + ".part" + dst.suffix)
    inp = av.open(str(src))
    try:
        a_in = next(s for s in inp.streams if s.type == "audio")
        v_in = next((s for s in inp.streams if s.type == "video"), None) if video else None
        if v_in is not None and v_in.disposition and getattr(av.stream.Disposition, "attached_pic", 0) \
                and v_in.disposition & av.stream.Disposition.attached_pic:
            v_in = None  # cover art, not a real video
        dur = float(inp.duration / av.time_base) if inp.duration else None
        a_t0 = float(a_in.start_time * a_in.time_base) if a_in.start_time is not None else 0.0

        out = av.open(str(tmp), "w")
        try:
            # ---- audio
            channels = 2 if (a_in.codec_context.channels or 1) >= 2 else 1
            layout = "stereo" if channels == 2 else "mono"
            rate = a_in.codec_context.sample_rate or 44100
            enc = audio_encoders[0]
            if enc == "libopus":
                rate = 48000
            a_out = out.add_stream(enc, rate=rate)
            a_out.layout = layout
            fmts = [f.name for f in (a_out.codec_context.codec.audio_formats or [])]
            a_fmt = "fltp" if not fmts or "fltp" in fmts else fmts[0]
            a_out.format = a_fmt
            if enc not in ("pcm_s16le", "pcm_s16be", "flac"):
                a_out.bit_rate = 192000
            to_float = av.AudioResampler(format="fltp", layout=layout, rate=rate)
            to_enc = av.AudioResampler(format=a_fmt, layout=layout, rate=rate)
            scuts = [(int(round(a * rate)), int(round(b * rate))) for a, b in cuts]
            fade = max(1, int(FADE * rate))
            pos = None  # samples read (set from the first audio frame, which matters after a seek)
            written = 0  # samples written

            # ---- video
            v_out = None
            if v_in is not None:
                fps = v_in.average_rate or v_in.guessed_rate or Fraction(30)
                fps = Fraction(fps.numerator, fps.denominator)
                for name, opts in VIDEO_ENCODERS:
                    if _codec_ok(name):
                        try:
                            v_out = out.add_stream(name, rate=fps, options=opts)
                            break
                        except Exception:
                            continue
                if v_out is None:
                    raise RuntimeError("No video encoder available")
                v_out.width = v_in.codec_context.width
                v_out.height = v_in.codec_context.height
                v_out.pix_fmt = "yuv420p"
                tb = v_out.codec_context.time_base
                v_tb = Fraction(tb.numerator, tb.denominator) if tb else 1 / fps
                last_pts = -1

            def emit_audio(frame):
                nonlocal pos, written
                if pos is None:
                    pos = int(round(((frame.time or 0.0) - a_t0) * rate)) if frame is not None else 0
                for f in to_float.resample(frame):
                    arr = f.to_ndarray().astype(np.float32)  # (channels, n)
                    n = arr.shape[1]
                    lo, hi = pos, pos + n
                    pos = hi
                    keep = np.ones(n, bool)
                    gain = np.ones(n, np.float32)
                    for ca, cb in scuts:
                        if cb + fade <= lo:
                            continue
                        if ca - fade >= hi:
                            break
                        keep[max(ca, lo) - lo: max(min(cb, hi), lo) - lo] = False
                        # fade out before the cut, fade in after it
                        idx = np.arange(max(ca - fade, lo), min(ca, hi))
                        gain[idx - lo] = np.minimum(gain[idx - lo], (ca - idx) / fade)
                        idx = np.arange(max(cb, lo), min(cb + fade, hi))
                        gain[idx - lo] = np.minimum(gain[idx - lo], (idx - cb + 1) / fade)
                    kept = arr[:, keep] * gain[keep]
                    if kept.shape[1] == 0:
                        continue
                    nf = av.AudioFrame.from_ndarray(np.ascontiguousarray(kept), format="fltp", layout=layout)
                    nf.sample_rate = rate
                    for g in to_enc.resample(nf):
                        g.pts = written
                        g.time_base = Fraction(1, rate)
                        written += g.samples
                        for pkt in a_out.encode(g):
                            out.mux(pkt)

            def in_cut(t):
                return any(a <= t < b for a, b in cuts)

            streams = [a_in] + ([v_in] if v_in is not None else [])
            done = set()
            if window:  # only a part is needed: jump close to it instead of decoding from the start
                if window[0] > 3:
                    inp.seek(int((window[0] - 3 + a_t0) * 1_000_000))
                span = max(0.1, window[1] - window[0])
            for packet in inp.demux(*streams):
                if cancel and cancel():
                    raise InterruptedError
                if len(done) == len(streams):
                    break
                if packet.stream.type == "audio":
                    for frame in packet.decode():
                        emit_audio(frame)
                        t_now = (pos or 0) / rate
                        if window and t_now > window[1] + 0.3:
                            done.add("audio")
                        if progress:
                            if window:
                                progress(max(0.0, min(1.0, (t_now - window[0]) / span)))
                            elif dur:
                                progress(min(1.0, t_now / dur))
                else:
                    for frame in packet.decode():
                        if frame.time is None:
                            continue
                        t = frame.time - a_t0
                        if window and t > window[1] + 0.3:
                            done.add("video")
                        if in_cut(t):
                            continue
                        pts = max(int(round(map_time(t, cuts) / v_tb)), last_pts + 1)
                        last_pts = pts
                        nf = frame.reformat(format="yuv420p")
                        nf.pts, nf.time_base = pts, v_tb
                        try:
                            nf.pict_type = av.video.frame.PictureType.NONE
                        except Exception:
                            pass
                        for pkt in v_out.encode(nf):
                            out.mux(pkt)
            emit_audio(None)
            for pkt in a_out.encode(None):
                out.mux(pkt)
            if v_out is not None:
                for pkt in v_out.encode(None):
                    out.mux(pkt)
        finally:
            out.close()
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    finally:
        inp.close()
    tmp.replace(dst)
    return dst


def cut_file(src: str, words, folder: str, max_gap: float = 0.75, progress=None, cancel=None) -> dict:
    """Make the shortened copy of `src`; returns details plus the words moved to the new timeline."""
    import engine

    audio = engine.load_audio(src)
    dur = len(audio) / engine.SR
    cuts = plan_cuts(audio, engine.SR, words, max_gap)
    dst, encoders, video = output_path(src, folder)
    Path(folder).mkdir(parents=True, exist_ok=True)
    render(src, dst, cuts, encoders, video, progress, cancel)
    removed = sum(b - a for a, b in cuts)
    return {"path": str(dst), "cuts": len(cuts), "removed": round(removed, 2), "before": round(dur, 2),
            "after": round(dur - removed, 2), "words": shift_words(words, cuts), "cut_list": cuts}


def extract(src: str, dst: Path, start: float, end: float, progress=None, cancel=None) -> Path:
    """Copy the part start..end of src into dst (audio, and video if present)."""
    _, encoders, video = output_path(src, str(dst.parent))
    return render(src, dst, [(0.0, max(0.0, start)), (end, 1e9)] if start > 0 else [(end, 1e9)],
                  encoders, video, progress, cancel, window=(start, end))


def check_piece(path: str, want: float, threshold_db: float = -35.0) -> dict:
    """Listen to a saved piece: right length, and quiet at both ends (no word cut off)."""
    import engine

    x = engine.load_audio(path)
    dur = len(x) / engine.SR
    hop = int(engine.SR * HOP)
    n = len(x) // hop
    db = 10 * np.log10(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-10) if n else np.zeros(1)
    level = np.percentile(db, 90)
    thr = max(threshold_db, level - 25)
    edge = 3  # 30 ms
    clean_start = bool(db[:edge].max() < thr) if n > edge else True
    clean_end = bool(db[-edge:].max() < thr) if n > edge else True
    return {"duration": round(dur, 2), "length_ok": abs(dur - want) < 0.15, "clean_start": clean_start,
            "clean_end": clean_end}
