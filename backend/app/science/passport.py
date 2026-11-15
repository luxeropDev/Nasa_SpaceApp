"""Experiment Passports and per-investigation parameter coverage.

A passport is generated only from ingested PSI metadata and the measurement layer. Every parameter row says how it is
known (directly measured, source-reported in the table, stated in PSI metadata, extracted from text, calculated,
model-derived, ambiguous or missing) and links to its cells. Nothing is filled in when the source is silent.
"""
from __future__ import annotations

from .. import psi
from ..data_loader import INVESTIGATIONS
from . import measurements as M, physics
from collections import Counter

# Evidence classes shown to users (every parameter row carries one)
EVIDENCE_CLASS = {"measured": "measured", "source_reported": "reported", "source_derived": "derived", "extracted": "estimated", "calculated": "derived",
                  "model_derived": "derived", "metadata": "reported", "qualitative": "reported", "ambiguous": "ambiguous", "unresolved": "ambiguous",
                  "missing": "missing", "assumed": "assumed"}

# Parameters a passport always reports on (so missing ones are visible), grouped as in the UI.
PASSPORT_PARAMS: list[tuple[str, list[str]]] = [
    ("atmosphere", ["oxygen_mole_fraction", "total_pressure", "oxygen_partial_pressure", "nitrogen_mole_fraction", "helium_mole_fraction",
                    "carbon_dioxide_mole_fraction", "carbon_monoxide_mole_fraction", "unresolved_species", "diluent_description", "atmosphere_description",
                    "ambient_temperature"]),
    ("flow", ["flow_velocity", "flow_direction"]),
    ("gravity", ["gravity_condition"]),
    ("material", ["material", "specimen_thickness", "specimen_width", "specimen_length", "droplet_initial_diameter", "fuel_stream_mole_fraction"]),
    ("ignition", ["ignition_power", "ignition_duration"]),
    ("outcomes", ["burn_time", "flame_spread_rate", "burn_length", "spread_length", "extinction_diameter", "burning_rate", "test_outcome", "flame_observation",
                  "mass_loss_rate", "smoke_ratio_rt_r0", "flames_ignited", "burner_temperature"]),
    ("derived", ["adiabatic_flame_temperature", "stoichiometric_mixture_fraction"]),
]
CORE = ["oxygen_mole_fraction", "total_pressure", "oxygen_partial_pressure", "flow_velocity", "gravity_condition", "material", "specimen_thickness"]

# availability codes (ordered from strongest to weakest)
AVAIL = ["measured", "source_reported", "source_derived", "extracted", "calculated", "model_derived", "metadata", "qualitative", "ambiguous", "unresolved", "missing"]


def _availability(st: dict) -> str:
    bases = set(st["bases"])
    if st["n_usable"]:
        if "measured" in bases:
            return "measured"
        if "calculated" in bases:
            return "calculated"
        if "source_derived" in bases:
            return "source_derived"
        if "model_derived" in bases:
            return "model_derived"
        return "source_reported"
    s = st["statuses"]
    if s.get("qualitative"):
        return "qualitative"
    if s.get("ambiguous"):
        return "ambiguous"
    if s.get("unresolved"):
        return "unresolved"
    return "missing"


def coverage(acc: str) -> dict[str, dict]:
    """Per passport parameter: availability code, statistics in canonical units, headers and counts."""
    d = M.DATASETS[acc]
    stats = M.parameter_stats(acc)
    extracted = {m["parameter"] for m in M.measurements(acc) if m["extraction_method"] == "text_pattern" and m["value_status"] in M.USABLE}
    out: dict[str, dict] = {}
    variants = [k for k in stats if "__" in k]
    for _, params in PASSPORT_PARAMS:
        for p in list(params) + [v for v in variants if v.split("__")[0] in params]:
            if p == "gravity_condition":
                g = d["gravity"]
                out[p] = {"parameter": p, "availability": "metadata" if g["condition"] else "missing", "value": g["condition"], "source": g["source"],
                          "granularity": "investigation"}
                continue
            st = stats.get(p)
            if not st:
                out[p] = {"parameter": p, "availability": "missing"}
                continue
            a = _availability(st)
            if a == "source_reported" and p in extracted and all(h for h in st["headers"]):
                csv_usable = any(m["parameter"] == p and m["extraction_method"] == "csv_cell" and m["value_status"] in M.USABLE for m in M.measurements(acc))
                if not csv_usable:
                    a = "extracted"
            out[p] = {"parameter": p, "availability": a, "unit": st["unit"], "min": st["min"], "max": st["max"], "n_usable": st["n_usable"],
                      "n_total": st["n_total"], "statuses": st["statuses"], "headers": st["headers"], "examples": st["examples"], "kinds": st["kinds"],
                      "granularity": d["granularity"]}
    for e in out.values():
        cls = EVIDENCE_CLASS.get(e["availability"], "missing")
        if cls in ("measured", "reported") and e.get("min") is not None and _approx_share(acc, e["parameter"]) > 0.5:
            cls = "estimated"  # most usable cells carry '~' / 'approx' in the source
        e["evidence_class"] = cls
    return out


