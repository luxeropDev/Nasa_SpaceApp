"""NASA PSI dataset records (normalized by ingest/psi_ingest.py) and the experimental conditions they publish.

Measured-condition ranges are read from the per-test experiment tables PSI publishes. They are reported exactly as
min/max of the published cells together with the original column header (which carries the unit). PyroLens does
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

# Legacy parameter groups (API contract of /api/datasets, compare psi_* rows, Completeness) mapped from the token-aware
# classifier in app/science/headers.py. The old substring regexes classified "CO2 % by vol" as oxygen; they are gone.
LEGACY = {
    "oxygen_mole_fraction": "oxygen", "total_pressure": "pressure", "flow_velocity": "flow",
    "nitrogen_mole_fraction": "diluent", "helium_mole_fraction": "diluent", "diluent_description": "diluent", "atmosphere_description": "diluent",
    "carbon_dioxide_mole_fraction": "other_gas", "carbon_monoxide_mole_fraction": "other_gas", "unresolved_species": "other_gas",
    "material": "fuel",
}
PARAM_ORDER = ["oxygen", "pressure", "flow", "diluent", "other_gas", "fuel", "result"]


def classify(col: str) -> str | None:
    """Legacy group of a header (kept for callers); delegates to the token-aware classifier."""
    from .science.headers import classify as cls
    c = cls(col)
    p = c["parameter"] or ("unresolved_species" if c["status"] == "ambiguous" else None)
    if p in LEGACY:
        return LEGACY[p]
    return "result" if c["role"] == "outcome" and p else None


def conditions(acc: str) -> list[dict]:
    """Columns of the published experiment table that state oxygen, pressure, flow, diluent, other gases, fuel or a result.

    min/max are computed only from cells whose status is usable (source-reported / measured / derived single numbers),
    in the ORIGINAL unit of the column (`unit`); placeholders, spreadsheet errors, impossible values (pressure 0,
    fraction > 100 %) and ambiguous cells are excluded and counted in `excluded`. Normalized values live in /api/evidence."""
    from .science import measurements as M
    d = M.DATASETS.get(acc)
    r = PSI.get(acc)
    if not d or not (r or {}).get("experiment_table"):
        return []
    t = r["experiment_table"]
    out = []
    for col in d["columns"]:
        p = col["parameter"] or ("unresolved_species" if col["status"] == "ambiguous" else None)
        group = LEGACY.get(p) if p in LEGACY else ("result" if col["role"] == "outcome" and p else None)
        if not group:
            continue
        ms = [m for row in d["rows"] for m in row["measurements"] if m["source"]["column_index"] == col["index"] and m["extraction_method"] == "csv_cell"]
        filled = [m for m in ms if m["value_status"] != "missing"]
        if not filled:
            continue
        nums = [m for m in filled if m["value_status"] in M.USABLE and m["value_kind"] == "number"]
        excluded = {}
        for m in filled:
            if m["value_status"] not in M.USABLE | {"qualitative"}:
                excluded[m["value_status"]] = excluded.get(m["value_status"], 0) + 1
        e = {"parameter": group, "parameter_detail": p, "column": col["header"], "filled_rows": len(filled), "total_rows": t["row_count"],
             "accession": acc, "table_file": t["file_name"], "classification": col["status"], "excluded": excluded}
        if nums and len(nums) >= 0.5 * len(filled):
            units_ = sorted({m["raw_unit"] for m in nums if m["raw_unit"]})
            e.update({"kind": "numeric", "min": min(m["value"] for m in nums), "max": max(m["value"] for m in nums), "numeric_cells": len(nums),
                      "unit": units_[0] if len(units_) == 1 else (" | ".join(units_) or None)})
        else:
            vals = list(dict.fromkeys(m["raw_value"].strip() for m in filled))
            e.update({"kind": "text", "examples": vals[:6]})
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
