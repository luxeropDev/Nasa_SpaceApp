"""Extracted documents (ingest/documents.py) -> page-addressed passages, a passage BM25 index and experiment mentions.

Every passage keeps document id, page number (PDF page; None for single-page web articles) and the section heading
derived from the document's own table of contents. Passages are verbatim extracted text, so an excerpt shown to the
user can be checked against the original at that page.
"""
import json
import math
import re
from collections import Counter
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "documents"
DOCS: dict[str, dict] = {}
if DATA.exists():
    for p in sorted(DATA.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        DOCS[d["id"]] = d

WORD = re.compile(r"[a-z0-9][a-z0-9\-]*")
STOP = set("a an the of in on and or to for is are was were be by with from at as it its this that these those which who can will not into than then".split())


def _tok(t: str) -> list[str]:
    return [w for w in WORD.findall(t.lower()) if w not in STOP and len(w) > 1]


def section_for(doc: dict, page: int | None) -> str | None:
    if page is None:
        return None
    best = None
    for s in doc.get("sections", []):
        if s["page"] <= page and (best is None or s["page"] >= best["page"]):
            best = s
    return best["title"] if best else None


def _split(text: str, size: int = 650) -> list[str]:
    sents = re.split(r"(?<=[.!?])\s+(?=[A-Z(])", re.sub(r"\s+", " ", text).strip())
    out, cur = [], ""
    for s in sents:
        if len(cur) + len(s) > size and cur:
            out.append(cur.strip())
            cur = ""
        cur += s + " "
    if cur.strip():
        out.append(cur.strip())
    return out


PASSAGES: list[dict] = []
for d in DOCS.values():
    if d["extraction"]["status"] == "failed":
        continue
    for pg in d["pages"]:
        for k, chunk in enumerate(_split(pg["text"])):
            if len(chunk) < 60:
                continue
            PASSAGES.append({"id": f"{d['id']}:{pg['page'] or 0}:{k}", "doc_id": d["id"], "page": pg["page"],
                             "section": section_for(d, pg["page"]), "text": chunk, "evidence_class": d["evidence_class"]})

_TOKS = [Counter(_tok(p["text"])) for p in PASSAGES]
_LEN = [sum(t.values()) for t in _TOKS]
_AVG = (sum(_LEN) / len(_LEN)) if _LEN else 1
_DF: Counter = Counter()
for t in _TOKS:
    _DF.update(set(t))


def search(terms: list[str], limit: int = 5, classes: set[str] | None = None, min_score: float = 2.5) -> list[dict]:
    q = [t for t in dict.fromkeys(x.lower() for x in terms) if t and t not in STOP]
    n = len(PASSAGES)
    res = []
    for p, tf, ln in zip(PASSAGES, _TOKS, _LEN):
        if classes and p["evidence_class"] not in classes:
            continue
        s, hit = 0.0, []
        for t in q:
            if t in tf:
                idf = math.log(1 + (n - _DF[t] + 0.5) / (_DF[t] + 0.5))
                s += idf * tf[t] * 2.2 / (tf[t] + 1.2 * (0.25 + 0.75 * ln / _AVG))
                hit.append(t)
        if s >= min_score:
            res.append({**p, "score": round(s, 2), "matched_terms": hit})
    res.sort(key=lambda r: -r["score"])
    return res[:limit]


def mentions(names: list[str]) -> list[dict]:
    """Pages of extracted documents that name an investigation (whole-word, case-sensitive acronym match)."""
    pats = [re.compile(r"(?<![A-Za-z0-9])" + re.escape(n) + r"(?![A-Za-z0-9])") for n in names if n and len(n) >= 3]
    out = []
    for d in DOCS.values():
        for pg in d["pages"]:
            hits = sorted({n for n, rx in zip(names, pats) if rx.search(pg["text"])})
            if hits:
                out.append({"doc_id": d["id"], "doc_title": d["title"], "page": pg["page"], "section": section_for(d, pg["page"]), "names": hits})
    return out


def meta(d: dict) -> dict:
    return {k: d.get(k) for k in ("id", "title", "publisher", "authors", "date", "report_number", "category", "evidence_class", "url",
                                  "landing_url", "format", "page_count", "sha256", "retrieved_at", "challenge_resource")} | {
        "extraction": d["extraction"], "sections": d.get("sections", []), "chars": sum(len(p["text"]) for p in d["pages"]),
        "passages": sum(1 for p in PASSAGES if p["doc_id"] == d["id"])}
