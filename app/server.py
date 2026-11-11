"""Local HTTP server behind the app window: job queue, worker thread, audio streaming."""

from __future__ import annotations

import json
import mimetypes
import os
import subprocess
import sys
import threading
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import engine

UI_DIR = Path(__file__).resolve().parent / "ui"
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff", ".aif",
             ".mp4", ".mov", ".mkv", ".webm", ".m4v"}
SUPPORT = Path.home() / "Library" / "Application Support" / "Bangla Transcriber"
SETTINGS_FILE = SUPPORT / "settings.json"
CORRECTIONS_FILES = {"bn": SUPPORT / "corrections.txt", "en": SUPPORT / "corrections-en.txt"}
CORRECTIONS_HELP = {
    "bn": """# Bangla corrections: one per line, wrong => right
# They are applied to every new Bangla transcript, and the word timing is kept.
# Several words can be replaced at once, and an empty right side deletes the words.
# Examples:
# বেনে জেসারিট => বেনে জেসেরিট
# ডেলিগেট প্যালেস => ডেলিকেট ব্যালান্স
# একসময় একসময় => একসময়
""",
    "en": """# English corrections: one per line, wrong => right
# They are applied to every new English transcript, and the word timing is kept.
# Matching is case-sensitive. Several words can be replaced at once.
# Examples:
# Bene Jesserit => Bene Gesserit
# Atreidis => Atreides
""",
}


def detect_lang(data, words) -> str:
    code = str(data.get("language_code", "") if isinstance(data, dict) else "").lower()
    if code in ("en", "eng", "english"):
        return "en"
    if code in ("bn", "ben", "bengali", "bangla"):
        return "bn"
    text = " ".join(w.text for w in words[:200])
    bangla = sum("\u0980" <= ch <= "\u09ff" for ch in text)
    latin = sum(ch.isascii() and ch.isalpha() for ch in text)
    return "bn" if bangla >= latin else "en"


