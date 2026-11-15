"""Condition-to-experiment matching (explainable, unweighted).

For each PSI dataset, each observation (one row of a published table) is compared with the scenario target, dimension
by dimension, using documented comparison tolerances (TOLERANCES). The dataset's reported state per dimension comes
from its BEST observation (the row that matches the most dimensions jointly), so atmosphere values that never
occurred together are never combined. Marginal closest values are also reported.

States: MATCH, PARTIAL_MATCH, MISMATCH, MISSING_IN_EXPERIMENT, MISSING_IN_SCENARIO, NOT_COMPARABLE.

Ranking (no weights): requested = dimensions the scenario defines; comparable = MATCH + PARTIAL + MISMATCH.
  * comparable < 2  -> "insufficient_data" (listed after ranked datasets, never ranked)
  * else ordered by (MATCH + 0.5·PARTIAL)/requested, then fewer MISMATCH, then smaller summed normalized distance
The resulting band (high/moderate/low) is a ranking aid, NOT a probability of safety and NOT scientific equivalence.
"""
from __future__ import annotations

import math

from .. import psi
from . import measurements as M, physics

# Comparison tolerances. Engineering choices documented in docs/SCIENTIFIC_METHODS.md; they define what "close" means
# for ranking only. kind: abs (same unit), rel (|ln(a/b)|), absrel (max(rel*target, floor)).
TOLERANCES = {
    "oxygen_mole_fraction": {"kind": "abs", "match": 0.02, "partial": 0.05, "unit": "fraction"},
    "total_pressure": {"kind": "rel", "match": 0.10, "partial": 0.35, "unit": "kPa"},
    "oxygen_partial_pressure": {"kind": "rel", "match": 0.10, "partial": 0.25, "unit": "kPa"},
    "flow_velocity": {"kind": "absrel", "match": (0.20, 2.0), "partial": (0.50, 5.0), "unit": "cm/s"},
    "specimen_thickness": {"kind": "rel", "match": 0.25, "partial": 1.0, "unit": "mm"},
    "ignition_power": {"kind": "rel", "match": 0.25, "partial": 1.0, "unit": "W", "provisional": True},
    "ignition_duration": {"kind": "rel", "match": 0.25, "partial": 1.0, "unit": "s", "provisional": True},
}
CONTINUOUS = list(TOLERANCES)
CATEGORICAL = ["gravity", "material", "diluent", "flow_configuration", "specimen_geometry"]
ALL_DIMS = ["oxygen_mole_fraction", "total_pressure", "oxygen_partial_pressure", "diluent", "flow_configuration", "flow_velocity", "gravity", "material",
            "specimen_geometry", "specimen_thickness", "ignition_power", "ignition_duration"]
OBS_KEYS = {"oxygen_mole_fraction": ("x_o2", "x_o2_interval", "x_o2_values"), "total_pressure": ("p_kpa", "p_interval", "p_values"),
            "oxygen_partial_pressure": ("po2_kpa", None, None), "flow_velocity": ("flow_cm_s", "flow_interval", "flow_values"),
            "specimen_thickness": ("thickness_mm", "thickness_interval", None), "ignition_power": ("ignition_power_w", None, None),
            "ignition_duration": ("ignition_duration_s", None, None)}


def _dist(dim: str, target: float, value: float) -> float:
    """Distance in units of the MATCH tolerance (1.0 = at the match boundary)."""
    t = TOLERANCES[dim]
    if t["kind"] == "abs":
        return abs(value - target) / t["match"]
    if t["kind"] == "rel":
        if value <= 0 or target <= 0:
            return math.inf
        return abs(math.log(value / target)) / math.log(1 + t["match"])
    rel, floor = t["match"]
    return abs(value - target) / max(rel * abs(target), floor)


def _partial_limit(dim: str, target: float) -> float:
    t = TOLERANCES[dim]
    if t["kind"] == "abs":
        return t["partial"] / t["match"]
    if t["kind"] == "rel":
        return math.log(1 + t["partial"]) / math.log(1 + t["match"])
    (rm, fm), (rp, fp) = t["match"], t["partial"]
    return max(rp * abs(target), fp) / max(rm * abs(target), fm)


