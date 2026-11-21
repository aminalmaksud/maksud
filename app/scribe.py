"""ElevenLabs Scribe (online speech-to-text) as an alternative to the on-device models.

The audio is converted to a small mono file first (a video's picture is never uploaded), sent to
POST https://api.elevenlabs.io/v1/speech-to-text with word timestamps, and the reply's words are used as
they are (ElevenLabs already gives word-level timing). The API key is kept in the macOS Keychain.
"""

from __future__ import annotations

import http.client
import json
import os
import ssl
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

import numpy as np

API_HOST = "api.elevenlabs.io"
PREFIX = "elevenlabs:"
MODELS = {"scribe_v3": "ElevenLabs Scribe v3 (online, uses your credits)",
          "scribe_v2": "ElevenLabs Scribe v2 (online, uses your credits)"}
FALLBACK = {"scribe_v3": "scribe_v2"}  # if an account cannot use v3 yet
LANG_CODE = {"bn": "ben", "en": "eng"}
KEYCHAIN_SERVICE = "Bangla Transcriber ElevenLabs API key"
KEYCHAIN_ACCOUNT = "elevenlabs"
KEY_FILE = Path.home() / "Library" / "Application Support" / "Bangla Transcriber" / "elevenlabs-key"


class ScribeError(Exception):
    def __init__(self, message: str, status: int = 0, body: bytes = b""):
        super().__init__(message)
        self.status, self.body = status, body


def is_cloud(model_id: str) -> bool:
    return str(model_id).startswith(PREFIX)


# ---- API key ------------------------------------------------------------------------

_cached: str | None = None  # the window asks often; the Keychain is read once


def get_key() -> str:
    global _cached
    if _cached is None:
        _cached = _read_key()
    return _cached


def _read_key() -> str:
    if os.environ.get("ELEVENLABS_API_KEY"):
        return os.environ["ELEVENLABS_API_KEY"].strip()
    if sys.platform == "darwin":
        try:
            r = subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"],
                               capture_output=True, text=True, timeout=10)
            if r.returncode == 0 and r.stdout.strip():
                return r.stdout.strip()
        except Exception:
            pass
    try:
        return KEY_FILE.read_text().strip()
    except Exception:
        return ""


