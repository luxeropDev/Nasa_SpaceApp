"""Measurement-level normalization of the published PSI experiment tables.

Input:  data/psi/tables/<PSI-ID>.csv (immutable; never rewritten) + data/psi_records.json + data/psi_dataset_profiles.json
Output: in-memory evidence per dataset (computed once at import, deterministic):

  dataset = {accession, file, sha256, encoding, granularity, study_type, gravity, columns[], rows[], observations[],
             issues[], quality{}}
  measurement = {id, parameter, header, qualifier, role, raw_value, raw_unit, value_kind, value, low, high, values,
                 normalized_value | normalized_low/high | normalized_values, normalized_unit, value_status, value_basis,
                 approximate, conversion{method,status}, extraction_method, extraction_confidence, classification{...},
                 source{accession,file,sha256,row,column_index,column}, flags[]}

Value statuses
  measured        number stated by the source for a column the source labels as measured/calibrated
  source_reported number stated by the source table (set point or measurement — the table does not always say which)
  source_derived  number the source states it derived from another measurement (e.g. PSI-99 O2 from CO2)
  model_derived   number computed by the investigators with a model (e.g. adiabatic flame temperature)
  calculated      computed by PyroLens from other values (pO2); never a measurement
  qualitative     meaningful text observation (material, "Extinction", "Complete")
  missing         blank or explicit not-available token
  invalid         spreadsheet error or physically impossible value (e.g. pressure 0, fraction > 1)
  censored        bound such as ">500"
  over_range      instrument over-range token ("OR")
  ambiguous       text whose meaning cannot be fixed safely ("none" in a numeric column, "037 mm")
  unresolved      number whose unit cannot be established, or a value given elsewhere ("See Fig. 5")
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from collections import Counter

from .. import psi
from . import cells, headers, materials, physics, units

PROFILES_DOC = json.loads((psi.DATA / "psi_dataset_profiles.json").read_text(encoding="utf-8"))
PROFILES: dict = PROFILES_DOC["profiles"]
GRANULARITY_DEFS: dict = PROFILES_DOC["_granularity"]
RELATED_UNLINKED: dict = PROFILES_DOC["related_unlinked"]

USABLE = {"measured", "source_reported", "source_derived", "model_derived"}
NUMERIC_KINDS = {"number", "range", "list", "censored"}
COMPOSITION = {"oxygen_mole_fraction", "nitrogen_mole_fraction", "helium_mole_fraction", "carbon_dioxide_mole_fraction"}
ROW_LABEL = {"per_test": "test", "per_test_setpoint": "set point", "per_specimen": "specimen", "test_log": "test",
             "test_day_summary": "test day", "test_matrix": "campaign row", "session_log": "session", "publication_figure_index": "figure reference"}
OBSERVATION_GRANULARITIES = {"per_test", "per_test_setpoint", "per_specimen", "test_log", "test_day_summary", "test_matrix"}


def _decode(raw: bytes) -> tuple[str, str]:
    try:
        return raw.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        return raw.decode("cp1252", "strict"), "cp1252"


def _issue(code, severity, acc, detail, row=None, column=None, raw=None):
    return {"code": code, "severity": severity, "accession": acc, "row": row, "column": column, "raw": raw, "detail": detail}


def gravity_of(rec: dict) -> dict:
    pt, fp = rec.get("project_type") or "", rec.get("flight_platform") or ""
    if pt == "Microgravity Investigation":
        return {"condition": "microgravity", "status": "reported_in_metadata", "source": f"PSI project type '{pt}', platform '{fp}'"}
    if pt == "Ground Investigation":
        return {"condition": "not_applicable_ground", "status": "reported_in_metadata", "source": f"PSI project type '{pt}' (ground / computational study)"}
    return {"condition": None, "status": "missing", "source": "PSI metadata does not state the gravity environment"}


def _closure_columns(cols: list[dict], body: list[list[str]]) -> set[int]:
    """Composition columns without any stated unit are read as mole fractions only if, in every row where all of them are
    plain numbers, they sum to 1 within 0.02 (and at least 3 such rows exist). Deterministic and documented."""
    idx = [i for i, c in enumerate(cols) if c["parameter"] in COMPOSITION and not c["header_unit"]]
    if len(idx) < 2:
        return set()
    sums = []
    for r in body:
        vals = [cells.parse_cell(r[i] if i < len(r) else "") for i in idx]
        if all(v["kind"] == "number" and not v["unit"] for v in vals):
            sums.append(sum(v["value"] for v in vals))
    # Read as fractions only if every row sums to 0.90-1.02. A percent reading would sum to ~1 % (impossible for a
    # complete atmosphere), so the closure test separates the two without looking at any single number.
    if len(sums) >= 3 and all(0.90 <= s <= 1.02 for s in sums):
        return set(idx)
    return set()


def _status_from_basis(basis: str) -> str:
    return {"measured": "measured", "source_derived": "source_derived", "model_derived": "model_derived"}.get(basis, "source_reported")


def _measure(acc, file, sha, row, ci, col, raw, closure: bool) -> dict:
    m = _measure_core(acc, file, sha, row, ci, col, raw, closure)
    m["uncertainty"] = physics.measurement_uncertainty(m, col)
    return m


def _measure_core(acc, file, sha, row, ci, col, raw, closure: bool) -> dict:
    c = cells.parse_cell(raw)
    dim = col["dimension"]
    m = {"id": f"{acc}:r{row}:c{ci}", "parameter": col["parameter"] or ("unresolved_species" if col["status"] == "ambiguous" else None),
         "header": col["header"], "qualifier": col["qualifier"], "role": col["role"], "dimension": dim, "raw_value": raw, "raw_unit": None,
         "value_kind": c["kind"], "approximate": c["approximate"] or col.get("qualifier") == "approximate", "value_status": None, "column_gravity": col.get("gravity"), "value_basis": col["value_basis"],
         "normalized_unit": None, "conversion": None, "extraction_method": "csv_cell", "extraction_confidence": "high",
         "classification": {"status": col["status"], "confidence": col["confidence"], "note": col["note"]},
         "source": {"accession": acc, "file": file, "sha256": sha, "row": row, "column_index": ci, "column": col["header"]}, "flags": []}
    if c.get("note"):
        m["source_note"] = c["note"]
    if c.get("qualifier"):
        m["cell_qualifier"] = c["qualifier"]
    k = c["kind"]
    if col["status"] == "ambiguous":
        m["flags"].append("ambiguous_header")
    if k == "empty":
        m["value_status"] = "missing"
        return m
    if k == "missing":
        m["value_status"] = "missing"
        m["flags"].append("missing_token")
        return m
    if k == "error":
        m["value_status"] = "invalid"
        m["flags"].append("spreadsheet_error")
        return m
    if k == "over_range":
        m["value_status"] = "over_range"
        return m
    if k == "reference":
        m["value_status"] = "unresolved"
        m["flags"].append("value_in_figure")
        return m
    if k == "ambiguous":
        m["value_status"] = "ambiguous"
        m["flags"].append(c.get("reason", "ambiguous_value"))
        return m
    if dim == "categorical" or col["role"] == "material":
        if k == "none_token" or k == "text" or k in NUMERIC_KINDS:
            m["value_status"] = "qualitative"
            m["value_text"] = raw.strip()
            if col["role"] == "material":
                mat = materials.canonical(raw)
                m["material"] = {k2: mat[k2] for k2 in ("canonical", "fuel_class", "mixture") if k2 in mat}
                m["material"]["components"] = mat.get("components", [])
                for f in mat["flags"]:
                    m["flags"].append(f["code"])
                    m["flag_detail"] = f["detail"]
                if mat["flags"]:  # artifact cells are kept verbatim but never mapped to a species
                    m["material"].update(canonical=None, fuel_class=None, excluded_reason="implausible_formula")
        return m
    if k == "none_token":
        m["value_status"] = "ambiguous"
        m["flags"].append("none_token")
        return m
    if k == "text":
        m["value_status"] = "qualitative" if dim is not None or col["role"] == "outcome" else "unresolved"
        m["value_text"] = raw.strip()
        return m
    # numeric kinds
    cell_unit = units.clean_unit(c.get("unit"))
    hdr_unit = col["header_unit"]
    unit, conv_status_override = None, None
    if dim == "fraction" and cell_unit == "%":
        cell_unit = "percent"
    if hdr_unit and cell_unit and hdr_unit != cell_unit and not (dim == "fraction" and {hdr_unit, cell_unit} <= {"percent", "% by vol"}):
        m["value_status"] = "ambiguous"
        m["flags"].append("unit_conflict")
        m["raw_unit"] = f"{hdr_unit} | {cell_unit}"
        return m
    unit = hdr_unit or cell_unit
    if unit is None and closure:
        unit, conv_status_override = "mole fraction", "unit_inferred"
        m["flags"].append("unit_inferred_composition_closure")
    m["raw_unit"] = unit
    if m["approximate"]:
        m["flags"].append("approximate_value")
    if c.get("reversed"):
        m["flags"].append("reversed_range")
    if k == "censored":
        m["censor_op"], m["bound"] = c["op"], c["bound"]
        m["value_status"] = "censored"
        if dim and unit:
            n = units.normalize(c["bound"], unit, dim)
            m["normalized_bound"], m["normalized_unit"] = n["normalized_value"], n["normalized_unit"]
        return m
    if not dim or units.normalize(0.0, unit, dim)["conversion_status"] in ("unit_unresolved", "dimension_unknown"):
        m["value_status"] = "unresolved"
        other = [d for d in ("velocity", "length", "time", "pressure", "power", "mass_rate") if d != dim and unit and units.is_known(unit, d)]
        m["flags"].append("dimension_conflict" if other else "unit_unresolved")
        if other:
            m["flag_detail"] = f"Cell unit '{unit}' is a {other[0]} unit but the header names a {dim or 'different'} quantity; not converted"
        if k == "number":
            m["value"] = c["value"]
        return m
    if k == "number":
        m["value"] = c["value"]
        n = units.normalize(c["value"], unit, dim)
        m["normalized_value"] = n["normalized_value"]
        nums = [n["normalized_value"]]
    elif k == "range":
        m["low"], m["high"] = c["low"], c["high"]
        a, b = units.normalize(c["low"], unit, dim), units.normalize(c["high"], unit, dim)
        n = a
        m["normalized_low"], m["normalized_high"] = min(a["normalized_value"], b["normalized_value"]), max(a["normalized_value"], b["normalized_value"])
        nums = [a["normalized_value"], b["normalized_value"]]
    else:  # list
        m["values"] = c["values"]
        ns = [units.normalize(v, unit, dim) for v in c["values"]]
        n = ns[0]
        m["normalized_values"] = [x["normalized_value"] for x in ns]
        nums = m["normalized_values"]
    m["normalized_unit"] = n["normalized_unit"]
    m["conversion"] = {"method": n["conversion_method"], "status": conv_status_override or n["conversion_status"], "applied": n["conversion_method"] != "identity"}
    m["value_status"] = _status_from_basis(col["value_basis"])
    if col["status"] == "ambiguous":
        m["value_status"] = "ambiguous"  # the number is kept and normalized, but what it measures is not established
    # physical plausibility (value kept; status says whether it may enter statistics)
    p = col["parameter"] or ""
    if dim == "fraction" and any(v < 0 for v in nums):
        m["value_status"] = "invalid"
        m["flags"].append("negative_concentration")
    elif dim == "fraction" and any(v > 1 for v in nums):
        m["value_status"] = "invalid"
        m["flags"].append("fraction_out_of_range")
    elif p == "total_pressure" and any(v <= 0 for v in nums):
        m["value_status"] = "invalid"
        m["flags"].append("non_positive_absolute_pressure")
    elif p == "flow_velocity" and any(v < 0 for v in nums):
        m["flags"].append("negative_flow_value")  # sign preserved; meaning (direction? offset?) not stated by the source
    elif dim == "length" and any(v < 0 for v in nums):
        m["value_status"] = "invalid"
        m["flags"].append("negative_length")
    return m


def _text_pattern(acc, file, sha, row, ci, header, raw, parameter, value, unit, dim, approx, match, confidence="medium") -> dict:
    m = _text_pattern_core(acc, file, sha, row, ci, header, raw, parameter, value, unit, dim, approx, match, confidence)
    m["uncertainty"] = physics.measurement_uncertainty(m, None)
    return m


def _text_pattern_core(acc, file, sha, row, ci, header, raw, parameter, value, unit, dim, approx, match, confidence="medium") -> dict:
    n = units.normalize(value, unit, dim)
    return {"id": f"{acc}:r{row}:c{ci}:{parameter}", "parameter": parameter, "header": header, "qualifier": None, "role": "condition", "dimension": dim,
            "raw_value": raw, "raw_unit": unit, "value_kind": "number", "approximate": approx, "value": value, "normalized_value": n["normalized_value"],
            "normalized_unit": n["normalized_unit"], "conversion": {"method": n["conversion_method"], "status": n["conversion_status"], "applied": n["conversion_method"] != "identity"},
            "value_status": "source_reported", "value_basis": "source_reported", "extraction_method": "text_pattern", "extraction_confidence": confidence,
            "classification": {"status": "inferred", "confidence": confidence, "note": f"Extracted from text '{match}'"},
            "source": {"accession": acc, "file": file, "sha256": sha, "row": row, "column_index": ci, "column": header}, "flags": ["text_pattern_extraction"] + (["approximate_value"] if approx else [])}


_atm_o2 = re.compile(r"(~)?\s*(\d+(?:\.\d+)?)\s*%\s*O2\b", re.I)
_atm_dil = re.compile(r"\bwith\s+([A-Za-z]+\d*)\b")
DILUENTS = {"N2": "nitrogen", "He": "helium", "CO2": "carbon_dioxide", "Ar": "argon"}


def _row_type(gran: str, row: list[str], prev_primary: int | None) -> str:
    filled = [c for c in row if c.strip()]
    first = row[0].strip() if row else ""
    if re.match(r"^note\b", first, re.I):
        return "annotation"
    if any(re.search(r"same conditions as", c, re.I) for c in filled):
        return "conditions_by_reference"
    if gran in ("per_specimen", "per_test") and len(filled) <= 2:
        return "annotation"
    if gran == "test_day_summary" and not first and len(filled) <= 2 and prev_primary is not None:
        return "continuation"
    return "primary"


_ID_PREF = ("flex", "test", "sample", "session", "number", "id", "day", "date")


def _label(cols: list[dict], r: list[str]) -> str | None:
    """Human row label: the first identifier column whose header names a test/sample/session id."""
    for pref in _ID_PREF:
        for i, c in enumerate(cols):
            if c["role"] == "identifier" and pref in headers.tokens(c["header"]) and i < len(r) and r[i].strip():
                return r[i].strip()
    return None


def _pick(ms: list[dict], parameter: str, order: tuple) -> dict | None:
    cand = [m for m in ms if m["parameter"] == parameter and m["value_status"] in USABLE and m["value_kind"] in ("number", "range", "list")
            and "negative_flow_value" not in m["flags"]]  # sign meaning unstated -> never used for matching/coverage
    for q in order:
        for m in cand:
            if m["qualifier"] == q:
                return m
    return cand[0] if cand else None


def _num(m: dict | None):
    """(single value | None, interval | None, values | None) in canonical units."""
    if not m:
        return None, None, None
    if m["value_kind"] == "number":
        return m["normalized_value"], None, None
    if m["value_kind"] == "range":
        return None, [m["normalized_low"], m["normalized_high"]], None
    return None, None, m["normalized_values"]


def build_dataset(acc: str) -> dict:
    rec = psi.PSI[acc]
    prof = PROFILES.get(acc, {})
    gran = prof.get("granularity") or ("no_table" if not rec.get("experiment_table") else "unknown")
    out = {"accession": acc, "granularity": gran, "granularity_definition": GRANULARITY_DEFS.get(gran), "granularity_basis": prof.get("basis"),
           "row_label": ROW_LABEL.get(gran), "study_type": prof.get("study_type") or ("flight_experiment" if rec.get("project_type") == "Microgravity Investigation" else "unknown"),
           "dataset_notes": prof.get("dataset_notes", []), "gravity": gravity_of(rec), "columns": [], "rows": [], "observations": [], "issues": [],
           "file": None, "sha256": None, "encoding": None}
    t = rec.get("experiment_table")
    if not t:
        physics.finalize(out, [], [])
        out["quality"] = quality(out)
        return out
    path = psi.DATA / t["local_path"]
    raw = path.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    text, enc = _decode(raw)
    out.update(file=t["file_name"], local_path=t["local_path"], sha256=sha, encoding=enc)
    records = list(csv.reader(io.StringIO(text)))
    header = [h.strip() for h in records[0]]
    body = records[1:]
    cols = []
    overrides = prof.get("column_overrides", {})
    for h in header:
        c = headers.classify(h)
        if h in overrides:
            c = {**c, **overrides[h], "note": overrides[h].get("note") or c["note"]}
            c["status"] = c["status"]
        cols.append(c)
    closure = _closure_columns(cols, [r for r in body if any(x.strip() for x in r)])
    for i, c in enumerate(cols):
        entry = {**c, "index": i, "unit_inferred": i in closure}
        out["columns"].append(entry)
        if c["status"] == "ambiguous":
            out["issues"].append(_issue("ambiguous_header", "high", acc, c["note"], column=c["header"]))
        elif c["status"] == "inferred":
            out["issues"].append(_issue("inferred_header", "medium", acc, c["note"], column=c["header"]))
        if c["value_basis"] in ("model_derived", "source_derived"):
            out["issues"].append(_issue(f"{c['value_basis']}_column", "info", acc, c["note"], column=c["header"]))
        if c.get("gravity") == "ambiguous":
            out["issues"].append(_issue("corrupted_header_character", "medium", acc, c["note"], column=c["header"]))
        if "Samle" in c["header"]:
            out["issues"].append(_issue("header_misspelled", "low", acc, "Header spelled 'Samle Thickness' in source; read as specimen thickness", column=c["header"]))
    physical = [i for i, c in enumerate(cols) if c["parameter"] or c["status"] == "ambiguous"]
    seen: dict[tuple, int] = {}
    prev_primary = None
    for ri, r in enumerate(body, start=1):
        if not any(x.strip() for x in r):
            continue
        r = r + [""] * (len(header) - len(r))
        rt = _row_type(gran, r, prev_primary)
        key = tuple(x.strip() for x in r)
        row = {"row": ri, "row_type": rt, "label": _label(cols, r),
               "measurements": [], "duplicate_of": None, "continuation_of": prev_primary if rt == "continuation" else None}
        if rt in ("annotation", "conditions_by_reference"):
            row["text"] = " | ".join(x.strip() for x in r if x.strip())
            out["issues"].append(_issue(f"{rt}_row", "info", acc, "Row is a table note / annotation, not an observation" if rt == "annotation"
                                        else "Row states its conditions only by reference to other rows; values are not copied", row=ri, raw=row["text"][:160]))
            if rt == "conditions_by_reference":
                # the material is stated in this row; the conditions are not copied from the referenced rows
                for ci in physical:
                    if cols[ci]["role"] == "material" and r[ci].strip():
                        row["measurements"].append(_measure(acc, out["file"], sha, ri, ci, cols[ci], r[ci], False))
                _derive(acc, row, out)
            out["rows"].append(row)
            continue
        if key in seen:
            row["duplicate_of"] = seen[key]
            out["issues"].append(_issue("duplicate_row", "medium", acc, f"Exact duplicate of row {seen[key]}", row=ri))
        else:
            seen[key] = ri
        if rt == "continuation":
            out["issues"].append(_issue("continuation_row", "info", acc, f"Continuation of row {prev_primary} (only some cells filled)", row=ri))
        for ci in physical:
            col = cols[ci]
            m = _measure(acc, out["file"], sha, ri, ci, col, r[ci], ci in closure)
            row["measurements"].append(m)
            if col["role"] == "material" and m["value_status"] == "qualitative":
                for g in materials.extract_geometry(r[ci]):
                    row["measurements"].append(_text_pattern(acc, out["file"], sha, ri, ci, col["header"], r[ci], g["parameter"], g["value"], g["unit"], "length", False, g["match"]))
            if col["parameter"] == "atmosphere_description" and r[ci].strip():
                mo = _atm_o2.search(r[ci])
                if mo:
                    row["measurements"].append(_text_pattern(acc, out["file"], sha, ri, ci, col["header"], r[ci], "oxygen_mole_fraction", float(mo.group(2)), "percent", "fraction",
                                                             bool(mo.group(1)), mo.group(0).strip()))
                md = _atm_dil.search(r[ci])
                if md:
                    sp = md.group(1)
                    if sp in DILUENTS:
                        m["diluent"] = DILUENTS[sp]
                    else:
                        m["flags"].append("implausible_formula")
                        m["flag_detail"] = f"diluent '{sp}' is not a known species; suspected spreadsheet autofill artifact (previous rows read 'N2')"
        for m in row["measurements"]:
            for f in m["flags"]:
                sev = {"spreadsheet_error": "medium", "non_positive_absolute_pressure": "high", "fraction_out_of_range": "high", "negative_concentration": "medium",
                       "negative_flow_value": "medium", "implausible_formula": "high", "leading_zero_integer": "medium", "unit_conflict": "medium",
                       "unit_unresolved": "low", "dimension_conflict": "medium", "composition_sum_deviation": "low", "none_token": "low", "value_in_figure": "low", "unit_inferred_composition_closure": "info"}.get(f)
                if sev:
                    out["issues"].append(_issue(f, sev, acc, m.get("flag_detail") or _FLAG_TEXT.get(f, f), row=ri, column=m["header"], raw=m["raw_value"]))
            if m["value_status"] == "over_range":
                out["issues"].append(_issue("over_range", "low", acc, _FLAG_TEXT["over_range"], row=ri, column=m["header"], raw=m["raw_value"]))
            if m["value_status"] == "censored":
                out["issues"].append(_issue("censored_value", "low", acc, _FLAG_TEXT["censored"], row=ri, column=m["header"], raw=m["raw_value"]))
        if closure:
            comp = [m for m in row["measurements"] if m["source"]["column_index"] in closure and m["value_kind"] == "number" and m.get("normalized_value") is not None]
            if len(comp) == len(closure):
                tot = sum(m["normalized_value"] for m in comp)
                if abs(tot - 1) > 0.02:
                    out["issues"].append(_issue("composition_sum_deviation", "low", acc, f"Stated composition sums to {tot:.3f}; an unlisted constituent or rounding is possible",
                                                row=ri, column=", ".join(cols[i]["header"] for i in sorted(closure))))
        if rt == "primary":
            prev_primary = ri
            _derive(acc, row, out)
            _check_initial_final(acc, row, out)
        out["rows"].append(row)
    _autofill_runs(out, out["columns"])
    physics.finalize(out, header, body)
    out["quality"] = quality(out)
    return out


_formula_n = re.compile(r"\b(C\d*H)(\d+)\b|\b(N)(\d+)\b")


def _autofill_runs(ds: dict, cols: list[dict]) -> None:
    """Flag spreadsheet autofill runs: consecutive rows whose chemical formula index increases by exactly 1
    (CH4 -> CH5 -> CH6 ...). Members after the first are flagged even when the formula happens to be a real species."""
    for col in cols:
        if col["role"] != "material" and col["parameter"] != "atmosphere_description":
            continue
        prev = None
        for row in ds["rows"]:
            m = next((x for x in row["measurements"] if x["source"]["column_index"] == col["index"] and x["extraction_method"] == "csv_cell"), None)
            if not m or not (m["raw_value"] or "").strip():
                continue
            f = _formula_n.search(m["raw_value"])
            cur = (f.group(1) or f.group(3), int(f.group(2) or f.group(4))) if f else None
            if cur and prev and cur[0] == prev[0] and cur[1] == prev[1] + 1:
                if "autofill_sequence" not in m["flags"]:
                    m["flags"].append("autofill_sequence")
                    if m.get("material"):
                        m["material"].update(canonical=None, fuel_class=None, excluded_reason="autofill_sequence")
                        for o in ds["observations"]:
                            if o["refs"].get("material") == m["id"]:
                                o["material"] = o["fuel_class"] = None
                    ds["issues"].append(_issue("autofill_sequence", "high", ds["accession"], f"Formula index increments row to row ({prev[0]}{prev[1]} -> {cur[0]}{cur[1]}); suspected spreadsheet autofill. Raw value kept.",
                                               row=row["row"], column=col["header"], raw=m["raw_value"]))
            prev = cur


_FLAG_TEXT = {
    "spreadsheet_error": "Spreadsheet error token; excluded from numeric statistics",
    "non_positive_absolute_pressure": "Absolute ambient pressure ≤ 0 is physically impossible for a combustion test; treated as a placeholder and excluded",
    "fraction_out_of_range": "Fraction above 100 %; value kept, excluded (possible spreadsheet percent-format artifact)",
    "negative_concentration": "Negative concentration reading (sensor offset / below detection); kept, excluded from statistics",
    "negative_flow_value": "Negative flow value; sign preserved. Its physical meaning (direction or offset) is not stated by the source",
    "leading_zero_integer": "Number with a leading zero and no decimal point (e.g. '037'); decimal point possibly lost. Not reinterpreted",
    "unit_conflict": "Header unit and cell unit disagree",
    "unit_unresolved": "Unit cannot be established from the header or the cell; raw value kept",
    "none_token": "'none' in a numeric column: may mean no reading or a null observation; not interpreted",
    "value_in_figure": "Value given in a figure of the source, not in the table",
    "unit_inferred_composition_closure": "No unit stated; read as mole fraction because composition columns sum to 1 in every row",
    "over_range": "Instrument over-range indicator ('OR'); no numeric value",
    "censored": "Censored value (bound, not a measurement)",
}


def _check_initial_final(acc: str, row: dict, ds: dict) -> None:
    """Flag rows where the final O2 differs from the initial O2 by more than 20 % (relative). Values are kept; the
    flag tells readers that the table's final reading may reflect consumption, vitiation or a recording issue."""
    ms = [m for m in row["measurements"] if m["parameter"] == "oxygen_mole_fraction" and m["value_kind"] == "number" and m["value_status"] in USABLE]
    i = next((m for m in ms if m["qualifier"] == "initial"), None)
    f = next((m for m in ms if m["qualifier"] == "final"), None)
    if i and f and i["normalized_value"] and abs(f["normalized_value"] - i["normalized_value"]) / i["normalized_value"] > 0.20:
        f["flags"].append("large_initial_final_change")
        ds["issues"].append(_issue("large_initial_final_change", "medium", acc,
                                   f"Final O2 {f['raw_value']} vs initial {i['raw_value']} (> 20 % relative change); kept as published, requires review",
                                   row=row["row"], column=f["header"], raw=f["raw_value"]))