def _state(dim: str, d: float, target: float) -> str:
    eps = 1e-9  # boundary values are inclusive regardless of floating-point rounding
    if d <= 1.0 + eps:
        return "MATCH"
    if d <= _partial_limit(dim, target) + eps:
        return "PARTIAL_MATCH"
    return "MISMATCH"


def _values(o: dict, dim: str) -> tuple[str | None, float | None, list | None]:
    """(shape, nearest-able value(s)) for one observation: 'point' | 'interval' | 'set'."""
    k1, k2, k3 = OBS_KEYS[dim]
    if o.get(k1) is not None:
        return "point", o[k1], None
    if k2 and o.get(k2):
        return "interval", None, o[k2]
    if k3 and o.get(k3):
        return "set", None, o[k3]
    return None, None, None


def _nearest(shape, v, many, target):
    if shape == "point":
        return v
    if shape == "interval":
        lo, hi = min(many), max(many)
        return min(max(target, lo), hi)
    return min(many, key=lambda x: abs(x - target))


GRAV_OBS = {"microgravity": "microgravity", "not_applicable_ground": None}


def _categorical(dim: str, target: dict, o: dict) -> tuple[str, str | None]:
    if dim == "gravity":
        g = o.get("gravity")
        if g is None:
            return "MISSING_IN_EXPERIMENT", None
        if g == "not_applicable_ground":
            return "NOT_COMPARABLE", g
        return ("MATCH" if g == target["value"] else "MISMATCH"), g
    if dim == "material":
        if not target.get("canonical"):
            return "NOT_COMPARABLE", o.get("material") or o.get("material_raw")  # reason: target material not recognized
        if not o.get("material"):
            if target["canonical"] in (o.get("material_components") or []):
                return "PARTIAL_MATCH", o.get("material_raw")  # blend containing the target material
            return ("MISSING_IN_EXPERIMENT" if not o.get("material_raw") else "NOT_COMPARABLE"), o.get("material_raw")
        if o["material"] == target["canonical"]:
            # diluted or blended fuel is never an exact match for the pure material
            return ("PARTIAL_MATCH" if o.get("material_mixture") else "MATCH"), o["material"]
        if target.get("fuel_class") and o.get("fuel_class") == target["fuel_class"]:
            return "PARTIAL_MATCH", o["material"]
        if not target.get("canonical"):
            return "NOT_COMPARABLE", o["material"]
        return "MISMATCH", o["material"]
    if dim == "diluent":
        st, val, _ = physics.compare_diluent(target, o.get("gas"))
        return st, val
    if dim == "flow_configuration":
        st, _ = physics.compare_flow_configuration(target["value"], o.get("flow_configuration"))
        return st, o.get("flow_configuration")
    if dim == "specimen_geometry":
        return physics.compare_geometry(target["value"], o.get("geometry")), o.get("geometry")
    raise KeyError(dim)


def _flow_gate(o: dict, targets: dict) -> tuple[str | None, str | None]:
    """Cap or block a flow-velocity comparison by configuration semantics.
    Returns (cap, reason): cap None = no restriction, 'PARTIAL_MATCH' = at most partial, 'NOT_COMPARABLE' = blocked."""
    obs_cfg = o.get("flow_configuration")
    if "flow_configuration" not in targets:
        return "PARTIAL_MATCH", "scenario_flow_configuration_undefined"
    st, why = physics.compare_flow_configuration(targets["flow_configuration"]["value"], obs_cfg)
    if st == "MISMATCH":
        return "NOT_COMPARABLE", "incompatible_flow_configuration"
    if st == "MATCH":
        return None, None
    return "PARTIAL_MATCH", why


