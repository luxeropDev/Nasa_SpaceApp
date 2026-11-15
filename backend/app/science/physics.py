"""PyroLens 3.0 physical semantics: observation eligibility, gas (diluent) composition, flow configuration, specimen
geometry, ignition conditions and measurement uncertainty.

Everything here is deterministic and driven by the reviewable dataset profiles in data/psi_physical_profiles.json.
Nothing is inferred from a number alone, nothing missing is filled in:
  * a missing diluent is NOT air and NOT nitrogen;
  * a flow velocity is never compared across physically different flow configurations;
  * rows that are not flame observations never count as combustion coverage;
  * uncertainty is propagated only from numeric uncertainty stated by a source (or by the user for scenario targets);
    otherwise the status is 'uncertainty_not_reported'.
"""
from __future__ import annotations

import json
import math
import re

from .. import psi

PHYS_DOC: dict = json.loads((psi.DATA / "psi_physical_profiles.json").read_text(encoding="utf-8"))
PHYS: dict = PHYS_DOC["profiles"]
FLOW_CONFIGS: dict = PHYS_DOC["_flow_configurations"]
OBSERVATION_CLASSES: dict = PHYS_DOC["_observation_classes"]
GAS_MODES: dict = PHYS_DOC["_gas_modes"]

# ------------------------------------------------------------------------------------------------------------------ gas
GASES = {"N2": "nitrogen", "He": "helium", "CO2": "carbon dioxide", "Ar": "argon", "air": "air (source term)"}
GAS_ALIASES = {"n2": "N2", "nitrogen": "N2", "азот": "N2", "he": "He", "helium": "He", "гелий": "He", "co2": "CO2", "carbon dioxide": "CO2",
               "углекислый газ": "CO2", "ar": "Ar", "argon": "Ar", "аргон": "Ar", "air": "air", "воздух": "air"}
PARAM_GAS = {"nitrogen_mole_fraction": "N2", "helium_mole_fraction": "He", "carbon_dioxide_mole_fraction": "CO2"}
MAJOR_FRACTION = 0.02       # a component below 2 mol-% is reported as a minor species, never as the diluent
MIXTURE_FRACTION = 0.05     # two or more components >= 5 mol-% make the diluent a mixture
CLOSURE_TOL = 0.03          # O2 + listed components must sum to 1 +/- 0.03 for the composition to count as complete
DILUENT_TOLERANCE = {"match": 0.05, "partial": 0.10}  # absolute mole-fraction difference per gas (scenario composition)

_gas_token = re.compile(r"\b(N2|He|CO2|Ar)\b")


def canonical_gas(v: str | None) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return GAS_ALIASES.get(s.lower(), s if s in GASES else None)


def _comp(m: dict, gas: str) -> dict:
    return {"gas": gas, "fraction": round(m["normalized_value"], 6), "raw": m["raw_value"], "unit": m["raw_unit"], "ref": m["id"],
            "value_status": m["value_status"], "unit_inferred": (m.get("conversion") or {}).get("status") == "unit_inferred"}