def _derive(acc: str, row: dict, ds: dict) -> None:
    """Attach an observation (one point in condition space) and, when valid, the calculated oxygen partial pressure."""
    ms = row["measurements"]
    ox = _pick(ms, "oxygen_mole_fraction", ("initial", None, "mean"))
    pr = _pick(ms, "total_pressure", ("initial", None, "mean", "approximate"))
    fl = _pick(ms, "flow_velocity", (None,))
    th = _pick(ms, "specimen_thickness", (None,))
    mat = next((m for m in ms if m["parameter"] == "material" and m.get("material")), None)
    fd = next((m for m in ms if m["parameter"] == "flow_direction" and m["value_status"] == "qualitative"), None)
    dil = {p.split("_")[0]: _num(_pick(ms, p, ("initial", None)))[0] for p in ("nitrogen_mole_fraction", "helium_mole_fraction", "carbon_dioxide_mole_fraction")}
    ambiguous_species = [m for m in ms if m["parameter"] == "unresolved_species" and m["value_kind"] == "number" and m.get("value")]
    xf = _num(_pick(ms, "fuel_stream_mole_fraction", (None,)))[0]  # fuel diluted in the burner stream (e.g. Xfuel 0.15)
    x, xi, xv = _num(ox)
    p, pi, pv = _num(pr)
    f, fi, fv = _num(fl)
    tval, ti, tv = _num(th)
    po2 = None
    if x is not None and p is not None and ox["classification"]["status"] != "ambiguous" and pr["classification"]["status"] != "ambiguous":
        val = units.oxygen_partial_pressure(x, p)
        conf = "medium" if ("medium" in (ox["classification"]["confidence"], pr["classification"]["confidence"]) or ox["approximate"] or pr["approximate"]
                            or (ox.get("conversion") or {}).get("status") == "unit_inferred" or (pr.get("conversion") or {}).get("status") == "unit_inferred") else "high"
        calc = {"id": f"{acc}:r{row['row']}:pO2", "parameter": "oxygen_partial_pressure", "header": None, "qualifier": ox["qualifier"], "role": "derived",
                "dimension": "pressure", "raw_value": None, "raw_unit": None, "value_kind": "number", "approximate": ox["approximate"] or pr["approximate"],
                "normalized_value": round(val, 6), "normalized_unit": "kPa", "value_status": "calculated", "value_basis": "calculated",
                "conversion": None, "extraction_method": "calculation", "extraction_confidence": conf,
                "calculation": {"method": "dalton_law_xO2_times_Ptotal", "formula": "pO2 = xO2 × P_total",
                                "inputs": [{"id": ox["id"], "parameter": "oxygen_mole_fraction", "value": x, "unit": "fraction", "raw": ox["raw_value"], "header": ox["header"]},
                                           {"id": pr["id"], "parameter": "total_pressure", "value": p, "unit": "kPa", "raw": pr["raw_value"], "header": pr["header"]}],
                                "assumptions": ["Total pressure is absolute (header states no gauge reference; magnitudes match absolute chamber pressure)",
                                                "Ideal-gas mixture (Dalton's law)"]},
                "classification": {"status": "calculated", "confidence": conf, "note": None},
                "source": {"accession": acc, "file": ds["file"], "sha256": ds["sha256"], "row": row["row"], "column_index": None, "column": None}, "flags": ["calculated_value"]}
        ux = (ox.get("uncertainty") or {}).get("value")
        up = (pr.get("uncertainty") or {}).get("value")
        calc["uncertainty"] = {**physics.propagate_product(x, ux, p, up),
                               "inputs": {"oxygen_mole_fraction": (ox.get("uncertainty") or {}).get("status"), "total_pressure": (pr.get("uncertainty") or {}).get("status")}}
        ms.append(calc)
        po2 = calc["normalized_value"]
    obs = {"id": f"{acc}:r{row['row']}", "accession": acc, "row": row["row"], "label": row["label"], "granularity": ds["granularity"],
           "row_type": "duplicate" if row["duplicate_of"] else "primary", "gravity": ds["gravity"]["condition"],
           "x_o2": x, "x_o2_interval": xi, "x_o2_values": xv, "x_o2_status": ox["value_status"] if ox else None,
           "x_o2_basis": ox["value_basis"] if ox else None, "x_o2_confidence": ox["classification"]["confidence"] if ox else None,
           "p_kpa": p, "p_interval": pi, "p_values": pv, "p_approximate": bool(pr and pr["approximate"]),
           "po2_kpa": po2, "flow_cm_s": f, "flow_interval": fi, "flow_values": fv, "thickness_mm": tval, "thickness_interval": ti,
           "material": mat["material"]["canonical"] if mat else None, "material_raw": mat["value_text"] if mat else None,
           "fuel_class": mat["material"]["fuel_class"] if mat else None, "material_mixture": bool(mat and mat["material"].get("mixture")) or bool(xf is not None and xf < 1),
           "material_components": (mat["material"].get("components") or []) if mat else [], "flow_direction": (fd["value_text"].strip().lower() if fd else None),
           "diluents": {k: v for k, v in dil.items() if v is not None}, "ambiguous_species": [{"header": m["header"], "raw": m["raw_value"]} for m in ambiguous_species],
           "approximate_o2": bool(ox and ox["approximate"]),
           "refs": {k: (m["id"] if m else None) for k, m in (("x_o2", ox), ("p", pr), ("flow", fl), ("thickness", th), ("material", mat))}}
    if any(obs[k] is not None for k in ("x_o2", "x_o2_interval", "x_o2_values", "p_kpa", "p_interval", "p_values", "flow_cm_s", "flow_interval", "flow_values", "thickness_mm", "material")):
        ds["observations"].append(obs)


