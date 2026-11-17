"""Split a recording into the sections of its script.

The script's headings ("# Title", "Part 2", "পর্ব ৩", "[Intro]", "---" …) mark where sections begin. The
script's words are lined up with the transcript (what was really said, with timings); the first words of
each section give its start time in the audio. Each cut is placed in the pause before the section's first
word, so no word is ever split. Every section is then checked: how much of its script was heard in its
part of the audio, and whether the audio really starts with the section's opening words.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
import zipfile
from pathlib import Path

HEAD_WORDS = (r"part|section|chapter|episode|segment|scene|act|intro|introduction|outro|conclusion|"
              r"পর্ব|অংশ|অধ্যায়|অধ্যায়|ভাগ|সেকশন|পার্ট|চ্যাপ্টার|ইন্ট্রো|আউট্রো|উপসংহার|ভূমিকা|সূচনা")
RE_HEAD = re.compile(rf"^\s*(?:{HEAD_WORDS})(?:\s*[-–—:#.]?\s*[\d০-৯IVXivx]+)?\b(?:\s*[-–—:.)]\s*.*|\s*)$", re.I)
RE_MD = re.compile(r"^\s*#{1,6}\s+(.*\S)")
RE_BRACKET = re.compile(r"^\s*\[\s*([^\]]{1,80})\s*\]\s*$")
RE_BOLD = re.compile(r"^\s*\*\*([^*]{1,80})\*\*\s*:?\s*$")
RE_NUM = re.compile(r"^\s*[\d০-৯]{1,2}\s*[.)]\s+(\S.{0,60})$")
RE_SEP = re.compile(r"^\s*(?:-{3,}|\*{3,}|={3,}|_{3,})\s*$")
RE_NOTE = re.compile(r"\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|<[^>]*>")


# ---- reading the script ------------------------------------------------------

def read_script(path: str) -> list[tuple[str, bool]]:
    """Lines of a .txt/.md/.docx script as (text, is_heading_by_style)."""
    p = Path(path)
    if p.suffix.lower() == ".docx":
        import xml.etree.ElementTree as ET

        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        with zipfile.ZipFile(p) as z:
            root = ET.fromstring(z.read("word/document.xml"))
        out = []
        for para in root.iter(f"{{{ns['w']}}}p"):
            style = para.find("w:pPr/w:pStyle", ns)
            name = (style.get(f"{{{ns['w']}}}val") if style is not None else "") or ""
            text = "".join(t.text or "" for t in para.iter(f"{{{ns['w']}}}t"))
            out.append((text, bool(re.match(r"(heading|title|berschrift|titre)", name, re.I))))
        return out
    raw = p.read_bytes()
    for enc in ("utf-8-sig", "utf-16", "cp1252"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if p.suffix.lower() == ".rtf":
        text = re.sub(r"\\par[d]?\b", "\n", text)
        text = re.sub(r"\\'[0-9a-f]{2}|\\u-?\d+\??|\\[a-z]+-?\d* ?|[{}]", "", text)
    return [(line, False) for line in text.splitlines()]


def heading_of(line: str, styled: bool) -> str | None:
    s = line.strip()
    if not s:
        return None
    if styled:
        return s
    for rx in (RE_MD, RE_BRACKET, RE_BOLD):
        m = rx.match(s)
        if m:
            return m.group(1).strip()
    if RE_HEAD.match(s) and len(s.split()) <= 10:
        return s.strip("*#: ")
    m = RE_NUM.match(s)
    if m and len(s.split()) <= 8 and not re.search(r"[।.?!,]$", s):
        return s
    return None


def parse_sections(lines: list[tuple[str, bool]]) -> list[dict]:
    sections, cur = [], {"title": "", "text": []}
    for line, styled in lines:
        if RE_SEP.match(line):
            sections.append(cur)
            cur = {"title": "", "text": []}
            continue
        h = heading_of(line, styled)
        if h is not None:
            sections.append(cur)
            cur = {"title": h, "text": []}
        elif line.strip():
            cur["text"].append(line.strip())
    sections.append(cur)
    out = []
    for s in sections:
        text = " ".join(s["text"])
        words = RE_NOTE.sub(" ", text).split()  # stage directions like [B-roll] or (pause) are not spoken
        words = [w for w in words if norm(w)]
        if words:  # a heading with nothing under it is skipped
            out.append({"title": s["title"], "words": words})
    for i, s in enumerate(out, 1):
        if not s["title"]:
            s["title"] = "Intro" if i == 1 and len(out) > 1 else f"Section {i}"
    return out


# ---- matching ------------------------------------------------------------------

_BN_MAP = str.maketrans({"শ": "স", "ষ": "স", "ণ": "ন", "য": "জ", "আ": "অ", "ঈ": "ই", "ঊ": "উ",
                         "ঐ": "এ", "ঔ": "ও", "ঋ": "র", "ৎ": "ত", "ঙ": "ং"})
_DROP = re.compile(r"[\u0981\u09bc\u09be-\u09cd\u09d7\u200c\u200d]")


def norm(w: str) -> str:
    """Spelling-tolerant form of a word: case, punctuation and (for Bangla) vowel signs ignored.
    (NFC splits ড় ঢ় য় into letter + nukta, and the nukta is dropped with the vowel signs.)"""
    w = unicodedata.normalize("NFC", w).lower()
    w = re.sub(r"[^\w\u0980-\u09ff]", "", w)
    if re.search(r"[\u0980-\u09ff]", w):
        w = _DROP.sub("", w.translate(_BN_MAP))
    return w


def _align(sections, words):
    """Line up script words with transcript words. Returns (script tokens, transcript tokens, script->transcript)."""
    s_tok = [norm(w) for s in sections for w in s["words"]]
    t_tok = [norm(w.text) for w in words]
    sm = difflib.SequenceMatcher(None, s_tok, t_tok, autojunk=False)
    s2t = {}
    for a, b, size in sm.get_matching_blocks():
        for d in range(size):
            s2t[a + d] = b + d
    # loose pass for words with small spelling differences, in both directions from an anchor
    used = set(s2t.values())
    for order in (range(len(s_tok)), range(len(s_tok) - 1, -1, -1)):
        for i in order:
            if i in s2t:
                continue
            for nb, step in ((i - 1, 1), (i + 1, -1)):
                if nb in s2t:
                    t = s2t[nb] + step
                    if 0 <= t < len(t_tok) and t not in used and \
                            difflib.SequenceMatcher(None, s_tok[i], t_tok[t]).ratio() >= 0.7:
                        s2t[i] = t
                        used.add(t)
                        break
    return s_tok, t_tok, s2t


def _boundary(p, s2t_items, n_s, words):
    """Transcript word index where script position p begins (in the pause nearest the estimate)."""
    import bisect

    keys = s2t_items[0]
    k = bisect.bisect_left(keys, p)
    jl, L = (keys[k - 1], s2t_items[1][k - 1]) if k > 0 else (-1, -1)
    jf, F = (keys[k], s2t_items[1][k]) if k < len(keys) else (n_s, len(words))
    if jf == p:  # the word itself was heard
        lo, hi, guess = L + 1, F, F
    else:
        lo, hi = L + 1, F
        guess = lo + round((p - jl - 1) * (hi - lo) / max(1, jf - jl - 1))
    best, best_score = guess, -1e9
    for c in range(lo, hi + 1):
        if c == 0:
            gap = 10.0
        elif c >= len(words):
            gap = 10.0
        else:
            gap = words[c].start - words[c - 1].end
        score = min(gap, 1.5) - 0.06 * abs(c - guess)
        if score > best_score:
            best, best_score = c, score
    return max(lo, min(hi, best))


def match(sections: list[dict], words) -> dict:
    """Find each section's place in the transcript, with start/end times and checks."""
    s_tok, t_tok, s2t = _align(sections, words)
    keys = sorted(s2t)
    items = (keys, [s2t[k] for k in keys])
    n, n_s = len(words), len(s_tok)
    pos, p = [], 0
    for s in sections:
        pos.append(p)
        p += len(s["words"])
    bounds = [0]
    for k in range(1, len(sections)):
        bounds.append(max(bounds[-1], _boundary(pos[k], items, n_s, words)))
    bounds.append(n)

    out, missing = [], []
    for k, s in enumerate(sections):
        a, b = bounds[k], bounds[k + 1]
        seg = words[a:b]
        heard_n = sum(1 for i in range(pos[k], pos[k] + len(s["words"])) if i in s2t)
        if not seg:
            missing.append(s["title"])
            continue
        heard = " ".join(w.text for w in seg[:8])
        opening = " ".join(s["words"][:8])
        m = min(6, len(s["words"]))
        op = difflib.SequenceMatcher(None, [norm(x) for x in s["words"][:m]], [norm(w.text) for w in seg[:m + 2]],
                                     autojunk=False)
        open_ratio = sum(x.size for x in op.get_matching_blocks()) / max(1, m)
        ratio = heard_n / max(1, len(s["words"]))
        prev_end_t = words[a - 1].end if a > 0 else 0.0
        next_start_t = words[b].start if b < n else None
        pad_in = min(0.3, (seg[0].start - prev_end_t) / 2) if a > 0 else min(0.3, seg[0].start)
        pad_out = min(0.3, (next_start_t - seg[-1].end) / 2) if next_start_t is not None else 0.5
        item = {
            "n": k + 1, "title": s["title"], "first": a, "last": b - 1,
            "start": round(max(0.0, seg[0].start - pad_in), 3), "end": round(seg[-1].end + pad_out, 3),
            "match": round(ratio, 2), "opening_match": round(open_ratio, 2),
            "script_opening": opening, "heard_opening": heard, "script_words": len(s["words"]),
            "ok": ratio >= 0.5 and open_ratio >= 0.5,
        }
        for key in ("sid", "code", "kind", "label"):
            if key in s:
                item[key] = s[key]
        if s.get("markers"):  # B-roll image numbers: when each image should come on screen
            imgs = []
            for num, w0, w1 in s["markers"]:
                ia = a if w0 == 0 else max(a, min(b, _boundary(pos[k] + w0, items, n_s, words)))
                ib = b if w1 >= len(s["words"]) else max(ia, min(b, _boundary(pos[k] + w1, items, n_s, words)))
                if ib > ia:
                    imgs.append({"image": num, "start": round(words[ia].start, 3), "end": round(words[ib - 1].end, 3)})
            item["images"] = imgs
        out.append(item)
    return {"sections": out, "missing": missing, "total": len(sections)}