def gas_of_row(acc: str, row: dict, x_o2: float | None) -> dict:
    """Gas composition record of one observation row. Values come from the row's own cells or from the profile basis."""
    prof = PHYS.get(acc, {}).get("gas", {"mode": "not_reported", "basis": "no profile"})
    mode = prof["mode"]
    ms = row["measurements"]
    comps, minor, unresolved = [], [], []
    for m in ms:
        if m.get("qualifier") == "final" or m.get("value_kind") != "number" or m.get("normalized_value") is None:
            continue
        if m["parameter"] in PARAM_GAS and m["value_status"] in ("measured", "source_reported", "source_derived"):
            c = _comp(m, PARAM_GAS[m["parameter"]])
            (comps if c["fraction"] >= MAJOR_FRACTION else minor).append(c)
        elif m["parameter"] == "unresolved_species" and m["normalized_value"] > 0:
            unresolved.append({"header": m["header"], "fraction": round(m["normalized_value"], 6), "raw": m["raw_value"], "ref": m["id"],
                               "candidates": ["CO", "CO2"], "note": "Header 'CO' does not establish CO vs CO2"})
    g = {"mode": mode, "mode_definition": GAS_MODES.get(mode), "basis": prof.get("basis"), "status": "missing", "primary_diluent": None,
         "mixture": False, "components": comps, "minor_species": minor, "unresolved_species": unresolved, "alternatives": [],
         "candidates": prof.get("candidates", []), "source_term": None, "closure": None, "evidence_class": "missing", "refs": [], "flags": []}
    if mode == "columns":
        total = (x_o2 or 0) + sum(c["fraction"] for c in comps + minor) + sum(u["fraction"] for u in unresolved)
        g["closure"] = round(total, 4) if x_o2 is not None else None
        g["refs"] = [c["ref"] for c in comps + minor] + [u["ref"] for u in unresolved]
        majors = sorted(comps, key=lambda c: -c["fraction"])
        if unresolved:
            g.update(status="ambiguous", evidence_class="ambiguous")
            g["flags"].append("unresolved_species_in_atmosphere")
        elif x_o2 is None or abs(total - 1) > CLOSURE_TOL:
            g.update(status="incomplete", evidence_class="reported")
            g["flags"].append("composition_not_closed")
        elif majors:
            g.update(status="numeric_composition", primary_diluent=majors[0]["gas"],
                     mixture=sum(1 for c in majors if c["fraction"] >= MIXTURE_FRACTION) > 1, evidence_class="reported")
            if any(c["unit_inferred"] for c in majors):
                g["flags"].append("unit_inferred_composition_closure")
        else:
            g.update(status="incomplete", evidence_class="reported")
        return g
    if mode == "row_text":
        m = next((x for x in ms if x["parameter"] == "atmosphere_description" and x["extraction_method"] == "csv_cell"), None)
        if not m or not (m["raw_value"] or "").strip():
            return g
        g["refs"] = [m["id"]]
        g["raw_text"] = m["raw_value"]
        if {"implausible_formula", "autofill_sequence"} & set(m["flags"]):
            g.update(status="ambiguous", evidence_class="ambiguous")
            g["flags"].append("autofill_artifact")
            return g
        t = _gas_token.search(m["raw_value"])
        if t:
            g.update(status="qualitative", primary_diluent=t.group(1), evidence_class="extracted")
        return g
    if mode == "campaign_alternatives":
        m = next((x for x in ms if x["parameter"] == "diluent_description"), None)
        if m and (m["raw_value"] or "").strip():
            alts = sorted(set(_gas_token.findall(m["raw_value"])))
            g.update(status="campaign_alternatives", alternatives=alts, evidence_class="reported", refs=[m["id"]], raw_text=m["raw_value"])
        return g
    if mode == "source_term":
        g.update(status="source_term", source_term=prof.get("term"), primary_diluent="air", evidence_class="reported", location=prof.get("location"))
        g["flags"].append("composition_not_tabulated")
        return g
    if mode == "investigation_statement":
        g.update(status="investigation_statement", primary_diluent=prof.get("gas"), evidence_class="metadata")
        return g
    return g


