"""NASA PSI dataset records (normalized by ingest/psi_ingest.py) and the experimental conditions they publish.

Measured-condition ranges are read from the per-test experiment tables PSI publishes. They are reported exactly as
min/max of the published cells together with the original column header (which carries the unit). FLAMEWISE does
not convert units, average, or merge columns, because tables use different conventions (mole fraction vs. percent,
atm vs. mmHg vs. bar) and some cells are placeholders (e.g. 0 for "not recorded").
"""
import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
_path = DATA / "psi_records.json"
PSI: dict[str, dict] = {r["accession"]: r for r in json.loads(_path.read_text(encoding="utf-8"))} if _path.exists() else {}
MANIFEST = json.loads((DATA / "psi" / "manifest.json").read_text()) if (DATA / "psi" / "manifest.json").exists() else {}

# parameter -> header pattern. Order matters: first match wins for a column.
PARAMS = [
    ("oxygen", re.compile(r"(\bo2\b|o2 |xo2|oxygen|percent o2|\bo initial)", re.I)),
    ("pressure", re.compile(r"(pressure|\bp(init|final|mean)\b|\(atm\)|\(bar\)|mmhg|approx p)", re.I)),
    ("flow", re.compile(r"(air flow|airflow|flow velocity|inlet velocity|air rate)", re.I)),
    ("diluent", re.compile(r"(nitrogen|helium|\bn initial|\bhe initial|\bco initial|co2 % by vol|mn2)", re.I)),
    ("fuel", re.compile(r"(^fuel$|fuel sample material|^material$|sample material|fuel type|sample \(fuel type\))", re.I)),
    ("result", re.compile(r"(burning rate|burn time|extinction diameter|spread rate|burn length|flames ignited|weight loss rate)", re.I)),
]
PARAM_ORDER = [p for p, _ in PARAMS]


def classify(col: str) -> str | None:
    for name, rx in PARAMS:
        if rx.search(col):
            return name
    return None


def conditions(acc: str) -> list[dict]:
    """Columns of the published experiment table that state oxygen, pressure, flow, diluent, fuel or a measured result."""
    r = PSI.get(acc)
    t = (r or {}).get("experiment_table")
    if not t:
        return []
    out = []
    for c in t["column_summary"]:
        p = classify(c["column"])
        if not p or not c.get("filled"):
            continue
        e = {"parameter": p, "column": c["column"], "kind": c.get("kind"), "filled_rows": c["filled"], "total_rows": t["row_count"],
             "accession": acc, "table_file": t["file_name"]}
        if c.get("kind") == "numeric":
            e.update({"min": c["min"], "max": c["max"]})
        else:
            e["examples"] = c.get("examples", [])[:6]
        out.append(e)
    return out


def summary(acc: str) -> dict | None:
    """Compact dataset card used inside investigation payloads."""
    r = PSI.get(acc)
    if not r:
        return None
    t = r.get("experiment_table")
    return {
        "accession": acc, "title": r["title"], "acronym": r["acronym"], "doi": r["doi"], "landing_url": r["landing_url"],
        "project_type": r["project_type"], "flight_platform": r["flight_platform"], "nasa_center": r["nasa_center"],
        "sub_research_area": r["sub_research_area"], "start_date": r["start_date"], "end_date": r["end_date"],
        "release_date": r["release_date"], "version": r["version"], "license": r["license"], "hardware": r["hardware"],
        "publication_count": len(r["publications"]), "experiment_rows": t["row_count"] if t else 0,
        "experiment_columns": len(t["columns"]) if t else 0, "file_categories": r["file_categories"],
        "conditions": conditions(acc),
    }


def full(acc: str) -> dict | None:
    r = PSI.get(acc)
    if not r:
        return None
    return {**r, "conditions": conditions(acc)}


def parameters_available(accs: list[str]) -> set[str]:
    return {c["parameter"] for a in accs for c in conditions(a)}


def linked_accessions(investigations) -> set[str]:
    return {a for i in investigations for a in i.psi_accessions}