def quality(ds: dict) -> dict:
    ms = [m for r in ds["rows"] for m in r["measurements"] if m["value_status"] != "calculated"]
    st = Counter(m["value_status"] for m in ms)
    dup_rows = {r["row"] for r in ds["rows"] if r["duplicate_of"]}
    numeric = [m for m in ms if m["value_kind"] in NUMERIC_KINDS and m["dimension"] not in (None, "categorical")]
    normalized = [m for m in numeric if m.get("normalized_unit") and (m.get("conversion") or {}).get("status") in ("converted", "identity", "unit_inferred")]
    prov = [m for m in ms if all(m["source"].get(k) is not None for k in ("accession", "file", "row", "column"))]
    rows = ds["rows"]
    rt = Counter(r["row_type"] for r in rows)
    return {
        "total_rows": len(rows), "row_types": dict(rt), "duplicate_rows": sum(1 for r in rows if r["duplicate_of"]),
        "parsed_rows": sum(1 for r in rows if r["measurements"]), "observations": len(ds["observations"]),
        "measurements": len(ms), "by_status": dict(st),
        "valid_numeric": sum(1 for m in numeric if m["value_status"] in USABLE and m["source"]["row"] not in dup_rows),
        "missing": st.get("missing", 0), "invalid": st.get("invalid", 0), "unresolved": st.get("unresolved", 0), "ambiguous": st.get("ambiguous", 0),
        "censored": st.get("censored", 0), "over_range": st.get("over_range", 0),
        "calculated": sum(1 for r in rows for m in r["measurements"] if m["value_status"] == "calculated"),
        "unit_conversion_coverage": {"numeric_cells": len(numeric), "normalized": len(normalized), "ratio": round(len(normalized) / len(numeric), 3) if numeric else None},
        "provenance_coverage": {"measurements": len(ms), "with_cell_reference": len(prov), "ratio": round(len(prov) / len(ms), 3) if ms else None},
        "ambiguous_headers": [c["header"] for c in ds["columns"] if c["status"] == "ambiguous"],
        "inferred_headers": [c["header"] for c in ds["columns"] if c["status"] == "inferred"],
        "issue_counts": dict(Counter(i["code"] for i in ds["issues"])),
    }