def _approx_share(acc: str, p: str) -> float:
    ms = [m for m in M.measurements(acc) if m["parameter"] == p.split("__")[0] and m["value_status"] in M.USABLE]
    return sum(1 for m in ms if m["approximate"]) / len(ms) if ms else 0.0


def _gas_summary(d: dict) -> dict:
    obs = [o for o in d["observations"] if o["row_type"] != "duplicate"]
    prof = physics.PHYS.get(d["accession"], {}).get("gas", {})
    st = Counter((o.get("gas") or {}).get("status") for o in obs)
    dil = Counter((o.get("gas") or {}).get("primary_diluent") for o in obs if (o.get("gas") or {}).get("primary_diluent"))
    mixtures = sum(1 for o in obs if (o.get("gas") or {}).get("mixture"))
    unresolved = sum(1 for o in obs if (o.get("gas") or {}).get("unresolved_species"))
    ex = next((o["gas"] for o in obs if (o.get("gas") or {}).get("status") not in (None, "missing")), None)
    cls = {"columns": "reported", "row_text": "estimated", "campaign_alternatives": "reported", "source_term": "assumed",
           "investigation_statement": "reported", "not_reported": "missing"}.get(prof.get("mode"), "missing")
    return {"mode": prof.get("mode", "not_reported"), "mode_definition": physics.GAS_MODES.get(prof.get("mode", "not_reported")), "basis": prof.get("basis"),
            "candidates": prof.get("candidates", []), "status_counts": dict(st), "primary_diluents": dict(dil), "mixture_rows": mixtures,
            "rows_with_unresolved_species": unresolved, "example": ex, "evidence_class": cls,
            "statement": "A missing diluent is reported as missing; it is never assumed to be air or nitrogen."}


def _flow_summary(d: dict) -> dict:
    obs = [o for o in d["observations"] if o["row_type"] != "duplicate"]
    prof = physics.PHYS.get(d["accession"], {}).get("flow", {})
    cfg = Counter(o.get("flow_configuration") for o in obs)
    neg = sum(1 for o in obs if "negative_flow_value" in ((o.get("flow") or {}).get("velocity_flags") or []))
    return {"mode": prof.get("mode", "not_reported"), "configurations": {k: {"n": v, "label": physics.FLOW_CONFIGS.get(k or "unknown", {}).get("label"),
                                                                            "family": physics.flow_family(k)} for k, v in cfg.items() if k},
            "source_term": prof.get("source_term"), "direction": prof.get("direction"), "reference_frame": prof.get("reference_frame"),
            "measurement_method": prof.get("measurement_method", "not_reported"), "velocity_column": prof.get("velocity_column"), "basis": prof.get("basis"),
            "negative_velocity_rows": neg, "evidence_class": "reported" if prof.get("mode") in ("row_column_map", "column") else ("reported" if prof.get("mode") == "investigation" else "missing")}


def _uncertainty_summary(acc: str) -> dict:
    ms = [m for m in M.measurements(acc) if m.get("uncertainty")]
    st = Counter(m["uncertainty"]["status"] for m in ms)
    mt = Counter(m["uncertainty"]["measurement_type"] for m in ms if m["value_status"] in M.USABLE)
    calc = [m for m in M.measurements(acc) if m["value_status"] == "calculated"]
    return {"by_status": dict(st), "measurement_type": dict(mt), "ranges_with_bounds": sum(1 for m in ms if m["uncertainty"].get("lower") is not None),
            "approximate_values": sum(1 for m in ms if m["uncertainty"].get("approximate")),
            "detection_limits": sum(1 for m in ms if m["uncertainty"].get("detection_limit") is not None),
            "po2_propagation": dict(Counter((m.get("uncertainty") or {}).get("status") for m in calc)),
            "statement": "No numeric measurement uncertainty is stated in this table; values are reported as 'uncertainty_not_reported' and never assumed zero."
            if not st.get("reported") else "Numeric uncertainty is stated for some columns; pO2 uncertainty is propagated only where both inputs have it."}


def linked_records(acc: str) -> list[str]:
    return [i.id for i in INVESTIGATIONS if acc in i.psi_accessions]