def compare_diluent(target: dict, g: dict | None) -> tuple[str, str | None, str]:
    """(state, experiment value, reason code). Deterministic; equal oxygen fraction never implies equal diluent."""
    if not g:
        return "MISSING_IN_EXPERIMENT", None, "diluent_not_reported"
    tv = target["value"]
    comp = target.get("composition") or {}
    st = g["status"]
    if st in ("missing", "incomplete"):
        return "MISSING_IN_EXPERIMENT", None, "diluent_not_reported" if st == "missing" else "composition_incomplete"
    if st == "ambiguous":
        if g["unresolved_species"]:
            cands = {c for u in g["unresolved_species"] for c in u["candidates"]}
            if tv in cands:
                return "NOT_COMPARABLE", "unresolved species", "unresolved_species_could_be_target"
            frac = sum(u["fraction"] for u in g["unresolved_species"])
            return "MISMATCH", f"contains {frac:.2f} of an unresolved species (CO or CO2)", "unresolved_species_present"
        return "NOT_COMPARABLE", g.get("raw_text"), "diluent_text_artifact"
    if st == "campaign_alternatives":
        return ("PARTIAL_MATCH" if tv in g["alternatives"] else "MISMATCH"), " or ".join(g["alternatives"]), "campaign_alternatives"
    if st == "investigation_statement":
        return ("PARTIAL_MATCH" if g["primary_diluent"] == tv else "MISMATCH"), g["primary_diluent"], "investigation_level_statement"
    if st == "source_term":
        if tv == "air":
            return "MATCH", "air", "same_source_term"
        if tv == "N2":
            return "PARTIAL_MATCH", "air", "air_is_nitrogen_dominant_composition_not_tabulated"
        return "MISMATCH", "air", "different_gas"
    if st == "qualitative":
        return ("MATCH" if g["primary_diluent"] == tv else "MISMATCH"), g["primary_diluent"], "row_text"
    # numeric composition
    fr = {c["gas"]: c["fraction"] for c in g["components"] + g["minor_species"]}
    desc = " + ".join(f"{c['gas']} {c['fraction']:.2f}" for c in sorted(g["components"], key=lambda c: -c["fraction"]))
    if comp:
        diffs = [abs(fr.get(k, 0.0) - v) for k, v in comp.items()]
        d = max(diffs) if diffs else math.inf
        if d <= DILUENT_TOLERANCE["match"] + 1e-9:
            return "MATCH", desc, "composition_within_tolerance"
        if d <= DILUENT_TOLERANCE["partial"] + 1e-9:
            return "PARTIAL_MATCH", desc, "composition_within_partial_tolerance"
        return "MISMATCH", desc, "composition_differs"
    if tv == "air":
        return ("PARTIAL_MATCH" if g["primary_diluent"] == "N2" and not g["mixture"] else "MISMATCH"), desc, "air_vs_tabulated_composition"
    if g["primary_diluent"] == tv and not g["mixture"]:
        return "MATCH", desc, "same_primary_diluent"
    if tv in fr and fr[tv] >= MIXTURE_FRACTION:
        return "PARTIAL_MATCH", desc, "target_gas_is_one_component_of_a_mixture"
    return "MISMATCH", desc, "different_primary_diluent"


# ------------------------------------------------------------------------------------------------------------------ flow
def flow_family(cfg: str | None) -> str | None:
    return FLOW_CONFIGS.get(cfg or "", {}).get("family")


def flow_of_row(acc: str, header: list[str], raw: list[str], row: dict) -> dict:
    prof = PHYS.get(acc, {}).get("flow", {"mode": "not_reported", "config": "unknown", "basis": "no profile"})
    cfg = prof.get("config") or "unknown"
    term, ref, raw_term = prof.get("source_term"), None, None
    if prof["mode"] == "row_column_map":
        col = prof["column"]
        idx = header.index(col.strip()) if col.strip() in header else None
        if idx is not None and idx < len(raw):
            raw_term = raw[idx].strip()
            cfg = prof["map"].get(raw_term.lower(), "unknown" if not raw_term else "other_source_defined")
            ref = f"{acc}:r{row['row']}:c{idx}"
        else:
            cfg = "unknown"
    vel = None
    if prof.get("velocity_column"):
        vel = next((m for m in row["measurements"] if m["header"] == prof["velocity_column"].strip() and m["parameter"] == "flow_velocity"), None)
    return {"configuration": cfg, "family": flow_family(cfg), "label": FLOW_CONFIGS.get(cfg, {}).get("label"), "source_term": term,
            "raw_term": raw_term, "direction": prof.get("direction"), "reference_frame": prof.get("reference_frame"),
            "measurement_method": prof.get("measurement_method", "not_reported"), "basis": prof.get("basis"), "mode": prof["mode"],
            "configuration_ref": ref, "velocity_ref": vel["id"] if vel else None,
            "velocity_raw": vel["raw_value"] if vel else None, "velocity_flags": vel["flags"] if vel else [],
            "evidence_class": "reported" if prof["mode"] in ("row_column_map", "column") else ("metadata" if prof["mode"] == "investigation" else "missing")}


