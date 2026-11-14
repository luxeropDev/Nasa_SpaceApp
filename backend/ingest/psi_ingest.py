"""NASA Physical Sciences Informatics (PSI) ingestion connector.

Pipeline:  discovery (PSI search API) -> metadata (investigation API) -> experiment table (CSV)
           -> normalization -> validation -> backend/data/psi_records.json

Endpoints used are the public JSON endpoints the PSI web app itself calls (no login, no key):
  search:        https://psi.nasa.gov/geode-py/ws/repo/search?term=<q>&source=psi&type=investigation
  investigation: https://psi.nasa.gov/geode-py/ws/repo/investigations/<PSI-ID>
  file link:     https://psi.nasa.gov/geode-py/ws/studies/<PSI-ID>/download?file=<name>&version=<v>&redirect=false
They are undocumented, so every run records what it fetched (URL, timestamp, SHA-256) in a manifest and fails
loudly on schema drift instead of writing partial records.

PSI data are released under CC0-1.0 (stated per investigation). PSI asks users to cite each investigation by its DOI;
the DOI is kept on every normalized record.

Usage (from repo root):
    python -m backend.ingest.psi_ingest            # refresh everything (cached raw files are reused)
    python -m backend.ingest.psi_ingest --refresh  # ignore the raw cache and re-download
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://psi.nasa.gov/geode-py/ws"
LANDING = "https://psi.nasa.gov/physci/repo/data/investigations/{acc}"
DATA = Path(__file__).resolve().parent.parent / "data"
RAW = DATA / "raw" / "psi"                # original API payloads (not committed; reproducible)
TABLES = DATA / "psi" / "tables"           # experiment tables as published by PSI (CC0)
OUT = DATA / "psi_records.json"
MANIFEST = DATA / "psi" / "manifest.json"
SEARCH_TERMS = ["combustion", "flame", "fire", "smoke", "soot"]
UA = {"User-Agent": "flamewise-ingest/2.0 (research tool)", "Accept": "application/json"}

REQUIRED = ["accession", "title", "researchArea", "objective"]


def _get(url: str, binary: bool = False, tries: int = 3):
    last = None
    for n in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                data = r.read()
                return data if binary else data.decode("utf-8", "replace")
        except Exception as exc:  # noqa: BLE001 - retried, then raised
            last = exc
            time.sleep(1.5 * (n + 1))
    raise RuntimeError(f"GET failed after {tries} tries: {url}: {last}")


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _clean(s: str | None) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", s).strip()


def discover() -> list[dict]:
    """Return PSI search hits whose Research Area is Combustion Science (deduplicated)."""
    found: dict[str, dict] = {}
    for term in SEARCH_TERMS:
        q = urllib.parse.urlencode({"term": term, "source": "psi", "type": "investigation", "size": 200})
        res = json.loads(_get(f"{BASE}/repo/search?{q}"))
        for h in res["hits"]["hits"]:
            s = h["_source"]
            if s.get("Research Area") == "Combustion Science":
                found.setdefault(s["Accession"], {"accession": s["Accession"], "title": s.get("Title", ""), "matched_terms": []})
                found[s["Accession"]]["matched_terms"].append(term)
    return sorted(found.values(), key=lambda r: int(r["accession"].split("-")[1]))


def fetch_raw(acc: str, refresh: bool) -> tuple[dict, dict]:
    RAW.mkdir(parents=True, exist_ok=True)
    p = RAW / f"{acc}.json"
    url = f"{BASE}/repo/investigations/{acc}"
    if p.exists() and not refresh:
        b = p.read_bytes()
        meta = {"url": url, "sha256": _sha(b), "cached": True}
    else:
        b = _get(url, binary=True)
        p.write_bytes(b)
        meta = {"url": url, "sha256": _sha(b), "cached": False, "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    j = json.loads(b)
    missing = [k for k in REQUIRED if not j.get(k)]
    if missing:
        raise ValueError(f"{acc}: PSI schema drift, missing {missing}")
    return j, meta


def fetch_table(acc: str, j: dict, refresh: bool) -> dict | None:
    et = (j.get("experimentalTable") or [None])[0]
    if not et:
        return None
    TABLES.mkdir(parents=True, exist_ok=True)
    dest = TABLES / f"{acc}.csv"
    if refresh or not dest.exists():
        q = urllib.parse.urlencode({"file": et["file_name"], "version": et.get("version", 1), "redirect": "false"})
        signed = _get(f"{BASE}/studies/{acc}/download?{q}").strip().strip('"')
        dest.write_bytes(_get(signed, binary=True))
    raw = dest.read_bytes()
    text, encoding = decode_table(raw)
    rows = list(csv.reader(io.StringIO(text)))
    rows = [r for r in rows if any(c.strip() for c in r)]
    header = [h.strip() for h in rows[0]] if rows else []
    body = rows[1:]
    return {"file_name": et["file_name"], "local_path": f"psi/tables/{acc}.csv", "sha256": _sha(raw), "encoding": encoding, "columns": header,
            "row_count": len(body), "column_summary": summarize(header, body)}


def decode_table(raw: bytes) -> tuple[str, str]:
    """PSI tables are mostly UTF-8 but some were exported from Excel as Windows-1252; never decode lossily."""
    try:
        return raw.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        return raw.decode("cp1252", "strict"), "cp1252"


NUM = re.compile(r"^-?\d+(\.\d+)?$")


def summarize(header: list[str], body: list[list[str]]) -> list[dict]:
    """Per-column summary computed from the published table. Numbers are reported exactly as min/max of the cells;
    no unit conversion or interpretation is applied (units are whatever the column header states)."""
    out = []
    for ci, name in enumerate(header):
        cells = [r[ci].strip() for r in body if ci < len(r) and r[ci].strip() not in ("", "-", "N/A", "NA")]
        if not cells:
            out.append({"column": name, "filled": 0})
            continue
        nums = [float(c) for c in cells if NUM.match(c)]
        entry: dict = {"column": name, "filled": len(cells)}
        if nums and len(nums) >= 0.8 * len(cells):
            entry.update({"kind": "numeric", "min": min(nums), "max": max(nums), "distinct": len(set(nums))})
        else:
            vals = list(dict.fromkeys(cells))
            entry.update({"kind": "text", "distinct": len(vals), "examples": vals[:6]})
        out.append(entry)
    return out


def normalize(j: dict, table: dict | None, raw_meta: dict, hit: dict) -> dict:
    cats: dict[str, int] = {}
    for f in j.get("added") or []:
        parts = (f.get("remote_path") or "").split("/")
        if len(parts) >= 2:
            cats[parts[-2]] = cats.get(parts[-2], 0) + 1
    acc = j["accession"]
    return {
        "accession": acc,
        "title": _clean(j.get("title")),
        "acronym": _clean(j.get("investigationAcronym")) or None,
        "doi": j.get("doi") or None,
        "landing_url": LANDING.format(acc=acc),
        "project_type": j.get("projectType") or None,
        "flight_platform": j.get("flightProgram") or None,
        "nasa_center": j.get("managingNasaCenter") or None,
        "research_area": j.get("researchArea"),
        "sub_research_area": j.get("subResearchArea") or None,
        "start_date": j.get("investigationStartDate") or None,
        "end_date": j.get("investigationEndDate") or None,
        "release_date": j.get("releaseDate") or None,
        "modified_date": j.get("modifiedDate") or None,
        "version": j.get("version"),
        "license": j.get("licenseIdentifier") or None,
        "hardware": _clean(j.get("experimentHardware")) or None,
        "objective": _clean(j.get("objective")),
        "approach": _clean(j.get("approach")),
        "hypothesis": _clean(j.get("hypothesis")) or None,
        "research_impacts": _clean(j.get("researchImpacts")) or None,
        # names + affiliation + role only; e-mail addresses are deliberately not copied
        "contacts": [{"name": f"{c.get('firstName', '')} {c.get('lastName', '')}".strip(), "affiliation": c.get("affiliation") or None,
                      "role": ", ".join(r.get("annotationValue", "") for r in c.get("roles") or []) or None} for c in j.get("contacts") or []],
        "publications": [{"title": _clean(p.get("title")), "authors": _clean(p.get("authorList")) or None, "doi": (p.get("doi") or "").strip() or None}
                         for p in j.get("publications") or [] if p.get("title")],
        "related_accessions": [x.strip() for x in (j.get("related_glds") or "").split(",") if x.strip()],
        "file_categories": cats,
        "total_file_size_bytes": j.get("totalFileSize"),
        "experiment_table": table,
        "provenance": {"api_url": raw_meta["url"], "raw_sha256": raw_meta["sha256"], "discovered_by": hit.get("matched_terms", [])},
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args(argv)
    started = datetime.now(timezone.utc).isoformat(timespec="seconds")
    hits = discover()
    print(f"discovered {len(hits)} Combustion Science investigations")
    records, errors = [], []
    for h in hits:
        acc = h["accession"]
        try:
            j, meta = fetch_raw(acc, args.refresh)
            table = None
            try:
                table = fetch_table(acc, j, args.refresh)
            except Exception as exc:  # noqa: BLE001 - recorded, record still kept without a table
                errors.append({"accession": acc, "stage": "experiment_table", "error": str(exc)[:300]})
            records.append(normalize(j, table, meta, h))
            print(f"  {acc:8s} ok  {records[-1]['acronym'] or records[-1]['title'][:50]}")
        except Exception as exc:  # noqa: BLE001
            errors.append({"accession": acc, "stage": "metadata", "error": str(exc)[:300]})
            print(f"  {acc:8s} FAILED {exc}", file=sys.stderr)
    OUT.write_text(json.dumps(records, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({"source": "NASA Physical Sciences Informatics", "search_terms": SEARCH_TERMS, "started_at": started,
                                    "finished_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "records": len(records),
                                    "errors": errors, "output_sha256": _sha(OUT.read_bytes())}, indent=1) + "\n")
    print(f"wrote {len(records)} records, {len(errors)} errors -> {OUT.relative_to(DATA.parent.parent)}")
    return 1 if not records else 0


if __name__ == "__main__":
    raise SystemExit(main())