def load_words_json(path: str) -> tuple[list, str]:
    """Read an ElevenLabs-style JSON (word items with start/end) back into Words, plus its language."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    items = data.get("words") if isinstance(data, dict) else data
    words = []
    for w in items or []:
        if w.get("type", "word") == "word" and str(w.get("text", "")).strip():
            words.append(engine.Word(str(w["text"]).strip(), float(w["start"]), float(w["end"]), float(w.get("logprob", 0) or 0)))
    if not words:
        raise ValueError("This JSON has no word timestamps")
    return words, detect_lang(data, words)


class State:
    def __init__(self):
        self.lock = threading.Lock()
        self.jobs: dict[str, dict] = {}
        self.order: list[str] = []
        self.running = False
        self.cancel = False
        self.status = "Ready"
        self.settings = {"lang": "bn", "models": dict(engine.DEFAULT_MODELS), "beams": 5, "out_dir": "",
                         "srt": True, "json": True, "txt": False}
        try:
            saved = json.loads(SETTINGS_FILE.read_text())
            saved.pop("srt", None)  # subtitles are now always on by default
            if "model" in saved:  # settings from version 1.0/1.1
                old = saved.pop("model")
                if old in engine.ASR_MODELS["bn"]:
                    saved.setdefault("models", {})["bn"] = old
            models = {**engine.DEFAULT_MODELS, **saved.pop("models", {})}
            self.settings.update(saved)
            self.settings["models"] = {k: v if v in engine.ASR_MODELS[k] else engine.DEFAULT_MODELS[k]
                                       for k, v in models.items() if k in engine.ASR_MODELS}
            if self.settings["lang"] not in engine.LANGUAGES:
                self.settings["lang"] = "bn"
        except Exception:
            pass
        self.corrections = {}
        for lang, f in CORRECTIONS_FILES.items():
            try:
                self.corrections[lang] = f.read_text(encoding="utf-8")
            except Exception:
                self.corrections[lang] = CORRECTIONS_HELP[lang]
        self.engine = engine.Engine(os.environ.get("BT_DEVICE", "auto"))
        self.picker = None  # set by main.py when a native window exists

    def save_settings(self):
        try:
            SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
            SETTINGS_FILE.write_text(json.dumps(self.settings, indent=2))
        except Exception:
            pass

    def save_corrections(self, lang):
        try:
            SUPPORT.mkdir(parents=True, exist_ok=True)
            CORRECTIONS_FILES[lang].write_text(self.corrections[lang], encoding="utf-8")
        except Exception:
            pass

    def write(self, job):
        """(Re)write the output files of a finished job from its current words."""
        s, lang = self.settings, job["lang"]
        if job.get("kind") == "json":  # never overwrite the JSON the user gave us
            src = Path(job["path"])
            job["outputs"] = engine.write_outputs(job["_words"], str(src), s["out_dir"] or str(src.parent),
                                                  True, False, s["txt"], lang)
            if s["json"]:
                fixed = (Path(s["out_dir"]) if s["out_dir"] else src.parent) / f"{src.stem}_corrected.json"
                fixed.write_text(json.dumps(engine.to_elevenlabs(job["_words"], lang), ensure_ascii=False, indent=2),
                                 encoding="utf-8")
                job["outputs"]["json"] = str(fixed)
        else:
            job["outputs"] = engine.write_outputs(job["_words"], job["path"], s["out_dir"] or None,
                                                  s["srt"] or not (s["json"] or s["txt"]), s["json"], s["txt"], lang)
        job["words"] = len(job["_words"])
        job["cues"] = len(engine.make_cues(job["_words"], max_chars=engine.SUB_LAYOUT[lang][0]))
        job["rev"] = job.get("rev", 0) + 1  # tells the window to redraw
        job["message"] = f"{job['cues']} subtitles · {job['words']} words"

    def import_json(self, job):
        words, lang = load_words_json(job["path"])
        job["lang"] = lang
        words, fixes = engine.apply_corrections(words, self.corrections[lang])
        job["_words"] = words
        self.write(job)
        job.update(status="done", progress=1.0, fixes=fixes)

    def add(self, paths):
        files = []
        for p in paths:
            p = Path(p).expanduser()
            files += sorted(p.iterdir()) if p.is_dir() else [p]
        added = []
        with self.lock:
            known = {j["path"] for j in self.jobs.values()}
            for p in map(str, files):
                ext = Path(p).suffix.lower()
                if ext not in AUDIO_EXT | {".json"} or not os.path.isfile(p) or p in known:
                    continue
                if ext == ".json" and Path(p).stem.endswith("_corrected"):
                    continue
                jid = uuid.uuid4().hex[:10]
                job = {"id": jid, "path": p, "name": Path(p).name, "status": "queued", "kind": "audio",
                       "progress": 0.0, "message": "", "outputs": {}, "error": "", "audio": p,
                       "lang": self.settings["lang"], "rev": 0}
                if ext == ".json":
                    # An existing transcript JSON: make subtitles from it straight away.
                    audio = next((str(Path(p).with_suffix(e)) for e in sorted(AUDIO_EXT)
                                  if Path(p).with_suffix(e).exists()), "")
                    job.update(kind="json", audio=audio)
                    try:
                        self.import_json(job)
                    except Exception as e:
                        job.update(status="error", error=f"{e.__class__.__name__}: {e}", message="Failed")
                self.jobs[jid] = job
                self.order.append(jid)
                known.add(p)
                added.append(jid)
        return added

    def snapshot(self):
        with self.lock:
            jobs = [{k: v for k, v in self.jobs[j].items() if not k.startswith("_")} for j in self.order]
            return {"jobs": jobs, "running": self.running,
                    "status": self.status, "settings": self.settings, "native": self.picker is not None,
                    "models": engine.ASR_MODELS, "languages": engine.LANGUAGES,
                    "models_ready": engine.model_available(self.settings["models"][self.settings["lang"]])
                    and engine.model_available(engine.ALIGN_MODEL)}

    def start(self):
        with self.lock:
            if self.running:
                return
            self.running, self.cancel = True, False
        threading.Thread(target=self._work, daemon=True).start()

    def _work(self):
        try:
            while True:
                with self.lock:
                    jid = next((j for j in self.order if self.jobs[j]["status"] == "queued"
                                and self.jobs[j].get("kind") != "json"), None)
                    if jid is None or self.cancel:
                        break
                    job = self.jobs[jid]
                    job.update(status="working", progress=0.0, message="Starting…", error="")
                    self.status = f"{job['name']}: Starting…"
                    s = dict(self.settings)

                def status(msg, frac=None, job=job):
                    with self.lock:
                        job["message"] = msg
                        if frac is not None:
                            job["progress"] = frac
                        self.status = f"{job['name']}: {msg}"

                try:
                    lang = job["lang"]
                    words, dur = self.engine.run(job["path"], s["models"][lang], int(s["beams"]), status,
                                                 lambda: self.cancel, lang)
                    words, fixes = engine.apply_corrections(words, self.corrections[lang])
                    with self.lock:
                        job["_words"] = words
                        self.write(job)
                        job.update(status="done", progress=1.0, duration=dur, fixes=fixes)
                except engine.Cancelled:
                    with self.lock:
                        job.update(status="queued", progress=0.0, message="Cancelled")
                except Exception as e:
                    traceback.print_exc()
                    with self.lock:
                        job.update(status="error", error=f"{e.__class__.__name__}: {e}", message="Failed")
        finally:
            with self.lock:
                self.running = False
                self.status = "Ready"


STATE = State()


def result_payload(job):
    words, lang = job["_words"], job["lang"]
    cues = engine.make_cues(words, max_chars=engine.SUB_LAYOUT[lang][0])
    index = {id(w): k for k, w in enumerate(words)}
    out = []
    for c, (s, e) in zip(cues, engine.cue_times(cues)):
        out.append({"start": round(s, 3), "end": round(e, 3),
                    "words": [{"i": index[id(w)], "text": w.text, "start": round(w.start, 3),
                               "end": round(w.end, 3), "lp": round(w.logprob, 2)} for w in c]})
    return {"cues": out, "srt": engine.to_srt(words, lang), "json": engine.to_elevenlabs(words, lang),
            "outputs": job["outputs"], "lang": lang, "rev": job.get("rev", 0)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _query(self):
        from urllib.parse import parse_qs, urlsplit

        return {k: v[0] for k, v in parse_qs(urlsplit(self.path).query).items()}

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        p = self.path.split("?")[0]
        if p in ("/", "/index.html"):
            return self._file(UI_DIR / "index.html")
        if p == "/icon.png":
            return self._file(UI_DIR / "icon.png")
        if p == "/api/state":
            return self._json(STATE.snapshot())
        if p == "/api/corrections":
            lang = self._query().get("lang", STATE.settings["lang"])
            lang = lang if lang in CORRECTIONS_FILES else "bn"
            return self._json({"text": STATE.corrections[lang], "file": str(CORRECTIONS_FILES[lang]), "lang": lang})
        if p.startswith("/api/result/"):
            job = STATE.jobs.get(p.rsplit("/", 1)[-1])
            if not job or "_words" not in job:
                return self._json({"error": "not found"}, 404)
            return self._json(result_payload(job))
        if p.startswith("/api/file/"):  # /api/file/<id>/<srt|json|txt>
            _, _, _, jid, kind = p.split("/")
            job = STATE.jobs.get(jid)
            if not job or kind not in job["outputs"]:
                return self._json({"error": "not found"}, 404)
            return self._file(Path(job["outputs"][kind]), "text/plain; charset=utf-8")
        if p.startswith("/media/"):
            job = STATE.jobs.get(p.rsplit("/", 1)[-1])
            if not job or not job.get("audio"):
                return self._json({"error": "not found"}, 404)
            return self._file(Path(job["audio"]), ranged=True)
        self._json({"error": "not found"}, 404)

    def do_POST(self):
        p, b = self.path, self._body()
        if p == "/api/add":
            return self._json({"added": STATE.add(b.get("paths", []))})
        if p == "/api/pick":
            if not STATE.picker:
                return self._json({"error": "native dialogs unavailable"}, 400)
            return self._json({"added": STATE.add(STATE.picker("files") or [])})
        if p == "/api/pick_folder":
            if not STATE.picker:
                return self._json({"error": "native dialogs unavailable"}, 400)
            res = STATE.picker("folder")
            if res:
                STATE.settings["out_dir"] = res[0]
                STATE.save_settings()
            return self._json({"out_dir": STATE.settings["out_dir"]})
        if p == "/api/settings":
            with STATE.lock:
                for k in ("beams", "out_dir", "srt", "json", "txt"):
                    if k in b:
                        STATE.settings[k] = b[k]
                if b.get("lang") in engine.LANGUAGES:  # applies to files added from now on
                    STATE.settings["lang"] = b["lang"]
                lang = STATE.settings["lang"]
                if b.get("model") in engine.ASR_MODELS[lang]:
                    STATE.settings["models"][lang] = b["model"]
            STATE.save_settings()
            return self._json(STATE.settings)
        if p == "/api/start":
            with STATE.lock:
                for j in STATE.jobs.values():
                    if not (b.get("redo") and j["id"] in b["redo"] or j["status"] == "error"):
                        continue
                    if j.get("kind") == "json":
                        try:
                            STATE.import_json(j)
                            j["error"] = ""
                        except Exception as e:
                            j.update(status="error", error=f"{e.__class__.__name__}: {e}", message="Failed")
                    else:
                        j.update(status="queued", progress=0.0, message="", error="")
            STATE.start()
            return self._json({"ok": True})
        if p == "/api/job_lang":  # language of one file; a finished file is transcribed again
            with STATE.lock:
                job = STATE.jobs.get(b.get("id"))
                if not job or b.get("lang") not in engine.LANGUAGES or job["kind"] != "audio" or job["status"] == "working":
                    return self._json({"error": "cannot change"}, 400)
                job["lang"] = b["lang"]
                if job["status"] == "done":
                    job.update(status="queued", progress=0.0, message="", error="")
            return self._json({"ok": True})
        if p == "/api/edit":  # change one word (timing kept); optionally remember the fix
            with STATE.lock:
                job = STATE.jobs.get(b.get("id"))
                if not job or "_words" not in job:
                    return self._json({"error": "not found"}, 404)
                words = job["_words"]
                i, j = int(b["index"]), int(b.get("end", b["index"]))
                if not (0 <= i <= j < len(words)):
                    return self._json({"error": "bad index"}, 400)
                old = " ".join(w.text for w in words[i:j + 1])
                new = " ".join(str(b.get("text", "")).split())
                merged = engine.Word(new, words[i].start, words[j].end, words[i].logprob)
                job["_words"] = words[:i] + ([merged] if new else []) + words[j + 1:]
                if b.get("remember") and engine._core(old) and engine._core(old) != engine._core(new):
                    lang = job["lang"]
                    rule = f"{' '.join(engine._core(x) for x in old.split())} => {engine._core(new) if new else ''}"
                    if rule not in STATE.corrections[lang].splitlines():
                        STATE.corrections[lang] = STATE.corrections[lang].rstrip("\n") + "\n" + rule + "\n"
                        STATE.save_corrections(lang)
                STATE.write(job)
                return self._json(result_payload(job))
        if p == "/api/corrections":
            with STATE.lock:
                lang = b.get("lang") if b.get("lang") in CORRECTIONS_FILES else STATE.settings["lang"]
                STATE.corrections[lang] = str(b.get("text", ""))
                STATE.save_corrections(lang)
                fixed = 0
                if b.get("apply"):  # re-apply to every finished file in this language
                    for job in STATE.jobs.values():
                        if "_words" in job and job["lang"] == lang:
                            job["_words"], n = engine.apply_corrections(job["_words"], STATE.corrections[lang])
                            fixed += n
                            STATE.write(job)
            return self._json({"ok": True, "fixes": fixed})
        if p == "/api/rewrite":  # output options changed: rewrite finished files
            with STATE.lock:
                for job in STATE.jobs.values():
                    if "_words" in job:
                        STATE.write(job)
            return self._json({"ok": True})
        if p == "/api/cancel":
            STATE.cancel = True
            return self._json({"ok": True})
        if p == "/api/remove":
            with STATE.lock:
                for jid in b.get("ids", []):
                    if jid in STATE.jobs and STATE.jobs[jid]["status"] != "working":
                        STATE.jobs.pop(jid)
                        STATE.order.remove(jid)
            return self._json({"ok": True})
        if p == "/api/reveal":
            target = b.get("path")
            if target and sys.platform == "darwin":
                subprocess.Popen(["open", "-R", target])
            return self._json({"ok": True})
        self._json({"error": "not found"}, 404)

    def _file(self, path: Path, ctype=None, ranged=False):
        try:
            size = path.stat().st_size
        except OSError:
            return self._json({"error": "missing"}, 404)
        ctype = ctype or mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        start, end = 0, size - 1
        rng = self.headers.get("Range") if ranged else None
        if rng and rng.startswith("bytes="):
            a, _, z = rng[6:].split(",")[0].partition("-")
            if a:
                start, end = int(a), min(int(z) if z else size - 1, size - 1)
            else:
                start = max(0, size - int(z))
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        try:
            with open(path, "rb") as f:
                f.seek(start)
                left = end - start + 1
                while left > 0:
                    buf = f.read(min(1 << 16, left))
                    if not buf:
                        break
                    self.wfile.write(buf)
                    left -= len(buf)
        except (BrokenPipeError, ConnectionResetError):
            pass


def serve(port: int = 0) -> tuple[ThreadingHTTPServer, int]:
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]