def passport(acc: str) -> dict | None:
    r = psi.PSI.get(acc)
    if not r:
        return None
    d = M.DATASETS[acc]
    cov = coverage(acc)
    groups = [{"group": g, "parameters": [cov[p] for p in ps] + [dict(cov[v], parameter=v) for p in ps for v in sorted(cov) if v.startswith(p + "__")]}
              for g, ps in PASSPORT_PARAMS]
    core_avail = {p: cov[p]["availability"] for p in CORE}
    known = [p for p, a in core_avail.items() if a not in ("missing", "ambiguous", "unresolved")]
    rel = M.RELATED_UNLINKED.get(acc)
    return {
        "accession": acc, "title": r["title"], "acronym": r["acronym"], "doi": r["doi"], "landing_url": r["landing_url"],
        "research_area": r["research_area"], "sub_research_area": r["sub_research_area"], "project_type": r["project_type"],
        "flight_platform": r["flight_platform"], "hardware": r["hardware"], "start_date": r["start_date"], "end_date": r["end_date"],
        "objective": r["objective"], "objective_source": "PSI investigation metadata (verbatim)",
        "study_type": d["study_type"], "granularity": d["granularity"], "granularity_definition": d["granularity_definition"],
        "granularity_basis": d["granularity_basis"], "row_label": d["row_label"], "dataset_notes": d["dataset_notes"],
        "gravity": d["gravity"], "kb_records": linked_records(acc), "related_unlinked": rel,
        "publications": r["publications"], "table": ({"file": d["file"], "sha256": d["sha256"], "encoding": d["encoding"], "columns": len(d["columns"]),
                                                       "rows": d["quality"]["total_rows"]} if d["file"] else None),
        "columns": [{k: c[k] for k in ("header", "parameter", "dimension", "header_unit", "qualifier", "role", "status", "confidence", "value_basis", "note", "unit_inferred", "gravity")}
                    for c in d["columns"]],
        "groups": groups,
        "core_completeness": {"known": len(known), "total": len(CORE), "by_parameter": core_avail},
        "quality": d["quality"],
        "issues": d["issues"][:200], "issues_total": len(d["issues"]),
        "observations": len(d["observations"]),
        "observation_class": d.get("observation_class"), "observation_class_basis": d.get("observation_class_basis"),
        "observation_class_definition": physics.OBSERVATION_CLASSES.get(d.get("observation_class") or ""),
        "eligibility": dict(Counter(o["eligibility_reason"] for o in d["observations"])),
        "gas": _gas_summary(d), "flow": _flow_summary(d), "geometry": d.get("geometry"), "uncertainty": _uncertainty_summary(acc),
        "ignition": {p: cov[p] for p in ("ignition_power", "ignition_duration")},
        "evidence_classes": dict(Counter(e["evidence_class"] for e in cov.values())),
        "source_references": {"doi": r["doi"], "landing_url": r["landing_url"], "table_file": d["file"], "table_sha256": d["sha256"],
                              "publications": len(r["publications"] or [])},
        "limitations": _limitations(acc, d, cov),
    }


def _limitations(acc: str, d: dict, cov: dict) -> list[str]:
    """Plain statements derived from the data (codes; the UI localizes them)."""
    out = []
    if not d["file"]:
        out.append("no_experiment_table")
    if d["granularity"] in ("test_day_summary", "test_matrix"):
        out.append("summary_granularity")
    if d["granularity"] == "publication_figure_index":
        out.append("figure_index_only")
    if d["study_type"] != "flight_experiment":
        out.append("not_flight_experiment")
    for p in ("oxygen_mole_fraction", "total_pressure", "flow_velocity"):
        if cov[p]["availability"] == "missing":
            out.append(f"missing:{p}")
    if cov["unresolved_species"]["availability"] != "missing":
        out.append("ambiguous_species_column")
    if any(c["value_basis"] == "source_derived" for c in d["columns"]):
        out.append("source_derived_values")
    if d["quality"]["duplicate_rows"]:
        out.append("duplicate_rows")
    cls = d.get("observation_class")
    if cls in ("non_combustion", "smoke_aerosol", "combustion_test_log"):
        out.append(f"observation_class:{cls}")
    gm = physics.PHYS.get(acc, {}).get("gas", {}).get("mode", "not_reported")
    if gm in ("not_reported", "source_term", "investigation_statement"):
        out.append(f"diluent:{gm}")
    if any(o.get("gas", {}).get("unresolved_species") for o in d["observations"]):
        out.append("diluent:unresolved_species")
    out.append("uncertainty_not_reported")
    return out


def coverage_matrix() -> list[dict]:
    """Collection-wide: one row per PSI accession with the availability code of each core parameter."""
    rows = []
    for acc in M.DATASETS:
        cov = coverage(acc)
        d = M.DATASETS[acc]
        rows.append({"accession": acc, "acronym": psi.PSI[acc]["acronym"], "study_type": d["study_type"], "granularity": d["granularity"],
                     "observations": len(d["observations"]), "kb_records": linked_records(acc),
                     "parameters": {p: cov[p]["availability"] for p in CORE + ["flow_direction", "burn_time", "flame_spread_rate", "extinction_diameter"]},
                     "observation_class": d.get("observation_class"), "diluent_mode": physics.PHYS.get(acc, {}).get("gas", {}).get("mode"),
                     "flow_configurations": sorted({o.get("flow_configuration") for o in d["observations"] if o.get("flow_configuration") not in (None, "unknown")})})
    return rows