def compare_observation(o: dict, targets: dict) -> dict:
    dims = {}
    for dim in ALL_DIMS:
        if dim not in targets:
            continue
        tgt = targets[dim]
        if dim in CATEGORICAL:
            st, val = _categorical(dim, tgt, o)
            dims[dim] = {"state": st, "value": val, "distance": None}
            continue
        shape, v, many = _values(o, dim)
        if shape is None:
            dims[dim] = {"state": "MISSING_IN_EXPERIMENT", "value": None, "distance": None}
            continue
        near = _nearest(shape, v, many, tgt["value"])
        d = _dist(dim, tgt["value"], near)
        st = _state(dim, d, tgt["value"])
        e = {"state": st, "value": near, "shape": shape, "interval": many if shape == "interval" else None,
             "set": many if shape == "set" else None, "distance": round(d, 3) if math.isfinite(d) else None,
             "difference": round(near - tgt["value"], 6), "relative_difference": round((near - tgt["value"]) / tgt["value"], 4) if tgt["value"] else None}
        if dim == "flow_velocity":
            cap, why = _flow_gate(o, targets)
            e["configuration"] = o.get("flow_configuration")
            if cap == "NOT_COMPARABLE":
                e.update(state="NOT_COMPARABLE", reason=why, numeric_state=st)
            elif cap == "PARTIAL_MATCH" and st == "MATCH":
                e.update(state="PARTIAL_MATCH", reason=why, numeric_state=st)
            elif why:
                e["reason"] = why
        dims[dim] = e
    return dims


def _rank_key(dims: dict) -> tuple:
    m = sum(1 for d in dims.values() if d["state"] == "MATCH")
    p = sum(1 for d in dims.values() if d["state"] == "PARTIAL_MATCH")
    x = sum(1 for d in dims.values() if d["state"] == "MISMATCH")
    # a row that reports a dimension (even an incompatible one) is preferred over a row that reports nothing for it;
    # distances of NOT_COMPARABLE dimensions do not count
    miss = sum(1 for d in dims.values() if d["state"] == "MISSING_IN_EXPERIMENT")
    dist = sum(min(d["distance"], 50) for d in dims.values() if d.get("distance") is not None and d["state"] != "NOT_COMPARABLE")
    return (-(m + 0.5 * p), x, miss, dist)