SOLID_DIRECTIONAL = {"concurrent_flow_over_solid", "opposed_flow_over_solid"}


def compare_flow_configuration(target_cfg: str, obs_cfg: str | None) -> tuple[str, str]:
    """(state, reason). Configurations are equal, partially compatible (direction unstated over a solid specimen) or
    incompatible. A velocity is only comparable when the configuration is not incompatible."""
    if not obs_cfg or obs_cfg == "unknown":
        return "MISSING_IN_EXPERIMENT", "configuration_not_reported"
    if obs_cfg == target_cfg:
        return "MATCH", "same_configuration"
    pair = {obs_cfg, target_cfg}
    if "forced_flow_over_specimen" in pair and pair - {"forced_flow_over_specimen"} <= SOLID_DIRECTIONAL:
        return "PARTIAL_MATCH", "direction_not_tabulated"
    return "MISMATCH", "incompatible_configuration"


# --------------------------------------------------------------------------------------------------------- eligibility
def observation_class(acc: str) -> str:
    return PHYS.get(acc, {}).get("observation_class", "no_observations")


CONDITION_KEYS = ("x_o2", "x_o2_interval", "x_o2_values", "p_kpa", "p_interval", "p_values", "flow_cm_s", "flow_interval", "flow_values",
                  "thickness_mm", "thickness_interval", "ignition_power_w", "ignition_duration_s")


def eligibility(o: dict) -> tuple[bool, str]:
    """Whether an observation may contribute to COMBUSTION coverage, and why not."""
    cls = observation_class(o["accession"])
    if cls in ("non_combustion", "smoke_aerosol", "no_observations"):
        return False, cls
    if o.get("row_type") == "duplicate":
        return False, "duplicate_row"
    has_condition = any(o.get(k) not in (None, [], {}) for k in CONDITION_KEYS) or (o.get("gas") or {}).get("status") in (
        "numeric_composition", "qualitative", "campaign_alternatives", "ambiguous", "incomplete")
    if not has_condition:
        return False, "no_condition_values"  # e.g. material-only test-log rows: they evidence no condition region
    return True, "eligible"


# ------------------------------------------------------------------------------------------------------------ geometry
GEOMETRIES = ["flat_sheet", "solid_specimen_unspecified", "droplet", "spherical_porous_burner", "porous_flat_burner", "jet_burner", "heated_sample"]


def geometry(acc: str) -> dict:
    g = PHYS.get(acc, {}).get("geometry") or {}
    return {"value": g.get("value"), "basis": g.get("basis"), "evidence_class": "metadata" if g.get("value") else "missing", "granularity": "investigation"}


def compare_geometry(target: str, obs: str | None) -> str:
    if not obs:
        return "MISSING_IN_EXPERIMENT"
    if obs == target:
        return "MATCH"
    if {obs, target} == {"flat_sheet", "solid_specimen_unspecified"}:
        return "PARTIAL_MATCH"
    return "MISMATCH"


# --------------------------------------------------------------------------------------------------------- uncertainty
UNCERTAINTY_NOT_REPORTED = "uncertainty_not_reported"


