"""Token-aware classification of published column headers into physical parameters.

Design rules (see docs/SCIENTIFIC_METHODS.md):
  * Headers are tokenized (case-folded; punctuation, underscores, '*' and ';' become separators). Matching is on whole
    tokens, never on substrings, so "CO2" can never match the oxygen rule.
  * Carbon-dioxide and carbon-monoxide tokens are checked BEFORE oxygen.
  * A header is never forced into a chemical species: ambiguous headers get status "ambiguous" and are excluded from
    matching, coverage and pO2.
  * The original header is always returned unchanged in `header`.

Return value of `classify(header)`:
  parameter      canonical parameter name or None
  dimension      unit dimension (see units.py) or "categorical" / None
  header_unit    unit stated by the header (None if the header states none)
  qualifier      initial / final / mean / before / after / approximate (when stated)
  role           condition | outcome | material | setting | derived | identifier | metadata
  status         resolved | inferred | ambiguous | unclassified
  confidence     high | medium | low
  value_basis    source_reported | measured | source_derived | model_derived
  gravity        column-level gravity condition when the header states it (e.g. "1-g Burn Length")
  note           explanation for inferred / ambiguous classifications
"""
from __future__ import annotations

import re

from . import units


def tokens(header: str) -> list[str]:
    s = header.lower().replace("μ", "µ").replace("₂", "2")
    s = re.sub(r"\b(co|o|n)[- ]2\b", r"\g<1>2", s)  # "CO-2", "CO 2", "O 2": subscript written as a separate 2
    s = re.sub(r"[()\[\];:,_*#]", " ", s)
    return [t for t in re.split(r"\s+", s) if t]


def _header_unit(h: str, dim: str | None) -> str | None:
    hl = h.lower()
    if dim == "fraction":
        if "% by vol" in hl or "% by volume" in hl:
            return "% by vol"
        if "ppm" in hl:
            return "ppm"
        if "mole fraction" in hl:
            return "mole fraction"
        if "percent" in hl or "%" in hl:
            return "percent"
        return None
    if dim is None:
        return None
    for m in re.finditer(r"\(([^()]*)\)", h):
        u = units.clean_unit(m.group(1))
        if units.is_known(u, dim):
            return u
    m = re.search(r";\s*([^;]+)$", h)
    if m and units.is_known(m.group(1), dim):
        return units.clean_unit(m.group(1))
    return None


def _qualifier(tk: list[str]) -> str | None:
    for q, names in (("initial", ("initial", "init", "pinit", "before")), ("final", ("final", "pfinal", "after")), ("mean", ("mean", "pmean"))):
        if any(t in names for t in tk):
            return q
    return None


def _r(parameter, dimension, role, header, unit=None, status="resolved", confidence="high", basis="source_reported", note=None, qualifier=None, gravity=None):
    return {"header": header, "parameter": parameter, "dimension": dimension, "header_unit": unit, "qualifier": qualifier, "role": role,
            "status": status, "confidence": confidence, "value_basis": basis, "gravity": gravity, "note": note}


IDENT = {"test", "sample", "date", "gmt", "day", "time", "camera", "cir", "number", "identifier", "pi", "session", "notes", "comments", "description",
         "id", "figure", "reference", "frames", "radiometer", "restrictor", "polarity", "fiber", "hardware", "location", "year", "month", "type"}