def match_dataset(acc: str, targets: dict) -> dict:
    ds = M.DATASETS[acc]
    cls = physics.observation_class(acc)
    # rows that are not flame observations (dust sessions, smoke-generation runs) are never matched as fire evidence
    obs = [o for o in ds["observations"] if o["row_type"] != "duplicate"] if cls not in ("non_combustion", "smoke_aerosol") else []
    requested = [d for d in ALL_DIMS if d in targets]
    base = {"accession": acc, "acronym": psi.PSI[acc]["acronym"], "title": psi.PSI[acc]["title"], "study_type": ds["study_type"],
            "granularity": ds["granularity"], "row_label": ds["row_label"], "observations_total": len(obs), "kb_records": [],
            "requested": requested, "landing_url": psi.PSI[acc]["landing_url"], "doi": psi.PSI[acc]["doi"],
            "observation_class": cls, "observation_class_basis": ds.get("observation_class_basis")}
    from .passport import linked_records
    base["kb_records"] = linked_records(acc)
    if not obs:
        reason = ("not_flame_observations" if cls in ("non_combustion", "smoke_aerosol") else "no_table" if not ds["file"]
                  else ("figure_index" if ds["granularity"] == "publication_figure_index" else "no_condition_values"))
        dims = {d: {"state": "NOT_COMPARABLE" if d == "gravity" and ds["gravity"]["condition"] == "not_applicable_ground" else "MISSING_IN_EXPERIMENT",
                    "value": None, "distance": None} for d in requested}
        return {**base, "dimensions": _decorate(dims, targets, ds, None), "best_observation": None, "joint_matches": 0,
                "counts": _counts(dims, requested), "ranking_status": "insufficient_data", "band": None, "reason": reason}
    scored = []
    for o in obs:
        dims = compare_observation(o, targets)
        scored.append((_rank_key(dims), o, dims))
    scored.sort(key=lambda s: s[0])
    _, best, dims = scored[0]
    if ds["granularity"] == "test_day_summary":
        # per-day lists of approximate values: the day included such a value, but not a test at that exact condition
        for d, x in dims.items():
            if d in CONTINUOUS and x["state"] == "MATCH" and x.get("shape") == "set":
                x["state"] = "PARTIAL_MATCH"
                x["summary_list"] = True
    if ds["granularity"] == "test_matrix":
        # campaign lists: each dimension is met by SOME listed value, but the tested combination is not published.
        for d, x in dims.items():
            if d in CONTINUOUS and x["state"] == "MATCH":
                x["state"] = "PARTIAL_MATCH"
                x["envelope"] = True
    cont =[d for d in requested if d in CONTINUOUS and dims[d]["state"] in ("MATCH", "PARTIAL_MATCH", "MISMATCH")]
    joint = 0 if ds["granularity"] == "test_matrix" else sum(1 for _, o, ds_ in scored if cont and all(ds_[d]["state"] == "MATCH" for d in cont))
    counts = _counts(dims, requested)
    status = "ranked" if counts["comparable"] >= 2 else "insufficient_data"
    score = (counts["match"] + 0.5 * counts["partial"]) / counts["requested"] if counts["requested"] else 0
    band = None if status != "ranked" else ("high" if score >= 0.75 and counts["mismatch"] == 0 else "moderate" if score >= 0.5 else "low")
    marginal = {}
    for d in requested:
        if d in CONTINUOUS:
            cands = [(dd[d]["distance"], dd[d]["value"], o["row"]) for _, o, dd in scored if dd[d].get("distance") is not None]
            if cands:
                dmin = min(cands)
                marginal[d] = {"value": dmin[1], "row": dmin[2], "distance": dmin[0]}
    return {**base, "dimensions": _decorate(dims, targets, ds, best), "marginal_closest": marginal, "best_observation": {"row": best["row"], "label": best["label"], "id": best["id"]},
            "joint_matches": joint, "joint_dimensions": cont, "counts": counts, "ranking_status": status, "band": band,
            "score_fraction": {"numerator": counts["match"] + 0.5 * counts["partial"], "denominator": counts["requested"]}, "_key": scored[0][0]}


def _counts(dims: dict, requested: list) -> dict:
    c = {s: sum(1 for d in dims.values() if d["state"] == s) for s in ("MATCH", "PARTIAL_MATCH", "MISMATCH", "MISSING_IN_EXPERIMENT", "NOT_COMPARABLE")}
    comparable = c["MATCH"] + c["PARTIAL_MATCH"] + c["MISMATCH"]
    return {"requested": len(requested), "comparable": comparable, "match": c["MATCH"], "partial": c["PARTIAL_MATCH"], "mismatch": c["MISMATCH"],
            "missing": c["MISSING_IN_EXPERIMENT"], "not_comparable": c["NOT_COMPARABLE"],
            "evidence_completeness": round(comparable / len(requested), 2) if requested else None}