def measurement_uncertainty(m: dict, col: dict | None = None) -> dict:
    """Uncertainty record for one measurement. Numeric uncertainty only when the source states it (column override
    'uncertainty' in a dataset profile); a range cell gives reported bounds, not an uncertainty."""
    col = col or {}
    u = col.get("uncertainty")
    rec = {"status": UNCERTAINTY_NOT_REPORTED, "value": None, "type": None, "lower": None, "upper": None,
           "instrument": col.get("instrument"), "method": col.get("measurement_method"), "detection_limit": None,
           "measurement_type": col.get("measurement_type") or ("measured" if m.get("value_basis") == "measured" else "setpoint" if m.get("role") == "setting" else "not_stated"),
           "approximate": bool(m.get("approximate"))}
    if m.get("value_kind") == "range" and m.get("normalized_low") is not None:
        rec.update(lower=m["normalized_low"], upper=m["normalized_high"], bounds_type="reported_range")
    if m.get("value_kind") == "censored":
        rec["detection_limit"] = m.get("normalized_bound")
    if u and m.get("normalized_value") is not None:
        # source-stated standard uncertainty in the column's canonical unit ('absolute') or relative ('relative')
        val = u["value"] if u.get("type") == "absolute" else u["value"] * abs(m["normalized_value"])
        rec.update(status="reported", value=round(val, 9), type="standard_absolute", source=u.get("source"))
    return rec


def propagate_product(x: float, ux: float | None, p: float, up: float | None) -> dict:
    """Standard uncertainty of a product q = x·p for independent inputs (first-order GUM / JCGM 100:2008, eq. 10):
    u(q)/q = sqrt((u(x)/x)^2 + (u(p)/p)^2). Returns 'uncertainty_not_reported' unless BOTH input uncertainties are
    numeric (a missing uncertainty is never treated as zero)."""
    q = x * p
    missing = [n for n, v in (("oxygen_mole_fraction", ux), ("total_pressure", up)) if v is None]
    if missing:
        return {"status": UNCERTAINTY_NOT_REPORTED, "value": None, "missing_inputs": missing, "method": None}
    if x == 0 or p == 0:
        return {"status": "not_computable", "value": None, "missing_inputs": [], "method": None}
    rel = math.sqrt((ux / x) ** 2 + (up / p) ** 2)
    return {"status": "propagated", "value": round(abs(q) * rel, 9), "relative": round(rel, 9), "type": "standard_absolute",
            "method": "first_order_independent_inputs_gum", "formula": "u(pO2)/pO2 = sqrt((u(xO2)/xO2)^2 + (u(P)/P)^2)", "missing_inputs": []}


# ------------------------------------------------------------------------------------------------------- annotate rows
def finalize(ds: dict, header: list[str], body: list[list[str]]) -> None:
    """Attach gas, flow, geometry, ignition and eligibility to every observation (after all row flags are known)."""
    acc = ds["accession"]
    rows = {r["row"]: r for r in ds["rows"]}
    geo = geometry(acc)
    ds["observation_class"] = observation_class(acc)
    ds["observation_class_basis"] = PHYS.get(acc, {}).get("observation_basis")
    ds["geometry"] = geo
    for o in ds["observations"]:
        r = rows[o["row"]]
        raw = body[o["row"] - 1] if 0 < o["row"] <= len(body) else []
        raw = raw + [""] * (len(header) - len(raw))
        o["gas"] = gas_of_row(acc, r, o.get("x_o2"))
        o["diluent"] = o["gas"]["primary_diluent"]
        o["flow"] = flow_of_row(acc, header, raw, r)
        o["flow_configuration"] = o["flow"]["configuration"]
        o["geometry"] = geo["value"]
        for key, param in (("ignition_power_w", "ignition_power"), ("ignition_duration_s", "ignition_duration")):
            m = next((x for x in r["measurements"] if x["parameter"] == param and x["value_kind"] == "number"
                      and x["value_status"] in ("measured", "source_reported") and x.get("normalized_value") is not None), None)
            o[key] = m["normalized_value"] if m else None
            o["refs"][param] = m["id"] if m else None
        ok, why = eligibility(o)
        o["combustion_eligible"], o["eligibility_reason"] = ok, why