def _build_all() -> dict[str, dict]:
    return {a: build_dataset(a) for a in sorted(psi.PSI, key=lambda x: int(x.split("-")[1]))}


DATASETS: dict[str, dict] = _build_all()


def all_observations(include_duplicates: bool = False) -> list[dict]:
    return [o for d in DATASETS.values() for o in d["observations"] if include_duplicates or o["row_type"] != "duplicate"]


def measurements(acc: str) -> list[dict]:
    return [m for r in DATASETS[acc]["rows"] for m in r["measurements"]]


def parameter_stats(acc: str) -> dict[str, dict]:
    """Per parameter: counts by status and min/max of usable single values in canonical units (never including invalid cells)."""
    out: dict[str, dict] = {}
    dup_rows = {r["row"] for r in DATASETS[acc]["rows"] if r["duplicate_of"]}
    for m in measurements(acc):
        p = m["parameter"]
        if not p or m["source"]["row"] in dup_rows:
            continue
        # never pool values that describe different states: final vs initial, different gravity columns
        if m.get("qualifier") == "final":
            p = f"{p}__final"
        if m.get("column_gravity"):
            p = f"{p}__{'1g' if m['column_gravity'] == 'normal_gravity' else 'gravity_marker_corrupted'}"
        e = out.setdefault(p, {"parameter": p, "unit": None, "n_usable": 0, "n_total": 0, "statuses": Counter(), "min": None, "max": None,
                               "headers": [], "bases": set(), "kinds": set(), "examples": []})
        e["n_total"] += 1
        e["statuses"][m["value_status"]] += 1
        if m["header"] and m["header"] not in e["headers"]:
            e["headers"].append(m["header"])
        vals = []
        if m["value_status"] in USABLE | {"calculated"}:
            e["bases"].add(m["value_basis"])
            e["kinds"].add(m["value_kind"])
            if m["value_kind"] == "number" and m.get("normalized_value") is not None:
                vals = [m["normalized_value"]]
            elif m["value_kind"] == "range":
                vals = [m["normalized_low"], m["normalized_high"]]
            elif m["value_kind"] == "list":
                vals = m["normalized_values"]
        if vals:
            e["n_usable"] += 1
            e["unit"] = m["normalized_unit"]
            e["min"] = min([e["min"]] + vals) if e["min"] is not None else min(vals)
            e["max"] = max([e["max"]] + vals) if e["max"] is not None else max(vals)
        elif m["value_status"] == "qualitative" and len(e["examples"]) < 8:
            v = (m.get("material") or {}).get("canonical") or m.get("value_text")
            if v and v not in e["examples"]:
                e["examples"].append(v)
    for e in out.values():
        e["statuses"] = dict(e["statuses"])
        e["bases"] = sorted(e["bases"])
        e["kinds"] = sorted(e["kinds"])
    return out
