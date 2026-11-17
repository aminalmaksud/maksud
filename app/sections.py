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


def match(sections: list[dict], words) -> list[dict]:
    """Find each section's place in the transcript. Returns sections with start/end times and checks."""
    s_tok, s_sec = [], []
    for k, s in enumerate(sections):
        for w in s["words"]:
            s_tok.append(norm(w))
            s_sec.append(k)
    t_tok = [norm(w.text) for w in words]
    sm = difflib.SequenceMatcher(None, s_tok, t_tok, autojunk=False)
    s2t = {}
    for a, b, size in sm.get_matching_blocks():
        for d in range(size):
            s2t[a + d] = b + d
    # loose second pass for words the exact pass missed (small spelling differences)
    used = set(s2t.values())
    for i in range(len(s_tok)):
        if i in s2t or i - 1 not in s2t:
            continue
        t = s2t[i - 1] + 1
        if t < len(t_tok) and t not in used and difflib.SequenceMatcher(None, s_tok[i], t_tok[t]).ratio() >= 0.7:
            s2t[i] = t
            used.add(t)

    first = [None] * len(sections)  # (script position in section, transcript index) of first match
    last_t = [None] * len(sections)
    counts = [0] * len(sections)
    offs, seen = [], {}
    for i, k in enumerate(s_sec):
        offs.append(seen.get(k, 0))
        seen[k] = seen.get(k, 0) + 1
    for i in sorted(s2t):
        k, t = s_sec[i], s2t[i]
        counts[k] += 1
        if first[k] is None:
            first[k] = (offs[i], t)
        last_t[k] = t

    n = len(words)
    starts = [None] * len(sections)  # transcript index where each section begins
    prev_end = -1
    for k, s in enumerate(sections):
        if first[k] is None or counts[k] < max(2, 0.15 * len(s["words"])):
            continue
        j, t = first[k]
        lo = prev_end + 1
        guess = max(lo, t - j)
        # choose the word boundary with the clearest pause between `lo` and the first matched word
        best, best_score = guess, -1e9
        for c in range(lo, t + 1):
            gap = words[c].start - words[c - 1].end if c > 0 else 10.0
            score = gap - 0.08 * abs(c - guess)
            if score > best_score:
                best, best_score = c, score
        starts[k] = best
        prev_end = max(best, last_t[k] if last_t[k] is not None else best)
    # keep the order strictly increasing
    found = [k for k in range(len(sections)) if starts[k] is not None]
    found = [k for i, k in enumerate(found) if all(starts[k] > starts[p] for p in found[:i])]
    if found:
        starts[found[0]] = 0 if all(starts[p] is None for p in range(found[0])) else starts[found[0]]

    out = []
    for idx, k in enumerate(found):
        a = starts[k]
        b = starts[found[idx + 1]] if idx + 1 < len(found) else n
        seg = words[a:b]
        if not seg:
            continue
        s = sections[k]
        heard = " ".join(w.text for w in seg[:8])
        opening = " ".join(s["words"][:8])
        op_match = difflib.SequenceMatcher(None, [norm(x) for x in s["words"][:6]],
                                           [norm(w.text) for w in seg[:8]], autojunk=False)
        open_ratio = sum(m.size for m in op_match.get_matching_blocks()) / max(1, min(6, len(s["words"])))
        ratio = counts[k] / max(1, len(s["words"]))
        prev_end_t = words[a - 1].end if a > 0 else 0.0
        next_start_t = words[b].start if b < n else None
        pad_in = min(0.3, (seg[0].start - prev_end_t) / 2) if a > 0 else min(0.3, seg[0].start)
        pad_out = min(0.3, (next_start_t - seg[-1].end) / 2) if next_start_t is not None else 0.5
        out.append({
            "n": len(out) + 1, "title": s["title"], "first": a, "last": b - 1,
            "start": round(max(0.0, seg[0].start - pad_in), 3), "end": round(seg[-1].end + pad_out, 3),
            "match": round(ratio, 2), "opening_match": round(open_ratio, 2),
            "script_opening": opening, "heard_opening": heard, "script_words": len(s["words"]),
            "ok": ratio >= 0.5 and open_ratio >= 0.5,
        })
    missing = [sections[k]["title"] for k in range(len(sections)) if k not in found]
    return {"sections": out, "missing": missing, "total": len(sections)}


def plan(script_path: str | None, script_text: str | None, words) -> dict:
    lines = read_script(script_path) if script_path else [(l, False) for l in (script_text or "").splitlines()]
    secs = parse_sections(lines)
    if not secs:
        return {"error": "The script is empty."}
    if len(secs) == 1:
        return {"error": "No section headings were found in the script. Put each section's title on its own line, "
                         "for example “# Part 1: The Fall”, “Part 2”, “পর্ব ৩”, “[Intro]”, or a line with --- between sections."}
    res = match(secs, words)
    if not res["sections"]:
        return {"error": "The script's words could not be found in this transcript. Is it the script for this recording?"}
    return res


def safe_name(s: str) -> str:
    s = re.sub(r'[\\/:*?"<>|\n\r\t]+', " ", s).strip(" .")
    return re.sub(r"\s+", " ", s)[:70] or "Section"
