"""Local HTTP server behind the app window: job queue, worker thread, audio streaming."""

from __future__ import annotations

import json
import mimetypes
import os
import subprocess
import sys
import threading
import time
import traceback
import base64
import tempfile
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import cutter
import engine
import sections

UI_DIR = Path(__file__).resolve().parent / "ui"
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff", ".aif",
             ".mp4", ".mov", ".mkv", ".webm", ".m4v"}
SUPPORT = Path.home() / "Library" / "Application Support" / "Bangla Transcriber"
SETTINGS_FILE = SUPPORT / "settings.json"
HISTORY_FILE = SUPPORT / "history.json"
HISTORY_KEEP_DAYS = 60
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
                         "srt": True, "json": True, "txt": False, "max_gap": cutter.DEFAULT_GAP}
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
        try:
            self.history = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        except Exception:
            self.history = []
        cutoff = time.time() - HISTORY_KEEP_DAYS * 86400
        self.history = [h for h in self.history if h.get("finished", 0) >= cutoff]
        self.engine = engine.Engine(os.environ.get("BT_DEVICE", "auto"))
        self.picker = None  # set by main.py when a native window exists

    def save_settings(self):
        try:
            SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
            SETTINGS_FILE.write_text(json.dumps(self.settings, indent=2))
        except Exception:
            pass

    def save_history(self):
        try:
            SUPPORT.mkdir(parents=True, exist_ok=True)
            HISTORY_FILE.write_text(json.dumps(self.history, ensure_ascii=False, indent=1), encoding="utf-8")
        except Exception:
            pass

    def record(self, job):
        """Add or update this file's entry in the History list."""
        entry = next((h for h in self.history if h["id"] == job.get("hid")), None)
        if entry is None:
            job["hid"] = uuid.uuid4().hex[:12]
            entry = {"id": job["hid"]}
            self.history.insert(0, entry)
        entry.update(name=job["name"], source=job["path"], audio=job.get("audio", ""), lang=job["lang"],
                     kind=job["kind"], outputs=dict(job["outputs"]), cues=job.get("cues", 0),
                     words=job.get("words", 0), duration=job.get("duration"), finished=time.time())
        cut = job.get("cut") or {}
        if cut.get("state") == "done":
            entry["cut"] = {k: cut[k] for k in ("path", "srt", "json", "removed", "before", "after") if k in cut}
        secs = job.get("sections") or {}
        if secs.get("state") == "done":
            entry["sections"] = {"folder": secs["folder"], "count": len(secs["items"])}
        self.history.sort(key=lambda h: -h.get("finished", 0))
        self.save_history()

    def out_folder(self, job) -> Path:
        src = Path(job["path"])
        return Path(job["out_dir"]) if job.get("out_dir") else src.parent

    def save_corrections(self, lang):
        try:
            SUPPORT.mkdir(parents=True, exist_ok=True)
            CORRECTIONS_FILES[lang].write_text(self.corrections[lang], encoding="utf-8")
        except Exception:
            pass

    def write(self, job):
        """(Re)write the output files of a finished job from its current words."""
        s, lang = self.settings, job["lang"]
        folder = self.out_folder(job)
        if job.get("kind") == "json":  # never overwrite the JSON the user gave us
            src = Path(job["path"])
            job["outputs"] = engine.write_outputs(job["_words"], str(src), str(folder), True, False, s["txt"], lang)
            if s["json"]:
                fixed = folder / f"{src.stem}_corrected.json"
                fixed.write_text(json.dumps(engine.to_elevenlabs(job["_words"], lang), ensure_ascii=False, indent=2),
                                 encoding="utf-8")
                job["outputs"]["json"] = str(fixed)
        else:
            job["outputs"] = engine.write_outputs(job["_words"], job["path"], str(folder),
                                                  s["srt"] or not (s["json"] or s["txt"]), s["json"], s["txt"], lang)
        self.write_cut_subs(job)
        job["words"] = len(job["_words"])
        job["cues"] = len(engine.make_cues(job["_words"], max_chars=engine.SUB_LAYOUT[lang][0]))
        job["rev"] = job.get("rev", 0) + 1  # tells the window to redraw
        if job.get("status") == "done" or job.get("kind") == "json":
            self.record(job)
        job["message"] = f"{job['cues']} subtitles · {job['words']} words"

    def write_cut_subs(self, job):
        """Subtitles for the shortened copy: same words, moved to its timeline (kept up to date after edits)."""
        cut = job.get("cut") or {}
        if cut.get("state") != "done" or "_cuts" not in job:
            return
        s = self.settings
        outs = engine.write_outputs(cutter.shift_words(job["_words"], job["_cuts"]), cut["path"],
                                    str(Path(cut["path"]).parent), True, s["json"], False, job["lang"])
        cut.update(srt=outs.get("srt", ""), json=outs.get("json", ""))

    def cut(self, job, max_gap):
        """Make '<name>-shortened' with every pause longer than max_gap shortened to max_gap."""
        def progress(f):
            job["cut"]["progress"] = round(f, 3)
        try:
            folder = str(self.out_folder(job))
            res = cutter.cut_file(job["audio"], list(job["_words"]), folder, max_gap, progress)
            with self.lock:
                job["_cuts"] = res["cut_list"]
                job["cut"] = {"state": "done", "path": res["path"], "cuts": res["cuts"], "removed": res["removed"],
                              "before": res["before"], "after": res["after"], "gap": max_gap}
                self.write_cut_subs(job)
                job["rev"] = job.get("rev", 0) + 1
                self.record(job)
        except Exception as e:
            traceback.print_exc()
            with self.lock:
                job["cut"] = {"state": "error", "error": f"{e.__class__.__name__}: {e}"}

    def split_sections(self, job, plan, use_short):
        """Save every section of the plan as its own audio/video file (plus .srt/.json) in one folder."""
        try:
            words, lang, s = list(job["_words"]), job["lang"], self.settings
            src, cuts = job["audio"], None
            if use_short and (job.get("cut") or {}).get("state") == "done" and os.path.exists(job["cut"]["path"]):
                src, cuts = job["cut"]["path"], job.get("_cuts") or []
            folder = self.out_folder(job) / sections.safe_name(f"{Path(src).stem} - sections")
            folder.mkdir(parents=True, exist_ok=True)
            items, total = [], len(plan)
            ext = cutter.output_path(src, str(folder))[0].suffix
            for i, sec in enumerate(plan):
                a, b = sec["start"], sec["end"]
                if cuts is not None:
                    a, b = cutter.map_time(a, cuts), cutter.map_time(b, cuts)
                name = sections.safe_name(f"{sec['n']:02d} - {sec['title']}")
                dst = folder / f"{name}{ext}"

                def prog(f, i=i):
                    job["sections"]["progress"] = round((i + f) / total, 3)
                cutter.extract(src, dst, a, b, prog)
                check = cutter.check_piece(str(dst), b - a)
                seg = words[sec["first"]: sec["last"] + 1]
                if cuts is not None:
                    seg = cutter.shift_words(seg, cuts)
                seg = [engine.Word(w.text, round(w.start - a, 3), round(w.end - a, 3), w.logprob) for w in seg]
                outs = engine.write_outputs(seg, str(dst), str(folder), True, s["json"], False, lang)
                items.append({"n": sec["n"], "title": sec["title"], "path": str(dst), "srt": outs.get("srt", ""),
                              "start": round(a, 2), "end": round(b, 2), "match": sec["match"], "ok": sec["ok"], **check})
                job["sections"]["items"] = list(items)
            with self.lock:
                job["sections"] = {"state": "done", "folder": str(folder), "items": items, "progress": 1.0}
                job["rev"] = job.get("rev", 0) + 1
                self.record(job)
        except Exception as e:
            traceback.print_exc()
            with self.lock:
                job["sections"] = {"state": "error", "error": f"{e.__class__.__name__}: {e}"}
                job["rev"] = job.get("rev", 0) + 1

    def import_json(self, job):
        words, lang = load_words_json(job["path"])
        job["lang"] = lang
        words, fixes = engine.apply_corrections(words, self.corrections[lang])
        job["_words"] = words
        job.update(status="done", progress=1.0, fixes=fixes)
        self.write(job)

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
                       "lang": self.settings["lang"], "rev": 0, "out_dir": self.settings["out_dir"]}
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
                        job.update(status="done", progress=1.0, duration=dur, fixes=fixes)
                        self.write(job)
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
        if p == "/api/history":
            days = float(self._query().get("days", 7))
            cutoff = time.time() - days * 86400
            items = []
            for h in STATE.history:
                if h.get("finished", 0) < cutoff:
                    continue
                outs = {k: v for k, v in h.get("outputs", {}).items()}
                items.append({**h, "exists": {k: os.path.exists(v) for k, v in outs.items()},
                              "folder": str(Path(next(iter(outs.values()))).parent) if outs else ""})
            return self._json({"items": items})
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
        if p == "/api/cut":  # shorten long pauses in this file's audio/video
            with STATE.lock:
                job = STATE.jobs.get(b.get("id"))
                if not job or "_words" not in job:
                    return self._json({"error": "Transcribe this file first."}, 400)
                if not job.get("audio") or not os.path.exists(job["audio"]):
                    return self._json({"error": "The audio file for this transcript was not found."}, 400)
                if (job.get("cut") or {}).get("state") == "working":
                    return self._json({"error": "Already cutting this file."}, 400)
                try:
                    gap = float(b.get("gap", STATE.settings.get("max_gap", cutter.DEFAULT_GAP)))
                except (TypeError, ValueError):
                    gap = cutter.DEFAULT_GAP
                gap = min(5.0, max(0.1, gap))
                STATE.settings["max_gap"] = gap
                job["cut"] = {"state": "working", "progress": 0.0, "gap": gap}
                job["rev"] = job.get("rev", 0) + 1
            STATE.save_settings()
            threading.Thread(target=STATE.cut, args=(job, gap), daemon=True).start()
            return self._json({"ok": True})
        if p == "/api/sections/plan":  # read the script and find its sections in the audio
            job = STATE.jobs.get(b.get("id"))
            if not job or "_words" not in job:
                return self._json({"error": "Transcribe this file first."}, 400)
            path, text = b.get("path"), b.get("text")
            if b.get("pick"):
                if not STATE.picker:
                    return self._json({"error": "native dialogs unavailable"}, 400)
                res = STATE.picker("script")
                if not res:
                    return self._json({"cancelled": True})
                path = res[0]
            tmp = None
            if b.get("data"):  # a file chosen in browser mode
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=Path(b.get("name", "s.txt")).suffix)
                tmp.write(base64.b64decode(b["data"]))
                tmp.close()
                path = tmp.name
            try:
                res = sections.plan(path, text, job["_words"])
                if path and "error" not in res:
                    res["script_text"] = "\n".join(l for l, _ in sections.read_script(path))
            except Exception as e:
                res = {"error": f"Could not read the script: {e}"}
            finally:
                if tmp:
                    os.unlink(tmp.name)
            if "error" in res:
                return self._json(res, 400)
            job["_plan"] = res["sections"]
            res["has_short"] = (job.get("cut") or {}).get("state") == "done"
            return self._json(res)
        if p == "/api/sections/save":
            with STATE.lock:
                job = STATE.jobs.get(b.get("id"))
                if not job or not job.get("_plan"):
                    return self._json({"error": "Load the script first."}, 400)
                if not job.get("audio") or not os.path.exists(job["audio"]):
                    return self._json({"error": "The audio file for this transcript was not found."}, 400)
                if (job.get("sections") or {}).get("state") == "working":
                    return self._json({"error": "Already saving the sections."}, 400)
                plan = [s for s in job["_plan"] if s["n"] in set(b.get("only") or [s["n"] for s in job["_plan"]])]
                job["sections"] = {"state": "working", "progress": 0.0, "items": [], "total": len(plan)}
                job["rev"] = job.get("rev", 0) + 1
            threading.Thread(target=STATE.split_sections, args=(job, plan, bool(b.get("short"))), daemon=True).start()
            return self._json({"ok": True})
        if p == "/api/job_folder":  # where one file's .srt/.json are saved
            with STATE.lock:
                job = STATE.jobs.get(b.get("id"))
                if not job or job["status"] == "working":
                    return self._json({"error": "cannot change"}, 400)
            if b.get("reset"):
                folder = ""
            elif b.get("path"):
                folder = str(Path(b["path"]).expanduser())
            elif STATE.picker:
                res = STATE.picker("folder")
                if not res:
                    return self._json({"ok": False, "cancelled": True})
                folder = res[0]
            else:
                return self._json({"error": "native dialogs unavailable"}, 400)
            with STATE.lock:
                job["out_dir"] = folder
                if "_words" in job:  # already finished: save the files in the new folder now
                    STATE.write(job)
            return self._json({"ok": True, "out_dir": folder, "outputs": job["outputs"]})
        if p == "/api/history/open":  # load a past transcript back into the window
            h = next((x for x in STATE.history if x["id"] == b.get("id")), None)
            if not h:
                return self._json({"error": "not found"}, 404)
            src = h["outputs"].get("json")
            if not src or not os.path.exists(src):
                return self._json({"error": "The saved .json file was moved or deleted, so this cannot be opened."}, 400)
            with STATE.lock:
                for j in STATE.jobs.values():
                    if j.get("hid") == h["id"]:
                        return self._json({"id": j["id"]})
                try:
                    words, lang = load_words_json(src)
                except Exception as e:
                    return self._json({"error": f"Could not read {src}: {e}"}, 400)
                jid = uuid.uuid4().hex[:10]
                audio = h.get("audio") if h.get("audio") and os.path.exists(h["audio"]) else ""
                job = {"id": jid, "path": h["source"], "name": h["name"], "status": "done", "kind": h.get("kind", "audio"),
                       "progress": 1.0, "message": "", "outputs": dict(h["outputs"]), "error": "", "audio": audio,
                       "lang": h.get("lang", lang), "rev": 0, "out_dir": str(Path(src).parent), "hid": h["id"],
                       "_words": words, "duration": h.get("duration")}
                job["words"], job["cues"] = len(words), h.get("cues", 0)
                job["message"] = f"{job['cues']} subtitles · {job['words']} words"
                STATE.jobs[jid] = job
                STATE.order.append(jid)
            return self._json({"id": jid})
        if p == "/api/history/remove":
            with STATE.lock:
                STATE.history = [x for x in STATE.history if x["id"] != b.get("id")]
                STATE.save_history()
            return self._json({"ok": True})
        if p == "/api/log":  # errors from the window, so they end up in the log file
            print("[window]", str(b.get("msg", ""))[:2000], file=sys.stderr, flush=True)
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
        if p == "/api/reveal":  # a file: select it in Finder; a folder: open it
            target = b.get("path")
            if not target or not os.path.exists(target):
                return self._json({"error": "That file or folder no longer exists."}, 404)
            if sys.platform == "darwin":
                subprocess.Popen(["open", target] if os.path.isdir(target) else ["open", "-R", target])
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
