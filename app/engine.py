"""Core pipeline: Bangla or English audio -> transcript -> word-level timestamps.

1. Decode any audio/video file to 16 kHz mono (PyAV, bundled ffmpeg).
2. Split the audio at natural pauses into chunks of at most ~28 s.
3. Transcribe each chunk with Whisper (a Bangla fine-tune for Bangla).
4. Force-align every chunk's words against the audio with the MMS
   CTC forced-alignment model (uroman romanization), which gives much
   tighter word boundaries than Whisper's own timestamps.
5. Export subtitles (.srt) and ElevenLabs-style JSON (plus optional TXT).

Languages: Bangla (bn) and English (en).
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import unicodedata
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np

SR = 16000

LANGUAGES = {"bn": "বাংলা", "en": "English"}
ASR_MODELS = {
    "bn": {
        "bengaliAI/tugstugi_bengaliai-asr_whisper-medium": "Bangla Whisper (recommended)",
        "bengaliAI/tugstugi_bengaliai-regional-asr_whisper-medium": "Bangla Whisper, regional dialects",
        "openai/whisper-large-v3-turbo": "OpenAI Whisper Large v3 Turbo",
    },
    "en": {
        "openai/whisper-large-v3-turbo": "Whisper Large v3 Turbo (recommended)",
        "distil-whisper/distil-large-v3.5": "Distil-Whisper Large v3.5 (faster)",
        "openai/whisper-large-v3": "Whisper Large v3 (slowest, very accurate)",
    },
}
DEFAULT_MODELS = {"bn": "bengaliAI/tugstugi_bengaliai-asr_whisper-medium", "en": "openai/whisper-large-v3-turbo"}
DEFAULT_ASR = DEFAULT_MODELS["bn"]
WHISPER_LANG = {"bn": ("bn", "bengali"), "en": ("en", "english")}
JSON_LANG = {"bn": "ben", "en": "eng"}
# Chunk length: the Bangla fine-tune was trained on short clips and can skip words in
# long ones; English Whisper is happiest with nearly its full 30 s window.
CHUNK_SECONDS = {"bn": (15.0, 4.0), "en": (28.0, 8.0)}
# Subtitle layout: (max characters per cue, line width for the 2-line split)
SUB_LAYOUT = {"bn": (62, 40), "en": (84, 42)}
ALIGN_MODEL = "MahmoudAshraf/mms-300m-1130-forced-aligner"

APP_ROOT = Path(__file__).resolve().parent
# Inside the .app bundle, models live in Contents/Resources/models.
BUNDLED_MODELS = Path(os.environ.get("BT_MODELS_DIR", APP_ROOT.parent / "models"))


class Cancelled(Exception):
    pass


@dataclass
class Word:
    text: str
    start: float
    end: float
    logprob: float = 0.0


@dataclass
class Chunk:
    start: int  # samples
    end: int
    text: str = ""
    words: list[Word] = field(default_factory=list)


# --------------------------------------------------------------------------
# Audio


def load_audio(path: str) -> np.ndarray:
    """Decode any audio/video file to float32 mono 16 kHz."""
    import av

    out = []
    with av.open(str(path)) as container:
        stream = next(s for s in container.streams if s.type == "audio")
        resampler = av.AudioResampler(format="flt", layout="mono", rate=SR)
        for frame in container.decode(stream):
            for f in resampler.resample(frame):
                out.append(f.to_ndarray().reshape(-1))
        for f in resampler.resample(None):
            out.append(f.to_ndarray().reshape(-1))
    if not out:
        raise ValueError("No audio found in file")
    return np.concatenate(out).astype(np.float32)


def split_on_silence(audio: np.ndarray, max_s: float = 15.0, min_s: float = 4.0) -> list[Chunk]:
    """Cut audio into <= max_s chunks (the Bangla Whisper fine-tune was trained on
    short clips and can skip words in long ones), placing every cut in the quietest
    stretch available so that no word is ever split in half."""
    hop = 320  # 20 ms
    n = len(audio) // hop
    if n == 0:
        return []
    frames = audio[: n * hop].reshape(n, hop)
    db = 10 * np.log10(np.mean(frames**2, axis=1) + 1e-10)
    # 300 ms moving average: prefer the middle of a real pause, not a stop consonant
    k = 15
    smooth = np.convolve(db, np.ones(k) / k, mode="same")
    floor = np.percentile(db, 10)
    peak = np.percentile(db, 99)
    thresh = max(floor + 8, peak - 40)

    max_f, min_f = int(max_s * SR / hop), int(min_s * SR / hop)
    chunks, pos = [], 0
    while pos < n:
        if n - pos <= max_f:
            cut = n
        else:
            lo, hi = pos + min_f, pos + max_f
            window = smooth[lo:hi]
            # Among quiet frames choose the latest one (longest chunk);
            # otherwise just the quietest point in the window.
            quiet = np.where(window < min(window.min() + 3, thresh))[0]
            cut = lo + (int(quiet[-1]) if len(quiet) else int(np.argmin(window)))
        seg = db[pos:cut]
        if len(seg) and (seg > thresh).sum() >= 5:  # >= 100 ms of speech
            chunks.append(Chunk(pos * hop, min(cut * hop, len(audio))))
        pos = cut
    return chunks


# --------------------------------------------------------------------------
# Bangla text -> romanized tokens for the aligner

BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_N = (
    "শূন্য এক দুই তিন চার পাঁচ ছয় সাত আট নয় দশ এগারো বারো তেরো চৌদ্দ পনেরো ষোল সতেরো আঠারো উনিশ "
    "বিশ একুশ বাইশ তেইশ চব্বিশ পঁচিশ ছাব্বিশ সাতাশ আঠাশ ঊনত্রিশ ত্রিশ একত্রিশ বত্রিশ তেত্রিশ চৌত্রিশ "
    "পঁয়ত্রিশ ছত্রিশ সাঁইত্রিশ আটত্রিশ ঊনচল্লিশ চল্লিশ একচল্লিশ বিয়াল্লিশ তেতাল্লিশ চুয়াল্লিশ পঁয়তাল্লিশ "
    "ছেচল্লিশ সাতচল্লিশ আটচল্লিশ ঊনপঞ্চাশ পঞ্চাশ একান্ন বায়ান্ন তিপ্পান্ন চুয়ান্ন পঞ্চান্ন ছাপ্পান্ন সাতান্ন "
    "আটান্ন ঊনষাট ষাট একষট্টি বাষট্টি তেষট্টি চৌষট্টি পঁয়ষট্টি ছেষট্টি সাতষট্টি আটষট্টি ঊনসত্তর সত্তর একাত্তর "
    "বাহাত্তর তিয়াত্তর চুয়াত্তর পঁচাত্তর ছিয়াত্তর সাতাত্তর আটাত্তর ঊনআশি আশি একাশি বিরাশি তিরাশি চুরাশি "
    "পঁচাশি ছিয়াশি সাতাশি অষ্টাশি ঊননব্বই নব্বই একানব্বই বিরানব্বই তিরানব্বই চুরানব্বই পঁচানব্বই ছিয়ানব্বই "
    "সাতানব্বই আটানব্বই নিরানব্বই"
).split()
assert len(_N) == 100


def bn_number(n: int) -> str:
    """Spoken Bangla for an integer (years like 1971 read as উনিশশো একাত্তর)."""
    if n < 100:
        return _N[n]
    if 1100 <= n <= 1999 and n % 100:
        return f"{_N[n // 100]}শো {_N[n % 100]}"
    parts = []
    for unit, name in ((10**7, "কোটি"), (10**5, "লাখ"), (1000, "হাজার"), (100, "শো")):
        if n >= unit:
            parts.append(bn_number(n // unit) + ("" if name == "শো" else " ") + name)
            n %= unit
    if n:
        parts.append(_N[n])
    return " ".join(parts)


_ONES = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen "
         "fifteen sixteen seventeen eighteen nineteen").split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def en_number(n: int) -> str:
    """Spoken English for an integer (years like 1971 read as nineteen seventy-one)."""
    if n < 20:
        return _ONES[n]
    if n < 100:
        return _TENS[n // 10] + ("-" + _ONES[n % 10] if n % 10 else "")
    if (1100 <= n <= 1999 or 2010 <= n <= 2099) and n % 100:
        return f"{en_number(n // 100)} {en_number(n % 100)}"
    parts = []
    for unit, name in ((10**9, "billion"), (10**6, "million"), (1000, "thousand"), (100, "hundred")):
        if n >= unit:
            parts.append(f"{en_number(n // unit)} {name}")
            n %= unit
    if n:
        parts.append(en_number(n))
    return " ".join(parts)


def spoken_form_en(word: str) -> str:
    def repl(m):
        s = m.group(0).replace(",", "")
        if "." in s:
            a, b = s.split(".", 1)
            return f"{en_number(int(a or 0))} point {' '.join(_ONES[int(c)] for c in b if c.isdigit())}"
        return en_number(int(s)) if len(s) <= 12 else " ".join(_ONES[int(c)] for c in s)

    word = word.translate(BN_DIGITS)
    word = re.sub(r"[$£€]([\d][\d,]*(?:\.\d+)?)", lambda m: m.group(1) + {"$": " dollars", "£": " pounds", "€": " euros"}[m.group(0)[0]], word)
    word = word.replace("%", " percent").replace("&", " and ")
    return re.sub(r"\d[\d,]*(?:\.\d+)?", repl, word)


def spoken_form(word: str) -> str:
    def repl(m):
        s = m.group(0).replace(",", "")
        if "." in s:
            a, b = s.split(".", 1)
            return f"{bn_number(int(a or 0))} দশমিক {' '.join(_N[int(c)] for c in b if c.isdigit())}"
        return bn_number(int(s)) if len(s) <= 9 else " ".join(_N[int(c)] for c in s)

    return re.sub(r"\d[\d,]*(?:\.\d+)?", repl, word.translate(BN_DIGITS))


# --------------------------------------------------------------------------
# Model management


def _local_model_dir(repo_id: str) -> Path:
    return BUNDLED_MODELS / repo_id.replace("/", "__")


def model_available(repo_id: str) -> bool:
    if (_local_model_dir(repo_id) / "config.json").exists():
        return True
    try:
        from huggingface_hub import try_to_load_from_cache

        return isinstance(try_to_load_from_cache(repo_id, "config.json"), str)
    except Exception:
        return False


def ensure_model(repo_id: str, status: Callable[[str], None] | None = None) -> str:
    """Return a local folder holding the model; download it if needed."""
    local = _local_model_dir(repo_id)
    if (local / "config.json").exists():
        return str(local)
    from huggingface_hub import snapshot_download
    from huggingface_hub.constants import HF_HUB_CACHE

    base = ["*.json", "*.txt", "*.model", "*.tiktoken"]
    cache = Path(HF_HUB_CACHE) / ("models--" + repo_id.replace("/", "--"))
    done = threading.Event()

    def report():
        while not done.wait(1.0):
            size = sum(f.stat().st_size for f in cache.rglob("*") if f.is_file()) if cache.exists() else 0
            if status:
                status(f"Downloading {repo_id.split('/')[-1]} ({size / 1e9:.2f} GB so far, first time only)")

    t = threading.Thread(target=report, daemon=True)
    t.start()
    try:
        path = snapshot_download(repo_id, allow_patterns=base + ["*.safetensors"])
        if not list(Path(path).glob("*.safetensors")):
            path = snapshot_download(repo_id, allow_patterns=base + ["*.bin"])
    finally:
        done.set()
    return path


def _from_pretrained(cls, path, dtype):
    try:
        return cls.from_pretrained(path, dtype=dtype)
    except TypeError:
        return cls.from_pretrained(path, torch_dtype=dtype)


def bundle_model(repo_id: str, dest_root: str, weights: bool = True, fp16: bool = True) -> Path:
    """Download a model into dest_root (used when building the .app) and store it in fp16."""
    import shutil

    from huggingface_hub import snapshot_download

    base = ["*.json", "*.txt", "*.model", "*.tiktoken"]
    local = Path(dest_root) / repo_id.replace("/", "__")
    tmp = Path(dest_root) / ".download" / repo_id.replace("/", "__")
    patterns = base + (["*.safetensors"] if weights else [])
    snapshot_download(repo_id, local_dir=tmp, allow_patterns=patterns)
    if weights and not list(tmp.glob("*.safetensors")):
        snapshot_download(repo_id, local_dir=tmp, allow_patterns=base + ["*.bin"])
    if weights and fp16:
        import torch
        from transformers import AutoConfig, Wav2Vec2ForCTC, WhisperForConditionalGeneration

        cfg = AutoConfig.from_pretrained(tmp)
        cls = WhisperForConditionalGeneration if cfg.model_type == "whisper" else Wav2Vec2ForCTC
        model = _from_pretrained(cls, tmp, torch.float16).to(torch.float16)
        local.mkdir(parents=True, exist_ok=True)
        model.save_pretrained(local, safe_serialization=True)
        for f in tmp.iterdir():  # tokenizer / processor / vocab files
            if f.is_file() and f.suffix in (".json", ".txt", ".model", ".tiktoken") and not (local / f.name).exists():
                shutil.copy2(f, local / f.name)
    else:
        shutil.rmtree(local, ignore_errors=True)
        shutil.copytree(tmp, local, ignore=shutil.ignore_patterns(".cache"))
    shutil.rmtree(Path(dest_root) / ".download", ignore_errors=True)
    return local


def pick_device(pref: str = "auto") -> str:
    import torch

    if pref != "auto":
        return pref
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


# --------------------------------------------------------------------------
# Engine


class Engine:
    def __init__(self, device: str = "auto"):
        self.device_pref = device
        self.asr_id = None
        self.asr = self.proc = None
        self.aligner = None
        self.vocab: dict[str, int] = {}
        self.blank = 0
        self.normalize = True
        self.uroman = None
        self.lock = threading.Lock()

    # ---- loading ---------------------------------------------------------
    def load(self, asr_id: str, status: Callable[[str], None]):
        import torch
        from transformers import Wav2Vec2ForCTC, WhisperForConditionalGeneration, WhisperProcessor

        device = pick_device(self.device_pref)
        if self.asr_id != asr_id:
            self.asr = None
            path = ensure_model(asr_id, status)
            status("Loading speech recognition model…")
            dtype = torch.float16 if device in ("mps", "cuda") else torch.float32
            model = _from_pretrained(WhisperForConditionalGeneration, path, dtype)
            try:
                self.proc = WhisperProcessor.from_pretrained(path)
            except Exception:
                self.proc = WhisperProcessor.from_pretrained(ensure_model("openai/whisper-medium", status))
            self.asr = model.to(device, dtype).eval()
            self.asr_dtype = dtype
            self.asr_id = asr_id
        if self.aligner is None:
            path = ensure_model(ALIGN_MODEL, status)
            status("Loading word alignment model…")
            vocab = json.loads((Path(path) / "vocab.json").read_text(encoding="utf-8"))
            if vocab and isinstance(next(iter(vocab.values())), dict):
                vocab = next(iter(vocab.values()))
            self.vocab = vocab
            self.blank = vocab.get("<blank>", vocab.get("<pad>", 0))
            pp = Path(path) / "preprocessor_config.json"
            if pp.exists():
                self.normalize = json.loads(pp.read_text()).get("do_normalize", True)
            self.aligner = _from_pretrained(Wav2Vec2ForCTC, path, torch.float32).to(device, torch.float32).eval()
            import uroman

            self.uroman = uroman.Uroman()
        self.device = device

    # ---- step 1: transcription -------------------------------------------
    def _generate(self, feats, beams: int, lang: str = "bn", **extra):
        kw = dict(max_new_tokens=440, num_beams=beams, **extra)
        code, name = WHISPER_LANG[lang]
        try:
            return self.asr.generate(feats, language=code, task="transcribe", **kw)
        except Exception:
            try:
                ids = self.proc.get_decoder_prompt_ids(language=name, task="transcribe")
                return self.asr.generate(feats, forced_decoder_ids=ids, **kw)
            except Exception:
                return self.asr.generate(feats, **kw)

    def transcribe(self, audio, chunks: list[Chunk], beams: int, progress, cancel, batch: int = 6, lang: str = "bn"):
        import torch

        for i in range(0, len(chunks), batch):
            if cancel():
                raise Cancelled()
            group = chunks[i : i + batch]
            arrays = [audio[c.start : c.end] for c in group]
            feats = self.proc.feature_extractor(arrays, sampling_rate=SR, return_tensors="pt").input_features
            feats = feats.to(self.device, self.asr_dtype)
            with torch.inference_mode():
                ids = self._generate(feats, beams, lang)
            texts = self.proc.batch_decode(ids, skip_special_tokens=True)
            for j, (c, t) in enumerate(zip(group, texts)):
                t = " ".join(t.split())
                if _looks_hallucinated(t):  # repetition loop: retry this chunk with penalties
                    with torch.inference_mode():
                        r = self._generate(feats[j : j + 1], max(beams, 4), lang, no_repeat_ngram_size=4,
                                           repetition_penalty=1.15)
                    t = " ".join(self.proc.batch_decode(r, skip_special_tokens=True)[0].split())
                c.text = t
            progress(min(i + batch, len(chunks)), len(chunks))

    # ---- step 2: forced alignment ------------------------------------------
    def _tokens(self, word: str, lang: str = "bn") -> list[int]:
        if lang == "en":
            rom = self.uroman.romanize_string(spoken_form_en(word), lcode="eng").lower()
        else:
            rom = self.uroman.romanize_string(spoken_form(word), lcode="ben").lower()
        return [self.vocab[ch] for ch in rom if ch in self.vocab and ch != " " and self.vocab[ch] != self.blank]

    def _emissions(self, wav: np.ndarray) -> np.ndarray:
        import torch

        x = torch.from_numpy(wav).float()
        if self.normalize:
            x = (x - x.mean()) / torch.sqrt(x.var() + 1e-7)
        with torch.inference_mode():
            logits = self.aligner(x[None].to(self.device)).logits[0]
        return torch.log_softmax(logits.float(), dim=-1).cpu().numpy()

    def align(self, audio: np.ndarray, chunk: Chunk, lang: str = "bn"):
        raw = chunk.text.split()
        if not raw:
            chunk.words = []
            return
        # Glue stand-alone punctuation (e.g. "।") onto the previous word, as ElevenLabs does.
        texts: list[str] = []
        for w in raw:
            if texts and not any(ch.isalnum() for ch in w):
                texts[-1] += w
            else:
                texts.append(w)
        wav = audio[chunk.start : chunk.end]
        offset = chunk.start / SR
        dur = len(wav) / SR
        toks = [self._tokens(w, lang) for w in texts]
        flat = [t for tk in toks for t in tk]
        spans = None
        if flat:
            emis = self._emissions(wav)
            spans = ctc_align(emis, flat, self.blank)
        sec_per_frame = dur / emis.shape[0] if flat else 0
        words: list[Word] = []
        k = 0
        for w, tk in zip(texts, toks):
            if spans and tk:
                s, _, _ = spans[k]
                _, e, _ = spans[k + len(tk) - 1]
                lp = float(np.mean([spans[j][2] for j in range(k, k + len(tk))]))
                words.append(Word(w, offset + s * sec_per_frame, offset + e * sec_per_frame, lp))
            else:
                words.append(Word(w, -1, -1, 0.0))
            k += len(tk)
        if spans is None:  # alignment impossible: spread words by length
            total = sum(len(w) for w in texts) or 1
            t = offset
            for wd in words:
                d = dur * len(wd.text) / total
                wd.start, wd.end = t, t + d
                t += d
        _fill_missing(words, offset, offset + dur)
        chunk.words = words

    def run(self, path: str, asr_id: str, beams: int, status, cancel, lang: str = "bn") -> tuple[list[Word], float]:
        with self.lock:
            self.load(asr_id, status)
            status("Reading audio…")
            audio = load_audio(path)
            dur = len(audio) / SR
            chunks = split_on_silence(audio, *CHUNK_SECONDS[lang])
            if not chunks:
                return [], dur
            t0 = time.time()

            def prog(i, n):
                eta = (time.time() - t0) / i * (n - i)
                status(f"Transcribing… {i}/{n} parts (about {int(eta)} s left)", 0.05 + 0.75 * i / n)

            status(f"Transcribing… 0/{len(chunks)} parts", 0.05)
            try:
                self.transcribe(audio, chunks, beams, prog, cancel, lang=lang)
            except RuntimeError as e:  # e.g. an MPS kernel not implemented: retry on CPU
                if self.device == "cpu":
                    raise
                status(f"GPU problem ({e.__class__.__name__}); switching to CPU…")
                self.device_pref = "cpu"
                self.asr_id, self.aligner = None, None
                self.load(asr_id, status)
                self.transcribe(audio, chunks, beams, prog, cancel, lang=lang)
            for i, c in enumerate(chunks):
                if cancel():
                    raise Cancelled()
                status(f"Aligning words… {i + 1}/{len(chunks)}", 0.8 + 0.2 * (i + 1) / len(chunks))
                self.align(audio, c, lang)
            words = [w for c in chunks for w in c.words]
            for a, b in zip(words, words[1:]):  # keep strictly ordered
                if b.start < a.end:
                    b.start = a.end
                if b.end < b.start:
                    b.end = b.start
            return words, dur


def _looks_hallucinated(text: str) -> bool:
    b = text.encode("utf-8")
    return len(b) > 120 and len(b) / max(1, len(zlib.compress(b))) > 2.6


def _fill_missing(words: list[Word], lo: float, hi: float):
    """Words that had nothing alignable (symbols etc.) share the gap between neighbours."""
    i = 0
    while i < len(words):
        if words[i].start >= 0:
            i += 1
            continue
        j = i
        while j < len(words) and words[j].start < 0:
            j += 1
        a = words[i - 1].end if i > 0 else lo
        b = words[j].start if j < len(words) else hi
        step = max(0.0, b - a) / (j - i)
        for k in range(i, j):
            words[k].start = a + step * (k - i)
            words[k].end = a + step * (k - i + 1)
        i = j


def ctc_align(logp: np.ndarray, tokens: list[int], blank: int):
    """Viterbi CTC forced alignment. Returns (start_frame, end_frame, mean_logprob)
    per token, or None if the audio is too short for the token sequence."""
    T = logp.shape[0]
    n = len(tokens)
    S = 2 * n + 1
    ext = np.full(S, blank, dtype=np.int64)
    ext[1::2] = tokens
    skip = np.zeros(S, dtype=bool)
    skip[3::2] = ext[3::2] != ext[1:-2:2]
    repeats = int(np.sum(ext[3::2] == ext[1:-2:2]))
    if T < n + repeats:
        return None
    NEG = np.float32(-1e30)
    alpha = np.full(S + 2, NEG, dtype=np.float32)  # 2 leading pads
    alpha[2] = logp[0, ext[0]]
    alpha[3] = logp[0, ext[1]]
    bp = np.zeros((T, S), dtype=np.int8)
    skip_pen = np.where(skip, 0, NEG).astype(np.float32)
    for t in range(1, T):
        a0 = alpha[2:]
        a1 = alpha[1:-1]
        a2 = alpha[:-2] + skip_pen
        stacked = np.stack([a0, a1, a2])
        best = np.argmax(stacked, axis=0)
        bp[t] = best
        alpha[2:] = np.take_along_axis(stacked, best[None], 0)[0] + logp[t, ext]
    s = S - 1 if alpha[S + 1] >= alpha[S] else S - 2
    path = np.empty(T, dtype=np.int64)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= int(bp[t, s])
    spans = []
    for i in range(n):
        f = np.where(path == 2 * i + 1)[0]
        spans.append((int(f[0]), int(f[-1]) + 1, float(logp[f, tokens[i]].mean())))
    return spans


# --------------------------------------------------------------------------
# Export


def to_elevenlabs(words: list[Word], lang: str = "bn") -> dict:
    items = []
    for i, w in enumerate(words):
        if i:
            p = words[i - 1]
            items.append({"text": " ", "start": round(p.end, 3), "end": round(w.start, 3),
                          "type": "spacing", "speaker_id": "speaker_0", "logprob": 0.0})
        items.append({"text": w.text, "start": round(w.start, 3), "end": round(w.end, 3),
                      "type": "word", "speaker_id": "speaker_0", "logprob": round(w.logprob, 4)})
    return {
        "language_code": JSON_LANG.get(lang, lang),
        "language_probability": 1.0,
        "text": " ".join(w.text for w in words),
        "words": items,
    }


def _ts(t: float) -> str:
    ms = int(round(max(0.0, t) * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


# ---- corrections ("wrong words => right words", applied with timing kept) ----

_PUNCT = ',.?!।"\'…:;-'
_PE = re.escape(_PUNCT)


def _nfc(t: str) -> str:
    return unicodedata.normalize("NFC", t)


def _core(t: str) -> str:
    return t.strip(_PUNCT + " ")


def _trail(t: str) -> str:
    m = re.search("[" + _PE + "]+$", t)
    return m.group(0) if m else ""


def _lead(t: str) -> str:
    m = re.match("^[" + _PE + "]+", t)
    return m.group(0) if m else ""


def parse_corrections(text: str) -> list[tuple[list[str], str]]:
    rules = []
    for line in (text or "").splitlines():
        line = line.strip()
        if "=>" not in line or line.startswith("#"):
            continue
        a, b = (_nfc(x.strip()) for x in line.split("=>", 1))
        src = [_core(x) for x in a.split() if _core(x)]
        if src:
            rules.append((src, b))
    rules.sort(key=lambda r: -len(r[0]))  # longest match wins
    return rules


def apply_corrections(words: list[Word], text: str) -> tuple[list[Word], int]:
    """Replace word sequences; a merged item spans first start -> last end.
    An empty replacement deletes the words. Returns (words, number of fixes)."""
    rules = parse_corrections(text)
    words = [Word(_nfc(w.text), w.start, w.end, w.logprob) for w in words]
    if not rules:
        return words, 0
    cores = [_core(w.text) for w in words]
    out, i, fixes = [], 0, 0
    while i < len(words):
        hit = next(((s, t) for s, t in rules if cores[i:i + len(s)] == s), None)
        if not hit:
            out.append(words[i])
            i += 1
            continue
        src, rep = hit
        n = len(src)
        fixes += 1
        if rep:
            tr = _trail(words[i + n - 1].text)
            if rep[-1] in "?।…:!" and tr in (",", ".", "।"):
                tr = ""
            lp = sum(w.logprob for w in words[i:i + n]) / n
            out.append(Word(_lead(words[i].text) + rep + tr, words[i].start, words[i + n - 1].end, lp))
        i += n
    return out, fixes


# ---- subtitles --------------------------------------------------------------

def make_cues(words: list[Word], max_chars: int = 62, max_dur: float = 6.0, pause: float = 0.6,
              soft_chars: int = 30, soft_pause: float = 0.3) -> list[list[Word]]:
    """Group words into subtitle cues: break on a real pause, at ~62 characters or 6 s;
    once a cue passes 30 characters also break at short pauses or sentence ends."""
    res, cur = [], []
    for w in words:
        if not w.text.strip():
            continue
        if cur:
            gap = w.start - cur[-1].end
            txt = " ".join(x.text for x in cur)
            if (gap >= pause or len(txt) + len(w.text) > max_chars or w.end - cur[0].start > max_dur
                    or (len(txt) > soft_chars and (gap >= soft_pause or cur[-1].text[-1:] in ".?!।॥"))):
                res.append(cur)
                cur = []
        cur.append(w)
    if cur:
        res.append(cur)
    return res


def two_lines(text: str, width: int = 40) -> str:
    if len(text) <= width:
        return text
    ws = text.split(" ")
    if len(ws) < 2:
        return text
    j = min(range(1, len(ws)), key=lambda j: abs(len(" ".join(ws[:j])) - len(" ".join(ws[j:]))))
    return " ".join(ws[:j]) + "\n" + " ".join(ws[j:])


def cue_times(cues: list[list[Word]], min_dur: float = 0.5, linger: float = 0.2) -> list[tuple[float, float]]:
    """Exact word times, but very short cues get a little extra screen time
    (never overlapping the next cue)."""
    times = []
    for i, c in enumerate(cues):
        s, e = c[0].start, c[-1].end
        nxt = cues[i + 1][0].start if i + 1 < len(cues) else float("inf")
        want = max(e + linger, s + min_dur) if e - s < min_dur else e
        e = max(e, min(want, nxt - 0.001))
        times.append((s, max(e, s + 0.001)))
    return times


def to_srt(words: list[Word], lang: str = "bn") -> str:
    max_chars, width = SUB_LAYOUT.get(lang, SUB_LAYOUT["bn"])
    cues = make_cues(words, max_chars=max_chars)
    out = []
    for n, (c, (s, e)) in enumerate(zip(cues, cue_times(cues)), 1):
        out.append(f"{n}\n{_ts(s)} --> {_ts(e)}\n{two_lines(' '.join(x.text for x in c), width)}\n")
    return "\n".join(out)


def write_outputs(words: list[Word], audio_path: str, out_dir: str | None,
                  srt: bool = True, json_out: bool = True, txt: bool = False, lang: str = "bn") -> dict:
    src = Path(audio_path)
    folder = Path(out_dir) if out_dir else src.parent
    folder.mkdir(parents=True, exist_ok=True)
    out = {}
    if srt:
        out["srt"] = str(folder / f"{src.stem}.srt")
        Path(out["srt"]).write_text(to_srt(words, lang), encoding="utf-8")
    if json_out:
        out["json"] = str(folder / f"{src.stem}.json")
        Path(out["json"]).write_text(json.dumps(to_elevenlabs(words, lang), ensure_ascii=False, indent=2), encoding="utf-8")
    if txt:
        out["txt"] = str(folder / f"{src.stem}.txt")
        Path(out["txt"]).write_text(" ".join(w.text for w in words) + "\n", encoding="utf-8")
    return out