def _decorate(dims: dict, targets: dict, ds: dict, best: dict | None) -> list[dict]:
    """Attach target, unit, method and source reference to each dimension comparison."""
    out = []
    for d in ALL_DIMS:
        if d not in targets:
            out.append({"dimension": d, "state": "MISSING_IN_SCENARIO"})
            continue
        x = dims[d]
        t = targets[d]
        ref = None
        if best is not None:
            key = {"oxygen_mole_fraction": "x_o2", "total_pressure": "p", "flow_velocity": "flow", "specimen_thickness": "thickness", "material": "material",
                   "ignition_power": "ignition_power", "ignition_duration": "ignition_duration"}.get(d)
            ref = best["refs"].get(key) if key else (f"{best['id']}:pO2" if d == "oxygen_partial_pressure" and best.get("po2_kpa") is not None else None)
            if d == "diluent":
                ref = ", ".join((best.get("gas") or {}).get("refs") or []) or None
            if d == "flow_configuration":
                ref = (best.get("flow") or {}).get("configuration_ref")
        e = {"dimension": d, "state": x["state"], "target": t["value"], "target_origin": t.get("origin"), "experiment_value": x.get("value"),
             "unit": TOLERANCES[d]["unit"] if d in TOLERANCES else None, "difference": x.get("difference"), "relative_difference": x.get("relative_difference"),
             "distance": x.get("distance"), "shape": x.get("shape"), "interval": x.get("interval"), "set": x.get("set"),
             "method": _method(d), "source_ref": ref,
             "value_basis": "calculated" if d == "oxygen_partial_pressure" else ("metadata" if d == "gravity" else "source_table"),
             "granularity": "investigation" if d == "gravity" else ds["granularity"]}
        if x.get("reason"):
            e["reason"] = x["reason"]
        if d == "gravity":
            e["source_ref"] = ds["gravity"]["source"]
        if d == "diluent" and best is not None:
            g = best.get("gas") or {}
            e["reason"] = physics.compare_diluent(t, g)[2]
            e["gas_status"] = g.get("status")
            e["source_ref"] = e["source_ref"] or g.get("basis")
            e["value_basis"] = {"numeric_composition": "source_table", "qualitative": "source_text", "campaign_alternatives": "source_table",
                                "source_term": "source_term", "investigation_statement": "metadata"}.get(g.get("status"), "missing")
        if d == "flow_configuration" and best is not None:
            f = best.get("flow") or {}
            e["reason"] = physics.compare_flow_configuration(t["value"], f.get("configuration"))[1]
            e["source_ref"] = e["source_ref"] or f.get("basis")
            e["value_basis"] = "source_table" if f.get("mode") in ("row_column_map", "column") else "metadata"
        if d == "specimen_geometry":
            e["source_ref"] = (ds.get("geometry") or {}).get("basis")
            e["value_basis"], e["granularity"] = "metadata", "investigation"
        if d == "material":
            e["target_recognized"] = bool(t.get("canonical"))
        out.append(e)
    return out


def _method(d: str) -> str:
    if d in TOLERANCES:
        t = TOLERANCES[d]
        if t["kind"] == "abs":
            return f"absolute difference; match ≤ {t['match']}, partial ≤ {t['partial']} ({t['unit']})"
        if t["kind"] == "rel":
            return f"ratio; match within ±{int(t['match'] * 100)} %, partial within ±{int(t['partial'] * 100)} %"
        (rm, fm), (rp, fp) = t["match"], t["partial"]
        return f"absolute difference; match ≤ max({int(rm * 100)} % of target, {fm} {t['unit']}), partial ≤ max({int(rp * 100)} %, {fp} {t['unit']})"
    return {"gravity": "category equality (PSI platform metadata)", "material": "canonical material equality; same fuel class = partial",
            "diluent": "gas identity / composition (|Δx| ≤ 0.05 match, ≤ 0.10 partial); air vs N2 = partial; campaign alternatives = partial; missing never matches",
            "flow_configuration": "configuration equality; direction-unstated forced flow vs concurrent/opposed = partial; different families incompatible",
            "specimen_geometry": "category equality (investigation metadata); unspecified solid vs flat sheet = partial"}[d]


def rank(targets: dict, limit: int = 12) -> dict:
    results = [match_dataset(a, targets) for a in M.DATASETS]
    ranked = sorted([r for r in results if r["ranking_status"] == "ranked"], key=lambda r: r["_key"])
    insufficient = [r for r in results if r["ranking_status"] != "ranked"]
    insufficient.sort(key=lambda r: (-r["counts"]["comparable"], r["accession"]))
    for r in results:
        r.pop("_key", None)
    for i, r in enumerate(ranked, 1):
        r["rank"] = i
    return {"ranked": ranked[:limit], "ranked_total": len(ranked), "insufficient": insufficient,
            "status": "ok" if ranked else "insufficient_data_for_reliable_ranking",
            "tolerances": TOLERANCES, "method": __doc__.strip()}
