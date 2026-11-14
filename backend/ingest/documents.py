"""Document ingestion: official PDFs and web pages -> page-addressable text records.

    registry (document_registry.json) -> download (raw, SHA-256) -> extraction -> validation -> data/documents/<id>.json

* PDFs are extracted page by page with poppler's `pdftotext -layout`; page numbers are PDF page indices, which for
  the 2015 Researcher's Guide coincide with the printed page numbers (checked against its table of contents).
* Pages with no extractable text are recorded as `empty_pages` (they would need OCR). Nothing is OCR'd silently:
  `ocr` is false for every page produced here.
* HTML pages are reduced to the article body between a start and an end marker declared in the registry; if either
  marker is missing the document is recorded with status "failed" rather than storing site navigation as content.
* Raw files are cached by URL under data/raw/docs (not committed). Re-running reuses the cache unless --refresh.

Usage (from backend/):  python -m ingest.documents [--refresh]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import time
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
RAW = DATA / "raw" / "docs"
OUT = DATA / "documents"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) flamewise-ingest/2.0"}
SKIP_TAGS = {"script", "style", "nav", "footer", "header", "noscript", "svg"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def download(url: str, dest: Path, refresh: bool) -> bytes:
    if dest.exists() and not refresh:
        return dest.read_bytes()
    last = None
    for n in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                b = r.read()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(b)
            return b
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2 * (n + 1))
    raise RuntimeError(f"download failed: {url}: {last}")


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self.skip += 1
        if tag in ("p", "h1", "h2", "h3", "h4", "li", "br", "div"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS and self.skip:
            self.skip -= 1

    def handle_data(self, d):
        if not self.skip and d.strip():
            self.parts.append(d.strip() + " ")


def html_body(raw: bytes, start: str, end: str) -> str:
    p = _Text()
    p.feed(raw.decode("utf-8", "replace"))
    text = re.sub(r"[ \t]+", " ", "".join(p.parts))
    text = re.sub(r"\s*\n\s*", "\n", text)
    flat = text.replace("\n", " ")
    i = flat.find(start)
    if i < 0:
        raise ValueError(f"start marker not found: {start!r}")
    j = flat.find(end, i + len(start))
    if j < 0:
        raise ValueError(f"end marker not found: {end!r}")
    return re.sub(r"\s+", " ", flat[i:j]).strip()


def pdf_pages(path: Path) -> list[str]:
    if not shutil.which("pdftotext"):
        raise RuntimeError("pdftotext (poppler-utils) is required for PDF extraction")
    out = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", str(path), "-"], capture_output=True, check=True).stdout
    pages = out.decode("utf-8", "replace").split("\f")
    if pages and not pages[-1].strip():
        pages = pages[:-1]
    return [re.sub(r"[ \t]+", " ", re.sub(r"-\n(?=[a-z])", "", p)).strip() for p in pages]


TOC_LINE = re.compile(r"^\s*(.+?)\s+(\d{1,3})\s*$")


def parse_toc(pages: list[str], toc_pages: list[int], n_pages: int) -> list[dict]:
    """Table-of-contents lines 'Heading .... 21' -> [{title, page}]; only entries pointing inside the document."""
    out = []
    for tp in toc_pages:
        for line in pages[tp - 1].splitlines():
            m = TOC_LINE.match(line)
            if m and not m.group(1).lower().startswith("table of contents"):
                title, page = re.sub(r"\s{2,}", " ", m.group(1)).strip(), int(m.group(2))
                if 1 <= page <= n_pages and len(title) > 3:
                    out.append({"title": title, "page": page})
    return out


def run(entry: dict, refresh: bool) -> dict:
    ext = ".pdf" if entry["format"] == "pdf" else ".html"
    raw_path = RAW / f"{entry['id']}{ext}"
    rec = {k: v for k, v in entry.items() if k not in ("start_marker", "end_marker", "toc_page", "toc_pages")}
    rec.update({"retrieved_at": now(), "extraction": {"status": "failed", "method": None, "ocr": False, "errors": []}})
    try:
        raw = download(entry["url"], raw_path, refresh)
        rec["sha256"] = hashlib.sha256(raw).hexdigest()
        rec["bytes"] = len(raw)
        if entry["format"] == "pdf":
            pages = pdf_pages(raw_path)
            rec["pages"] = [{"page": i + 1, "text": t} for i, t in enumerate(pages)]
            rec["page_count"] = len(pages)
            empty = [i + 1 for i, t in enumerate(pages) if len(t) < 20]
            rec["extraction"].update({"method": "pdftotext -layout (poppler)", "empty_pages": empty,
                                      "status": "complete" if not empty else "complete_with_empty_pages"})
            rec["sections"] = parse_toc(pages, entry.get("toc_pages", []), len(pages))
        else:
            body = html_body(raw, entry["start_marker"], entry["end_marker"])
            rec["pages"] = [{"page": None, "text": body}]
            rec["page_count"] = None
            rec["extraction"].update({"method": "html article body between registry markers", "status": "complete"})
            rec["sections"] = []
    except Exception as exc:  # noqa: BLE001 - recorded on the document, never silent
        rec["extraction"]["errors"].append(str(exc)[:400])
        rec.setdefault("pages", [])
    return rec


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args(argv)
    OUT.mkdir(parents=True, exist_ok=True)
    reg = json.loads((HERE / "document_registry.json").read_text())
    bad = 0
    for e in reg:
        rec = run(e, args.refresh)
        (OUT / f"{e['id']}.json").write_text(json.dumps(rec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        st = rec["extraction"]["status"]
        bad += st == "failed"
        chars = sum(len(p["text"]) for p in rec["pages"])
        print(f"{e['id']:28s} {st:28s} pages={rec.get('page_count')} chars={chars} {rec['extraction']['errors'][:1]}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