def set_key(key: str):
    global _cached
    key = key.strip()
    _cached = key
    if sys.platform == "darwin":
        r = subprocess.run(["security", "add-generic-password", "-U", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT,
                            "-w", key], capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            KEY_FILE.unlink(missing_ok=True)
            return
    KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(key)


def delete_key():
    global _cached
    _cached = ""
    if sys.platform == "darwin":
        subprocess.run(["security", "delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT],
                       capture_output=True, timeout=10)
    KEY_FILE.unlink(missing_ok=True)


def key_hint() -> str:
    k = get_key()
    return f"…{k[-4:]}" if len(k) >= 8 else ("set" if k else "")


# ---- HTTP -----------------------------------------------------------------------------

def _connection(timeout: float):
    ctx = ssl.create_default_context()
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        p = urlsplit(proxy if "://" in proxy else "http://" + proxy)
        conn = http.client.HTTPSConnection(p.hostname, p.port or 80, timeout=timeout, context=ctx)
        conn.set_tunnel(API_HOST, 443)
        return conn
    return http.client.HTTPSConnection(API_HOST, 443, timeout=timeout, context=ctx)


def _error_text(status: int, body: bytes) -> str:
    try:
        d = json.loads(body)
        det = d.get("detail", d)
        if isinstance(det, dict):
            msg = det.get("message") or det.get("status") or json.dumps(det)
        elif isinstance(det, list):
            msg = "; ".join(str(x.get("msg", x)) if isinstance(x, dict) else str(x) for x in det)
        else:
            msg = str(det)
    except Exception:
        msg = body[:300].decode("utf-8", "replace")
    if status == 401:
        return f"ElevenLabs did not accept the API key ({msg}). Check it under ElevenLabs → Developers → API keys."
    if status == 402 or "quota" in msg.lower() or "credits" in msg.lower():
        return f"Your ElevenLabs account is out of credits or over its limit ({msg})."
    if status == 429:
        return f"ElevenLabs is busy or your plan's limit was reached; try again in a minute ({msg})."
    return f"ElevenLabs error {status}: {msg}"


def check_key(key: str) -> tuple[bool, str]:
    """Quick check that ElevenLabs accepts the key (no credits are used)."""
    try:
        conn = _connection(20)
        conn.request("GET", "/v1/models", headers={"xi-api-key": key.strip()})
        r = conn.getresponse()
        body = r.read()
        conn.close()
    except Exception as e:
        return False, f"Could not reach ElevenLabs: {e}"
    if r.status == 200:
        return True, "Key works"
    if r.status == 401 and b"missing_permissions" in body:
        return True, "Key accepted (it has limited permissions, which is fine if Speech to Text is allowed)"
    return False, _error_text(r.status, body)


# ---- audio ---------------------------------------------------------------------------

def make_upload_file(audio16k: np.ndarray, sr: int = 16000) -> Path:
    """Small mono AAC file of the audio (about 0.4 MB per minute)."""
    import av

    tmp = Path(tempfile.mkdtemp(prefix="bt-scribe-")) / "audio.m4a"
    out = av.open(str(tmp), "w")
    s = out.add_stream("aac", rate=sr)
    s.layout = "mono"
    s.bit_rate = 48000
    rs = av.AudioResampler(format="fltp", layout="mono", rate=sr)
    for i in range(0, len(audio16k), sr * 10):
        f = av.AudioFrame.from_ndarray(np.ascontiguousarray(audio16k[None, i:i + sr * 10], dtype=np.float32),
                                       format="fltp", layout="mono")
        f.sample_rate = sr
        for g in rs.resample(f):
            for p in s.encode(g):
                out.mux(p)
    for g in rs.resample(None):
        for p in s.encode(g):
            out.mux(p)
    for p in s.encode(None):
        out.mux(p)
    out.close()
    return tmp


def _post(path: Path, fields: dict, key: str, status, cancel) -> dict:
    boundary = "----bt" + uuid.uuid4().hex
    head = b"".join(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
        for k, v in fields.items() if v is not None)
    head += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.m4a"\r\n'
             f"Content-Type: audio/mp4\r\n\r\n").encode()
    tail = f"\r\n--{boundary}--\r\n".encode()
    size = path.stat().st_size
    total = len(head) + size + len(tail)
    conn = _connection(3600)
    try:
        conn.putrequest("POST", "/v1/speech-to-text")
        conn.putheader("xi-api-key", key)
        conn.putheader("Content-Type", f"multipart/form-data; boundary={boundary}")
        conn.putheader("Content-Length", str(total))
        conn.putheader("Accept", "application/json")
        conn.endheaders()
        conn.send(head)
        sent = 0
        with open(path, "rb") as f:
            while True:
                if cancel():
                    raise InterruptedError
                buf = f.read(1 << 18)
                if not buf:
                    break
                conn.send(buf)
                sent += len(buf)
                status(f"Uploading to ElevenLabs… {sent * 100 // size}%", 0.05 + 0.35 * sent / size)
        conn.send(tail)
        status("ElevenLabs is transcribing… (this usually takes a fraction of the audio's length)", 0.45)
        r = conn.getresponse()
        body = r.read()
    finally:
        conn.close()
    if r.status != 200:
        raise ScribeError(_error_text(r.status, body), r.status, body)
    return json.loads(body)


def transcribe(path: str, model_id: str, lang: str, status, cancel):
    """Returns (words, duration) like Engine.run."""
    import engine

    key = get_key()
    if not key:
        raise ScribeError("No ElevenLabs API key yet. Click “Set API key…” under the model list.")
    model = model_id[len(PREFIX):] if is_cloud(model_id) else model_id
    status("Reading audio…", 0.01)
    audio = engine.load_audio(path)
    dur = len(audio) / engine.SR
    up = make_upload_file(audio)
    try:
        fields = {"model_id": model, "language_code": LANG_CODE.get(lang, lang), "timestamps_granularity": "word",
                  "tag_audio_events": "false", "diarize": "false"}
        t0 = time.time()
        try:
            data = _post(up, fields, key, status, cancel)
        except ScribeError as e:
            if model in FALLBACK and e.status in (400, 404, 422) and b"model" in e.body.lower():
                status(f"{model} is not available for this account; using {FALLBACK[model]}…", 0.05)
                data = _post(up, {**fields, "model_id": FALLBACK[model]}, key, status, cancel)
            else:
                raise
        status(f"Received the transcript ({time.time() - t0:.0f} s)", 0.95)
    finally:
        try:
            up.unlink(missing_ok=True)
            up.parent.rmdir()
        except Exception:
            pass
    return words_from_response(data), dur


def words_from_response(data) -> list:
    import engine

    words = []
    for w in data.get("words") or []:
        if w.get("type", "word") != "word" or not str(w.get("text", "")).strip():
            continue
        start = float(w.get("start") or 0.0)
        end = float(w.get("end") or start)
        words.append(engine.Word(str(w["text"]).strip(), start, max(end, start), float(w.get("logprob") or 0.0)))
    for a, b in zip(words, words[1:]):  # keep strictly ordered
        if b.start < a.end:
            b.start = a.end
        if b.end < b.start:
            b.end = b.start
    return words