# ---- "Section Pack" scripts: blocks headed "S001 · A", "S012 · B (2–5)", "S008 · AI1" … ----------------------

KINDS = {"A": "A Roll", "AI": "A Roll Infographics", "I": "Infographics", "M": "Map Animations",
         "B": "B-roll", "Q": "Quote cards", "CH": "Chapter headings"}
RE_PACK = re.compile(r"^\s*S(\d{2,4})\s*[·•.:\-–]\s*(AI|CH|A|I|M|B|Q)(\d*)\b\s*(\([^)]*\))?\s*(\([^)]*\))?\s*$")
RE_IMG = re.compile(r"(?<![\w.])(\d{1,3}(?:\.\d)?)(?=\s|$)")


def is_pack(lines) -> bool:
    return sum(1 for l, _ in lines if RE_PACK.match(l)) >= 3


def parse_pack(lines) -> list[dict]:
    """Every S-block once (the longest copy if it is listed more than once), in S-number order.
    Lines like "S015 · বাল্মীকি" (text overlays) and the "Full Section Map" are not blocks and are skipped."""
    blocks, cur = {}, None
    for line, _ in lines:
        st = line.strip()
        m = RE_PACK.match(st)
        if m:
            cur = {"sid": f"S{m.group(1)}", "code": m.group(2) + m.group(3), "kind": m.group(2), "lines": []}
            key = cur["sid"]
            if key not in blocks:
                blocks[key] = []
            blocks[key].append(cur)
            continue
        if not st:
            continue  # a blank line inside a block does not end it
        if st.startswith("```") or re.match(r"^S\d{2,4}\b", st) or re.match(r"^\d{1,2}\.\s", st):
            cur = None  # end of a list, a text-overlay line, a section-map line or the next list's title
            continue
        if cur is not None:
            cur["lines"].append(st)
    out = []
    for sid, copies in blocks.items():
        copies = [c for c in copies if c["lines"]]
        if not copies:
            continue
        c = max(copies, key=lambda c: len(" ".join(c["lines"])))
        text = " ".join(c["lines"])
        words, markers, start = [], [], 0
        for tok in text.split():
            if RE_IMG.fullmatch(tok) and c["kind"] in ("B", "Q", "CH"):
                markers.append((tok, start, len(words)))
                start = len(words)
                continue
            if norm(tok):
                words.append(tok)
        if not words:
            continue
        out.append({"title": f"{sid} · {c['code']}", "sid": sid, "code": c["code"], "kind": c["kind"],
                    "label": KINDS[c["kind"]], "words": words, "markers": markers})
    out.sort(key=lambda b: int(b["sid"][1:]))
    return out


def plan(script_path: str | None, script_text: str | None, words) -> dict:
    lines = read_script(script_path) if script_path else [(l, False) for l in (script_text or "").splitlines()]
    pack = is_pack(lines)
    secs = parse_pack(lines) if pack else parse_sections(lines)
    if not secs:
        return {"error": "The script is empty."}
    if len(secs) == 1:
        return {"error": "No section headings were found in the script. Put each section's title on its own line, "
                         "for example “# Part 1: The Fall”, “Part 2”, “পর্ব ৩”, “[Intro]”, or a line with --- between sections. "
                         "A Section Pack with blocks like “S001 · A” also works."}
    res = match(secs, words)
    heard = sum(s["match"] * s["script_words"] for s in res["sections"]) / max(1, sum(len(s["words"]) for s in secs))
    if not res["sections"] or heard < 0.15:
        return {"error": "The script's words could not be found in this transcript. Is it the script for this recording?"}
    res["pack"] = pack
    return res


def safe_name(s: str) -> str:
    s = re.sub(r'[\\/:*?"<>|\n\r\t]+', " ", s).strip(" .")
    return re.sub(r"\s+", " ", s)[:70] or "Section"
