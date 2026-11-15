"""Experimental coverage maps and deterministic research-gap detection.

Coverage is computed only from normalized observations of the ingested PSI tables. Scenario targets are drawn
separately and are never counted as observations. Nothing is interpolated.

Classification rules (COVERAGE_RULES), evaluated per parameter combination:
  NOT_ASSESSABLE         the scenario does not define every parameter of the combination
  INSUFFICIENT_METADATA  no observation reports all parameters of the combination (as single values or per-row lists)
  NO_MATCHING_RECORDS    observations report the parameters, but none matches all of them within MATCH tolerance
  SPARSE_COVERAGE        1-2 matching observations
  LIMITED_COVERAGE       >= 3 matching observations, all from ONE PSI investigation
  OBSERVED               >= 3 matching observations from >= 2 PSI investigations
Campaign test-matrix rows (lists/ranges whose combinations are not published) never count as matches; when their
ranges include the target this is reported as a separate note. Duplicate rows are excluded.
"Matching" uses the same tolerances as the matching engine (matching.TOLERANCES).
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict

from .. import psi
from . import matching, measurements as M, physics
from .explain import fmt
from .texts_sci import label, tx

COVERAGE_RULES = {"sparse_max": 2, "observed_min_matches": 3, "observed_min_investigations": 2}
ENVELOPE = {"test_matrix"}

COMBOS = [
    ("o2_p", "gap_o2p", ["oxygen_mole_fraction", "total_pressure"]),
    ("po2_p", "gap_po2p", ["oxygen_partial_pressure", "total_pressure"]),
    ("diluent_o2", "gap_diluent_o2", ["diluent", "oxygen_mole_fraction"]),
    ("flow_o2", "gap_flowo2", ["flow_velocity", "oxygen_mole_fraction"]),
    ("flowcfg_material", "gap_flowcfg_material", ["flow_configuration", "material"]),
    ("flow_gravity", "gap_flow_gravity", ["flow_velocity", "gravity"]),
    ("material_atm", "gap_material_atm", ["material", "oxygen_mole_fraction"]),
    ("gravity_o2", "gap_gravity_o2", ["gravity", "oxygen_mole_fraction"]),
    ("gravity", "gap_gravity", ["gravity"]),
    ("thickness_material", "gap_thickness", ["specimen_thickness", "material"]),
]
# Parameters that constrain a combination implicitly when the scenario defines them (an atmosphere is O2 + diluent;
# a flow velocity is meaningful only within its configuration).
CONTEXT = {"diluent": ("oxygen_mole_fraction", "oxygen_partial_pressure", "total_pressure"), "flow_configuration": ("flow_velocity",)}


def _obs():
    return [o for o in M.all_observations() if o["accession"] in psi.PSI]


def eligible_observations() -> tuple[list[dict], Counter]:
    """Observations that may evidence COMBUSTION coverage, and the count of excluded rows by reason."""
    ok, excluded = [], Counter()
    for o in M.all_observations(include_duplicates=True):
        if o["combustion_eligible"]:
            ok.append(o)
        else:
            excluded[o["eligibility_reason"]] += 1
    return ok, excluded


def _p(v):
    return None if v is None else round(v, 6)


def coverage_map(targets: dict | None = None) -> dict:
    """Plot-ready observations (never interpolated). Units: O2 in %, pressures in kPa, flow in cm/s."""
    obs = _obs()
    o2p, po2p, flowo2, env = [], [], [], []
    only_o2, only_p = Counter(), Counter()
    obs = [o for o in obs if o["combustion_eligible"]]
    for o in obs:
        base = {"id": o["id"], "accession": o["accession"], "row": o["row"], "label": o["label"], "granularity": o["granularity"],
                "material": o["material"], "x_o2_basis": o["x_o2_basis"], "x_o2_confidence": o["x_o2_confidence"],
                "approximate": o["approximate_o2"] or o["p_approximate"], "gravity": o["gravity"],
                "diluent": o.get("diluent"), "gas_status": (o.get("gas") or {}).get("status"), "flow_configuration": o.get("flow_configuration")}
        if o["granularity"] in ENVELOPE:
            xs = o["x_o2_values"] or o["x_o2_interval"]
            ps = o["p_values"] or o["p_interval"]
            fs = o["flow_values"] or o["flow_interval"]
            env.append({**base, "o2_pct": [min(xs) * 100, max(xs) * 100] if xs else None, "p_kpa": [min(ps), max(ps)] if ps else None,
                        "flow_cm_s": [min(fs), max(fs)] if fs else None, "o2_list": [x * 100 for x in (o["x_o2_values"] or [])], "p_list": o["p_values"] or []})
            continue
        if o["x_o2"] is not None and o["p_kpa"] is not None:
            o2p.append({**base, "o2_pct": _p(o["x_o2"] * 100), "p_kpa": _p(o["p_kpa"])})
        elif o["x_o2"] is not None or o["x_o2_values"] or o["x_o2_interval"]:
            only_o2[o["accession"]] += 1
        elif o["p_kpa"] is not None:
            only_p[o["accession"]] += 1
        if o["po2_kpa"] is not None:
            po2p.append({**base, "po2_kpa": _p(o["po2_kpa"]), "p_kpa": _p(o["p_kpa"])})
        x = o["x_o2"] if o["x_o2"] is not None else (sum(o["x_o2_interval"]) / 2 if o["x_o2_interval"] else None)
        if x is not None and o["flow_cm_s"] is not None:
            flowo2.append({**base, "o2_pct": _p(x * 100), "o2_interval_pct": [v * 100 for v in o["x_o2_interval"]] if o["x_o2_interval"] else None,
                           "flow_cm_s": _p(o["flow_cm_s"])})
    flow_only = Counter(o["accession"] for o in obs if o["flow_cm_s"] is not None and o["x_o2"] is None and not o["x_o2_interval"] and o["granularity"] not in ENVELOPE)
    # material x oxygen bins (counts only; bins are 5 percentage points wide, labelled by range)
    mat = defaultdict(Counter)
    mat_no_o2 = Counter()
    for o in obs:
        if not o["material"] or o["granularity"] in ENVELOPE:
            continue
        xs = [o["x_o2"]] if o["x_o2"] is not None else (o["x_o2_values"] or [])
        if not xs:
            mat_no_o2[o["material"]] += 1
        for x in xs:
            b = int(x * 100 // 5) * 5
            mat[o["material"]][f"{b}-{b + 5}"] += 1
    grav = Counter((M.DATASETS[a]["gravity"]["condition"] or "unknown") for a in M.DATASETS)
    elig, excl = eligible_observations()
    grav_obs = Counter((o["gravity"] or "unknown") for o in elig)
    grav_excluded = Counter((o["gravity"] or "unknown", o["eligibility_reason"]) for o in M.all_observations(include_duplicates=True) if not o["combustion_eligible"])
    return {
        "o2_vs_p": {"points": o2p, "n": len(o2p), "datasets": sorted({p["accession"] for p in o2p}, key=_acc_key), "envelopes": [e for e in env if e["o2_pct"] and e["p_kpa"]],
                    "o2_without_pressure": dict(only_o2), "pressure_without_o2": dict(only_p), "x_unit": "%", "y_unit": "kPa"},
        "po2_vs_p": {"points": po2p, "n": len(po2p), "datasets": sorted({p["accession"] for p in po2p}, key=_acc_key), "x_unit": "kPa", "y_unit": "kPa",
                     "value_status": "calculated"},
        "flow_vs_o2": {"points": flowo2, "n": len(flowo2), "datasets": sorted({p["accession"] for p in flowo2}, key=_acc_key), "envelopes": [e for e in env if e["o2_pct"] and e["flow_cm_s"]],
                       "flow_without_o2": dict(flow_only), "x_unit": "%", "y_unit": "cm/s"},
        "material_vs_o2": {"bins": {m: dict(c) for m, c in sorted(mat.items())}, "material_without_o2": dict(mat_no_o2)},
        "gravity": {"datasets": dict(grav), "observations": dict(grav_obs), "eligible_only": True,
                    "excluded": [{"gravity": g, "reason": r, "n": n} for (g, r), n in sorted(grav_excluded.items())],
                    "note": "Only combustion observations that state at least one physical condition are counted (dust sessions, smoke-generation runs and material-only test logs are excluded)."},
        "targets": targets or {},
        "eligibility": {"eligible": len(elig), "excluded": dict(excl)},
        "totals": {"observations": len(obs), "by_granularity": dict(Counter(o["granularity"] for o in obs)),
                   "duplicates_excluded": sum(1 for o in M.all_observations(include_duplicates=True) if o["row_type"] == "duplicate")},
        "disclaimer": "Points are published table rows (or PyroLens-calculated pO2 from them). No interpolation; projections omit other dimensions. Velocities are never pooled across flow configurations.",
    }


def _acc_key(a: str) -> int:
    return int(a.split("-")[1])


def _envelope_contains(o: dict, targets: dict, dims: list[str]) -> bool:
    ok = False
    for d in dims:
        if d not in matching.CONTINUOUS:
            continue
        shape, v, many = matching._values(o, d)
        if shape is None:
            return False
        t = targets[d]["value"]
        if shape == "interval":
            if not (min(many) <= t <= max(many)):
                return False
        else:  # point or discrete list: some stated value must be within MATCH tolerance
            vals = [v] if shape == "point" else many
            if not any(matching._dist(d, t, x) <= 1 + 1e-9 for x in vals):
                return False
        ok = True
    return ok


def analyze_combo(key: str, title_key: str, dims: list[str], targets: dict, lang: str) -> dict:
    title = tx(lang, title_key)
    res = {"id": None, "key": key, "title": title, "parameters": dims, "target": {d: targets[d] for d in dims if d in targets},
           "rule": None, "classification": None, "supporting_records": 0, "partial_records": 0, "reporting_records": 0,
           "accessions": [], "evidence_refs": [], "nearest": None, "missing_information": [], "envelope_note": None, "data_quality": [],
           "by_granularity": {}, "excluded": {}, "incompatible": {}, "demoted": {}, "context_parameters": [], "insufficiency_reasons": [],
           "assessment_method": "observation-level joint comparison with matching.TOLERANCES over combustion-eligible observations; thresholds COVERAGE_RULES"}
    absent = [d for d in dims if d not in targets]
    if absent:
        res["classification"] = "NOT_ASSESSABLE"
        res["explanation"] = tx(lang, "cov_NOT_ASSESSABLE", params=", ".join(label(lang, "param", d) for d in absent))
        res["missing_information"] = [f"scenario:{d}" for d in absent]
        res["insufficiency_reasons"] = [{"code": "scenario_parameter_undefined", "parameter": d} for d in absent]
        return res
    ctx = [c for c, applies in CONTEXT.items() if c in targets and c not in dims and any(d in applies for d in dims)]
    res["context_parameters"] = ctx
    sub = {d: targets[d] for d in dims + ctx}
    if "flow_velocity" in dims and "flow_configuration" in targets:
        sub["flow_configuration"] = targets["flow_configuration"]
    matched, partial, reporting, env_hits = [], [], [], []
    excluded, incompatible, demoted = Counter(), Counter(), Counter()
    nearest = None
    missing_by_param = Counter()
    elig, excl = eligible_observations()
    excluded.update(excl)
    for o in elig:
        if o["granularity"] in ENVELOPE:
            if _envelope_contains(o, sub, dims):
                env_hits.append(o)
            continue
        c = matching.compare_observation(o, sub)
        states = [c[d]["state"] for d in dims]
        for d in dims:
            if c[d]["state"] in ("MISSING_IN_EXPERIMENT", "NOT_COMPARABLE"):
                missing_by_param[d] += 1
        if "flow_velocity" in dims and c["flow_velocity"].get("reason") == "incompatible_flow_configuration":
            incompatible["incompatible_flow_configuration"] += 1
            continue
        if any(s in ("MISSING_IN_EXPERIMENT", "NOT_COMPARABLE") for s in states):
            continue
        cstates = {k: c[k]["state"] for k in ctx}
        if any(v == "MISMATCH" for v in cstates.values()):
            for k, v in cstates.items():
                if v == "MISMATCH":
                    incompatible[f"{k}_mismatch"] += 1
            continue
        reporting.append(o)
        unverified = [k for k, v in cstates.items() if v != "MATCH"]
        capped = [d for d in dims if c[d].get("reason") and c[d].get("numeric_state") == "MATCH"]
        if all(s == "MATCH" for s in states) and not unverified:
            matched.append((o, c))
        elif all(s in ("MATCH", "PARTIAL_MATCH") for s in states):
            partial.append((o, c))
            for k in unverified:
                demoted[f"{k}_unverified"] += 1
            for d in capped:
                demoted[c[d]["reason"]] += 1
        dist = math.sqrt(sum((c[d]["distance"] or 0) ** 2 for d in dims if c[d].get("distance") is not None)) + sum(0 if c[d]["state"] == "MATCH" else 5 for d in dims if d not in matching.CONTINUOUS)
        if nearest is None or dist < nearest[0]:
            nearest = (dist, o, c)
    accs = sorted({o["accession"] for o, _ in matched}, key=_acc_key)
    n = len(matched)
    reasons = []
    if not reporting:
        cls = "INSUFFICIENT_METADATA"
        expl = tx(lang, "cov_INSUFFICIENT_METADATA", params=" + ".join(label(lang, "param", d) for d in dims))
        reasons += [{"code": "parameter_not_reported", "parameter": d, "observations": k} for d, k in missing_by_param.items()]
    elif n == 0:
        cls = "NO_MATCHING_RECORDS"
        nb = ", ".join(f"{label(lang, 'param', d)} {fmt(d, nearest[2][d]['value'])}" for d in dims) + f" [{nearest[1]['id']}]" if nearest else "—"
        expl = tx(lang, "cov_NO_MATCHING_RECORDS", m=len(reporting), nearest=nb)
        reasons.append({"code": "no_observation_within_match_tolerance", "reporting": len(reporting)})
    elif n <= COVERAGE_RULES["sparse_max"]:
        cls = "SPARSE_COVERAGE"
        expl = tx(lang, "cov_SPARSE_COVERAGE", n=n, accs=", ".join(accs))
        reasons.append({"code": "too_few_matching_observations", "matches": n, "threshold": COVERAGE_RULES["observed_min_matches"]})
    elif len(accs) < COVERAGE_RULES["observed_min_investigations"]:
        cls = "LIMITED_COVERAGE"
        expl = tx(lang, "cov_LIMITED_COVERAGE", n=n, k=len(accs), accs=", ".join(accs))
        reasons.append({"code": "single_investigation", "investigations": len(accs), "threshold": COVERAGE_RULES["observed_min_investigations"]})
    else:
        cls = "OBSERVED"
        expl = tx(lang, "cov_OBSERVED", n=n, k=len(accs))
    if partial and cls != "OBSERVED":
        expl += " " + tx(lang, "cov_partial", n=len(partial))
    if incompatible:
        expl += " " + tx(lang, "cov_incompatible", items=", ".join(f"{label(lang, 'reason', k)}: {v}" for k, v in sorted(incompatible.items())))
        reasons += [{"code": k, "observations": v} for k, v in sorted(incompatible.items())]
    if demoted and cls != "OBSERVED":
        expl += " " + tx(lang, "cov_demoted", items=", ".join(f"{label(lang, 'reason', k)}: {v}" for k, v in sorted(demoted.items())))
        reasons += [{"code": k, "observations": v} for k, v in sorted(demoted.items())]
    if env_hits:
        res["envelope_note"] = tx(lang, "cov_envelope", accs=", ".join(sorted({o["accession"] for o in env_hits}, key=_acc_key)))
        expl += " " + res["envelope_note"]
    rule = {"INSUFFICIENT_METADATA": "reporting == 0", "NO_MATCHING_RECORDS": "reporting > 0 and matches == 0",
            "SPARSE_COVERAGE": f"1 <= matches <= {COVERAGE_RULES['sparse_max']}",
            "LIMITED_COVERAGE": f"matches >= {COVERAGE_RULES['observed_min_matches']} from 1 investigation",
            "OBSERVED": f"matches >= {COVERAGE_RULES['observed_min_matches']} from >= {COVERAGE_RULES['observed_min_investigations']} investigations"}[cls]
    # data-quality limitations of the records involved
    involved = {o["accession"] for o, _ in matched + partial} or {o["accession"] for o in reporting}
    dq = []
    for a in sorted(involved, key=_acc_key):
        d = M.DATASETS[a]
        for c in d["columns"]:
            if c["parameter"] in dims and (c["status"] in ("inferred", "ambiguous") or c["value_basis"] in ("source_derived", "model_derived") or c.get("qualifier") == "approximate"):
                dq.append({"accession": a, "column": c["header"], "status": c["status"], "basis": c["value_basis"], "note": c["note"] or ("approximate values" if c.get("qualifier") == "approximate" else None)})
        if d["granularity"] in ("test_day_summary",):
            dq.append({"accession": a, "column": None, "status": "summary_granularity", "basis": None, "note": d["granularity_definition"]})
    res.update({
        "classification": cls, "rule": rule, "supporting_records": n, "partial_records": len(partial), "reporting_records": len(reporting),
        "accessions": accs, "partial_accessions": sorted({o["accession"] for o, _ in partial}, key=_acc_key),
        "evidence_refs": [o["id"] for o, _ in matched[:25]], "partial_refs": [o["id"] for o, _ in partial[:25]],
        "by_granularity": dict(Counter(o["granularity"] for o, _ in matched)),
        "nearest": ({"id": nearest[1]["id"], "accession": nearest[1]["accession"], "row": nearest[1]["row"],
                     "values": {d: nearest[2][d]["value"] for d in dims}, "states": {d: nearest[2][d]["state"] for d in dims}} if nearest else None),
        "missing_information": [f"{d}: not reported by {k} observation(s)" for d, k in missing_by_param.items()],
        "excluded": dict(excluded), "incompatible": dict(incompatible), "demoted": dict(demoted), "insufficiency_reasons": reasons if cls != "OBSERVED" else [],
        "data_quality": dq[:20], "explanation": expl,
    })
    return res


def gaps(targets: dict, lang: str = "en") -> dict:
    out = []
    for i, (key, tk, dims) in enumerate(COMBOS, 1):
        g = analyze_combo(key, tk, dims, targets, lang)
        g["id"] = f"GAP-{i:02d}"
        out.append(g)
    order = {"NO_MATCHING_RECORDS": 0, "INSUFFICIENT_METADATA": 1, "SPARSE_COVERAGE": 2, "LIMITED_COVERAGE": 3, "OBSERVED": 4, "NOT_ASSESSABLE": 5}
    summary = Counter(g["classification"] for g in out)
    return {"gaps": sorted(out, key=lambda g: order[g["classification"]]), "summary": dict(summary), "rules": COVERAGE_RULES,
            "method": __doc__.strip(), "disclaimer": tx(lang, "disclaimer")}


# ------------------------------------------------------------------------------------------------------------------
# Multidimensional coverage explorer (PyroLens 3.0)
# ------------------------------------------------------------------------------------------------------------------
# Axes: continuous axes are binned with fixed, documented edges; categorical axes use the normalized category.
# A cell's state is computed from eligible observations only, with the same thresholds as the gap engine:
#   observed      >= observed_min_matches observations from >= observed_min_investigations investigations
#   partial       >= 1 observation but below the 'observed' thresholds
#   insufficient  no observation in the cell (shown only inside the axis domain)
# Flow velocity is NEVER pooled across flow configurations: any pair with flow velocity is split into layers, one per
# configuration, and each layer is computed separately.
AXES = {
    "oxygen_mole_fraction": {"kind": "bin", "unit": "%", "edges": [0, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 45, 50, 100], "label_key": "oxygen_mole_fraction"},
    "total_pressure": {"kind": "bin", "unit": "kPa", "edges": [0, 20, 35, 50, 65, 80, 95, 110, 150, 200, 300, 400, 600, 1000], "label_key": "total_pressure"},
    "oxygen_partial_pressure": {"kind": "bin", "unit": "kPa", "edges": [0, 5, 10, 15, 20, 25, 30, 40, 60, 100, 200, 400], "label_key": "oxygen_partial_pressure"},
    "flow_velocity": {"kind": "bin", "unit": "cm/s", "edges": [0, 2, 5, 10, 15, 20, 25, 30, 40, 60, 100], "label_key": "flow_velocity"},
    "diluent": {"kind": "cat", "label_key": "diluent"},
    "flow_configuration": {"kind": "cat", "label_key": "flow_configuration"},
    "material": {"kind": "cat", "label_key": "material"},
    "gravity": {"kind": "cat", "label_key": "gravity"},
}
# Pairs that the collection supports (pairs that are physically meaningful and reported together by at least one table)
PAIRS = [
    ("oxygen_mole_fraction", "total_pressure"), ("oxygen_partial_pressure", "total_pressure"), ("diluent", "oxygen_mole_fraction"),
    ("flow_velocity", "oxygen_mole_fraction"), ("flow_configuration", "material"), ("flow_velocity", "gravity"),
    ("material", "oxygen_mole_fraction"), ("gravity", "oxygen_mole_fraction"),
]
FILTERS = ("accession", "material", "gravity", "flow_configuration", "diluent", "gas_status")


def _axis_value(o: dict, axis: str):
    """Single value (or category) of an observation on an axis; None when the observation does not report it."""
    if axis == "oxygen_mole_fraction":
        return None if o["x_o2"] is None else o["x_o2"] * 100
    if axis == "total_pressure":
        return o["p_kpa"]
    if axis == "oxygen_partial_pressure":
        return o["po2_kpa"]
    if axis == "flow_velocity":
        return o["flow_cm_s"]
    if axis == "diluent":
        g = o.get("gas") or {}
        if g.get("status") in ("ambiguous",):
            return "ambiguous"
        if g.get("status") == "campaign_alternatives":
            return None
        if g.get("mixture"):
            return "+".join(c["gas"] for c in sorted(g["components"], key=lambda c: -c["fraction"]) if c["fraction"] >= physics.MIXTURE_FRACTION)
        return g.get("primary_diluent")
    if axis == "flow_configuration":
        v = o.get("flow_configuration")
        return None if v in (None, "unknown") else v
    if axis == "material":
        return o.get("material")
    if axis == "gravity":
        return o.get("gravity")
    raise KeyError(axis)


def _bin(axis: str, v: float) -> int | None:
    e = AXES[axis]["edges"]
    for i in range(len(e) - 1):
        if e[i] <= v < e[i + 1]:
            return i
    return None


def _key(axis: str, v):
    return _bin(axis, v) if AXES[axis]["kind"] == "bin" else v


def _labels(axis: str, keys: list) -> list[dict]:
    if AXES[axis]["kind"] == "bin":
        e = AXES[axis]["edges"]
        return [{"key": k, "label": f"{e[k]:g}–{e[k + 1]:g}", "low": e[k], "high": e[k + 1]} for k in keys]
    return [{"key": k, "label": str(k)} for k in keys]


def _passes(o: dict, filters: dict) -> bool:
    for f, want in filters.items():
        if not want:
            continue
        have = {"accession": o["accession"], "material": o.get("material"), "gravity": o.get("gravity"), "flow_configuration": o.get("flow_configuration"),
                "diluent": o.get("diluent"), "gas_status": (o.get("gas") or {}).get("status")}[f]
        if have not in (want if isinstance(want, (list, tuple, set)) else [want]):
            return False
    return True


def _grid(obs: list[dict], x: str, y: str) -> dict:
    cells: dict[tuple, list] = defaultdict(list)
    only_x, only_y = Counter(), Counter()
    for o in obs:
        vx, vy = _axis_value(o, x), _axis_value(o, y)
        if vx is None and vy is None:
            continue
        if vx is None:
            only_y[o["accession"]] += 1
            continue
        if vy is None:
            only_x[o["accession"]] += 1
            continue
        kx, ky = _key(x, vx), _key(y, vy)
        if kx is None or ky is None:
            continue
        cells[(kx, ky)].append(o)
    xs = sorted({k[0] for k in cells}, key=lambda v: (str(type(v)), v))
    ys = sorted({k[1] for k in cells}, key=lambda v: (str(type(v)), v))
    # continuous axes: fill the domain between the min and max occupied bins so that empty cells are visible
    if AXES[x]["kind"] == "bin" and xs:
        xs = list(range(min(xs), max(xs) + 1))
    if AXES[y]["kind"] == "bin" and ys:
        ys = list(range(min(ys), max(ys) + 1))
    out = []
    for kx in xs:
        for ky in ys:
            os_ = cells.get((kx, ky), [])
            accs = sorted({o["accession"] for o in os_}, key=_acc_key)
            n = len(os_)
            state = ("observed" if n >= COVERAGE_RULES["observed_min_matches"] and len(accs) >= COVERAGE_RULES["observed_min_investigations"]
                     else "partial" if n else "insufficient")
            out.append({"x": kx, "y": ky, "n": n, "state": state, "accessions": accs, "evidence_refs": [o["id"] for o in os_[:20]],
                        "approximate": sum(1 for o in os_ if o.get("approximate_o2") or o.get("p_approximate")),
                        "granularity": dict(Counter(o["granularity"] for o in os_))})
    return {"x_bins": _labels(x, xs), "y_bins": _labels(y, ys), "cells": out,
            "missing": {"x_only": dict(only_x), "y_only": dict(only_y), "x_only_total": sum(only_x.values()), "y_only_total": sum(only_y.values())},
            "states": dict(Counter(c["state"] for c in out)), "observations": sum(c["n"] for c in out)}


def explore(x: str, y: str, filters: dict | None = None, lang: str = "en") -> dict:
    if x not in AXES or y not in AXES or x == y:
        raise ValueError("unknown_axis")
    supported = (x, y) in PAIRS or (y, x) in PAIRS
    filters = {k: v for k, v in (filters or {}).items() if k in FILTERS and v}
    elig, excl = eligible_observations()
    base = [o for o in elig if o["granularity"] not in ENVELOPE and _passes(o, filters)]
    res = {"x": x, "y": y, "x_axis": {**AXES[x], "label": label(lang, "param", AXES[x]["label_key"])},
           "y_axis": {**AXES[y], "label": label(lang, "param", AXES[y]["label_key"])}, "supported_pair": supported,
           "filters": filters, "rules": COVERAGE_RULES, "excluded": dict(excl),
           "envelopes": sorted({o["accession"] for o in elig if o["granularity"] in ENVELOPE}, key=_acc_key),
           "method": "Eligible combustion observations only; fixed bin edges; no interpolation; campaign test-matrix rows are listed as envelopes, never as cells."}
    if "flow_velocity" in (x, y):
        layers = {}
        for cfg in sorted({o.get("flow_configuration") for o in base if o["flow_cm_s"] is not None and o.get("flow_configuration")}):
            layers[cfg] = {"configuration": cfg, "label": physics.FLOW_CONFIGS.get(cfg, {}).get("label"), "family": physics.flow_family(cfg),
                           **_grid([o for o in base if o.get("flow_configuration") == cfg], x, y)}
        res.update(layered_by="flow_configuration", layers=layers,
                   note="Flow velocities are split by flow configuration and never pooled: velocities of different configurations are not physically equivalent.")
    else:
        res.update(layered_by=None, grid=_grid(base, x, y))
    return res


def observation_table(filters: dict | None = None) -> list[dict]:
    """Compact eligible + excluded observations for interactive atlases (every row links back to its table row)."""
    out = []
    for o in M.all_observations():
        if filters and not _passes(o, filters):
            continue
        g = o.get("gas") or {}
        out.append({"id": o["id"], "accession": o["accession"], "row": o["row"], "label": o["label"], "granularity": o["granularity"],
                    "eligible": o["combustion_eligible"], "eligibility": o["eligibility_reason"],
                    "o2_pct": None if o["x_o2"] is None else round(o["x_o2"] * 100, 4), "p_kpa": _p(o["p_kpa"]), "po2_kpa": _p(o["po2_kpa"]),
                    "flow_cm_s": _p(o["flow_cm_s"]), "flow_configuration": o.get("flow_configuration"), "diluent": _axis_value(o, "diluent"),
                    "gas_status": g.get("status"), "material": o.get("material"), "fuel_class": o.get("fuel_class"), "gravity": o.get("gravity"),
                    "geometry": o.get("geometry"), "approximate": bool(o.get("approximate_o2") or o.get("p_approximate"))})
    return out


def collection_limitations(lang: str = "en") -> list[dict]:
    """Collection-wide evidence limitations computed from the measurement layer (replaces the legacy static gap texts)."""
    elig, excl = eligible_observations()
    n = len(elig)
    grav = Counter(o["gravity"] or "unknown" for o in elig)
    gas = Counter((o.get("gas") or {}).get("status") or "missing" for o in elig)
    dil_known = sum(v for k, v in gas.items() if k in ("numeric_composition", "qualitative"))
    dil_missing = sum(v for k, v in gas.items() if k in ("missing", "incomplete"))
    dil_amb = gas.get("ambiguous", 0)
    with_p = sum(1 for o in elig if o["p_kpa"] is not None)
    with_po2 = sum(1 for o in elig if o["po2_kpa"] is not None)
    flow = Counter(o.get("flow_configuration") for o in elig if o["flow_cm_s"] is not None)
    flow_txt = ", ".join(f"{label(lang, 'flowcfg', k)}: {v}" for k, v in sorted(flow.items(), key=lambda kv: -kv[1]))
    unc = sum(1 for d in M.DATASETS.values() for r in d["rows"] for m in r["measurements"] if (m.get("uncertainty") or {}).get("status") == "reported")
    return [
        {"code": "partial_gravity", "title": tx(lang, "lim_gravity_t"), "detail": tx(lang, "lim_gravity_d", n=n, micro=grav.get("microgravity", 0))},
        {"code": "diluent", "title": tx(lang, "lim_diluent_t"), "detail": tx(lang, "lim_diluent_d", n=n, known=dil_known, missing=dil_missing, amb=dil_amb)},
        {"code": "pressure", "title": tx(lang, "lim_pressure_t"), "detail": tx(lang, "lim_pressure_d", n=n, p=with_p, po2=with_po2)},
        {"code": "flow", "title": tx(lang, "lim_flow_t"), "detail": tx(lang, "lim_flow_d", items=flow_txt or "—")},
        {"code": "uncertainty", "title": tx(lang, "lim_unc_t"), "detail": tx(lang, "lim_unc_d", n=unc)},
        {"code": "eligibility", "title": tx(lang, "lim_elig_t"), "detail": tx(lang, "lim_elig_d", items=", ".join(f"{label(lang, 'reason', k)}: {v}" for k, v in sorted(excl.items())))},
    ]


def preset_gap_sentences(preset_key: str, lang: str = "en") -> list[str]:
    """Deterministic gap explanations for a scenario preset (used by legacy pages instead of fixed sentences)."""
    from .scenario import ScenarioTarget, preset, validate
    p = preset(preset_key)
    if not p:
        return []
    v = validate(ScenarioTarget(**p["scenario"]))
    if v["errors"]:
        return []
    return [f"{g['title']}: {g['explanation']}" for g in gaps(v["targets"], lang)["gaps"]]