def classify(header: str) -> dict:
    h = header.strip()
    hl = h.lower()
    tk = tokens(h)
    ts = set(tk)
    q = _qualifier(tk)
    approx = "approx" in ts or "approximate" in ts

    # ---- species: carbon dioxide / carbon monoxide are decided before oxygen ----
    if "co2" in ts or "carbon dioxide" in hl:
        return _r("carbon_dioxide_mole_fraction", "fraction", "condition", h, _header_unit(h, "fraction"), qualifier=q,
                  basis="measured" if "calibrated" in ts else "source_reported")
    if "co" in ts or "carbon monoxide" in hl:
        unit = _header_unit(h, "fraction")
        if unit == "ppm" or "carbon monoxide" in hl:
            return _r("carbon_monoxide_mole_fraction", "fraction", "condition", h, unit, qualifier=q)
        return _r(None, "fraction", "condition", h, unit, status="ambiguous", confidence="low", qualifier=q,
                  note="Header 'CO' in a table whose species headers drop subscripts (O, N, He): could denote CO or CO2. "
                       "Not assigned to a species without source documentation.")
    # ---- oxygen ----
    if ts & {"o2", "xo2", "oxygen"}:
        unit = _header_unit(h, "fraction") or ("mole fraction" if "xo2" in ts else None)
        basis = "measured" if "calibrated" in ts else "source_reported"
        return _r("oxygen_mole_fraction", "fraction", "condition", h, unit, qualifier=q, basis=basis,
                  note="approximate values" if approx else None)
    if tk and tk[0] == "o" and "composition" in ts:
        return _r("oxygen_mole_fraction", "fraction", "condition", h, _header_unit(h, "fraction"), status="inferred", confidence="medium", qualifier=q,
                  note="Header reads 'O' (subscript lost). Atomic oxygen is not a plausible ambient constituent, so the column is read as O2. "
                       "Sibling columns (N, CO, He) sum with it to 1.")
    # ---- diluents ----
    if "mn2" in ts:
        return _r("nitrogen_mass_flow", "mass_rate", "setting", h, _header_unit(h, "mass_rate"))
    if "mfc" in ts:
        return _r(None, None, "setting", h, None, status="resolved", note="Mass-flow-controller range (instrument setting), not a measured flow")
    if ts & {"n2", "nitrogen"} or (tk and tk[0] == "n" and "composition" in ts):
        inferred = not (ts & {"n2", "nitrogen"})
        return _r("nitrogen_mole_fraction", "fraction", "condition", h, _header_unit(h, "fraction"), qualifier=q,
                  status="inferred" if inferred else "resolved", confidence="medium" if inferred else "high",
                  note="Header reads 'N' (subscript lost); read as N2." if inferred else None)
    if ts & {"he", "helium"}:
        return _r("helium_mole_fraction", "fraction", "condition", h, _header_unit(h, "fraction"), qualifier=q)
    if "atmosphere" in ts:
        return _r("atmosphere_description", "categorical", "condition", h, None,
                  note="Free-text atmosphere; O2 percentage and diluent are extracted by pattern where stated")
    if "ambient" in ts and "gas" in ts and "mixture" in ts:
        return _r("diluent_description", "categorical", "condition", h, None)
    # ---- pressure ----
    if "pressure" in ts or ts & {"pinit", "pfinal", "pmean"} or ("p" in ts and _header_unit(h, "pressure")):
        return _r("total_pressure", "pressure", "condition", h, _header_unit(h, "pressure"), qualifier=q or ("approximate" if approx else None),
                  note="approximate values" if approx else None)
    # ---- flow ----
    if "display" in ts:
        return _r(None, None, "setting", h, None, note="Instrument display setting, not a velocity")
    if "direction" in ts:
        return _r("flow_direction", "categorical", "condition", h, None)
    if ("air" in ts and ("flow" in ts or "rate" in ts)) or "airflow" in ts or ("inlet" in ts and "velocity" in ts) or ("flow" in ts and "velocity" in ts):
        return _r("flow_velocity", "velocity", "condition", h, _header_unit(h, "velocity"))
    # ---- fuel / material ----
    if "fuel" in ts and "rate" in ts:
        dim = "mass_rate" if _header_unit(h, "mass_rate") else ("volume_rate" if _header_unit(h, "volume_rate") else None)
        return _r("hydrocarbon_fuel_mass_flow" if "hc" in ts else ("fuel_mass_flow" if dim == "mass_rate" else "fuel_volume_flow"), dim, "setting", h,
                  _header_unit(h, dim) if dim else None)
    if "mfuel" in ts or "mhc" in ts or "mtot" in ts:
        return _r("fuel_mass_flow" if "mtot" not in ts else "total_mass_flow", "mass_rate", "setting", h, _header_unit(h, "mass_rate"))
    if ts & {"xfuel", "xf"} or ("fuel" in ts and ("conc" in ts or "conc." in hl)):
        return _r("fuel_stream_mole_fraction", "fraction", "condition", h, _header_unit(h, "fraction") or ("mole fraction" if ts & {"xfuel", "xf"} else None),
                  note="Fuel fraction in the burner fuel stream (not the ambient atmosphere)")
    if "material" in ts or ("fuel" in ts and ("type" in ts or "bottle" in ts or len(ts) == 1)) or ("sample" in ts and "type" in ts):
        return _r("material", "categorical", "material", h, None)
    # ---- specimen geometry ----
    for key, param in (("thickness", "specimen_thickness"), ("width", "specimen_width")):
        if key in ts:
            return _r(param, "length", "condition", h, _header_unit(h, "length"),
                      note="Header misspelled in source ('Samle')" if "samle" in ts else None)
    if "length" in ts and "sample" in ts:
        return _r("specimen_length", "length", "condition", h, _header_unit(h, "length"))
    if "droplet" in ts and "diameter" in ts:
        return _r("droplet_initial_diameter", "length", "condition", h, _header_unit(h, "length"))
    if "extinction" in ts and "diameter" in ts:
        return _r("extinction_diameter", "length", "outcome", h, _header_unit(h, "length"))
    if "burner" in ts and "size" in ts:
        return _r("burner_diameter", "length", "setting", h, _header_unit(h, "length"))
    if "nozzle" in ts:
        return _r("nozzle_diameter", "length", "setting", h, _header_unit(h, "length"))
    # ---- outcomes ----
    grav = None
    if tk and tk[0] in ("1-g", "1g"):
        grav = "normal_gravity"
    elif tk and re.fullmatch(r".-g", tk[0]):
        grav = "ambiguous"
    if "burning" in ts and "rate" in ts:
        return _r("burning_rate", None, "outcome", h, None, status="inferred", confidence="medium",
                  note="Header unit reads 'mm'; a burning rate cannot have length dimension (likely mm²/s with the superscript lost). Unit left unresolved.")
    if "spread" in ts and "rate" in ts:
        return _r("flame_spread_rate", "velocity", "outcome", h, _header_unit(h, "velocity"), gravity=grav,
                  note="Gravity marker in header is a corrupted character ('?-g'); likely µ-g" if grav == "ambiguous" else None)
    if "spread" in ts and "length" in ts:
        return _r("spread_length", "length", "outcome", h, _header_unit(h, "length"), gravity=grav,
                  note="Gravity marker in header is a corrupted character ('?-g'); likely µ-g" if grav == "ambiguous" else None)
    if "burn" in ts and "length" in ts:
        return _r("burn_length", "length", "outcome", h, _header_unit(h, "length"), gravity=grav,
                  note="Gravity marker in header is a corrupted character ('?-g'); likely µ-g" if grav == "ambiguous" else None)
    if "burn" in ts and "time" in ts:
        return _r("burn_time", "time", "outcome", h, _header_unit(h, "time"))
    if "ignition" in ts and "power" in ts:
        return _r("ignition_power", "power", "condition", h, _header_unit(h, "power"))
    if "ignition" in ts and "time" in ts:
        return _r("ignition_duration", "time", "condition", h, _header_unit(h, "time"))
    if "weight" in ts and "loss" in ts:
        return _r("mass_loss_rate", "mass_rate", "outcome", h, _header_unit(h, "mass_rate"))
    if "aging" in ts and "net" in ts:
        return _r("net_aging_time", "time", "setting", h, _header_unit(h, "time"))
    if "aging" in ts:
        return _r("aging_time", "time", "setting", h, _header_unit(h, "time"))
    if "mixing" in ts and "time" in ts:
        return _r("mixing_time", "time", "setting", h, _header_unit(h, "time"))
    if "duration" in ts:
        return _r("test_duration", "time", "setting", h, _header_unit(h, "time"))
    if "tad" in ts:
        return _r("adiabatic_flame_temperature", "temperature", "derived", h, _header_unit(h, "temperature"), basis="model_derived",
                  note="Adiabatic flame temperature is computed by the investigators (equilibrium calculation), not measured")
    if "zst" in ts:
        return _r("stoichiometric_mixture_fraction", "dimensionless", "derived", h, "ratio", basis="model_derived",
                  note="Stoichiometric mixture fraction is a computed quantity")
    if "temperature" in ts and "ambient" in ts:
        return _r("ambient_temperature", "temperature", "condition", h, _header_unit(h, "temperature") or ("c" if "(c)" in hl.replace(" ", "") else None))
    if "burner" in ts and "t" in ts:
        return _r("burner_temperature", "temperature", "outcome", h, "c" if re.search(r"\(\s*c\s*\)", hl) else None)
    if "flames" in ts and "ignited" in ts:
        return _r("flames_ignited", "count", "outcome", h, "count")
    if "rt/r0" in ts:
        return _r("smoke_ratio_rt_r0", "dimensionless", "outcome", h, "ratio")
    if "end" in ts and "test" in ts:
        return _r("test_outcome", "categorical", "outcome", h, None)
    if "cool" in ts and "flame?" in ts or "hot" in ts and "ignition" in ts or "self-ext" in ts or ts == {"tfp"}:
        return _r("flame_observation", "categorical", "outcome", h, None)
    if ts & IDENT or "flame" in ts:
        return _r(None, None, "identifier", h, None, status="resolved")
    return _r(None, None, "metadata", h, None, status="unclassified", confidence="low")
