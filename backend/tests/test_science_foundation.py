"""Stage 2 gate: parser, units, species classification, missing values, pO2, provenance, granularity.

Every expectation here was checked by hand against the published CSV cell (see validation/reference_set.json for the
manually verified reference values)."""
import csv
import io
import math
import re

import pytest

from app import psi
from app.science import cells, headers, materials, units
from app.science import measurements as M


# ---------- units ----------
@pytest.mark.parametrize("v,u,dim,exp,unit", [
    (1, "atm", "pressure", 101.325, "kPa"), (760, "mmHg", "pressure", 101.325, "kPa"), (8.2, "psi", "pressure", 56.537, "kPa"),
    (1, "bar", "pressure", 100.0, "kPa"), (101325, "Pa", "pressure", 101.325, "kPa"), (0.1, "MPa", "pressure", 100.0, "kPa"),
    (1, "m/s", "velocity", 100.0, "cm/s"), (20, "cm/s", "velocity", 20.0, "cm/s"), (12, "mm/s", "velocity", 1.2, "cm/s"),
    (1, "m", "length", 1000.0, "mm"), (0.33, "cm", "length", 3.3, "mm"), (100, "micron", "length", 0.1, "mm"),
    (34, "%", "fraction", 0.34, "fraction"), (34, "percent", "fraction", 0.34, "fraction"), (950, "ppm", "fraction", 9.5e-4, "fraction"),
    (0.21, "mole fraction", "fraction", 0.21, "fraction"), (1500, "ms", "time", 1.5, "s"), (2, "minutes", "time", 120, "s"),
    (25, "C", "temperature", 298.15, "K"), (300, "K", "temperature", 300, "K"),
])
def test_unit_conversions(v, u, dim, exp, unit):
    n = units.normalize(v, u, dim)
    assert n["normalized_unit"] == unit and math.isclose(n["normalized_value"], exp, rel_tol=1e-4)
    assert n["conversion_method"]


def test_unknown_or_missing_unit_is_never_guessed():
    assert units.normalize(5, None, "pressure")["conversion_status"] == "unit_unresolved"
    assert units.normalize(5, "furlongs", "length")["normalized_value"] is None


def test_po2_formula():
    p = units.normalize(8.2, "psi", "pressure")["normalized_value"]
    assert math.isclose(units.oxygen_partial_pressure(0.34, p), 0.34 * 8.2 * 6.894757, rel_tol=1e-6)  # 2.788 psi = 19.22 kPa
    with pytest.raises(ValueError):
        units.oxygen_partial_pressure(0.34, 0)
    with pytest.raises(ValueError):
        units.oxygen_partial_pressure(34, 101.3)


# ---------- species classification (CASE A, B) ----------
@pytest.mark.parametrize("h,param,status", [
    ("Initial O2 % by vol", "oxygen_mole_fraction", "resolved"),
    ("Final O2 % by vol", "oxygen_mole_fraction", "resolved"),
    ("Calibrated  initial O2 % by vol ", "oxygen_mole_fraction", "resolved"),
    ("Initial CO2 % by vol", "carbon_dioxide_mole_fraction", "resolved"),
    ("Final CO2 % by vol", "carbon_dioxide_mole_fraction", "resolved"),
    ("Initial CO (ppm)", "carbon_monoxide_mole_fraction", "resolved"),
    ("O initial ambient composition; mole fraction", "oxygen_mole_fraction", "inferred"),
    ("N initial ambient composition; mole fraction", "nitrogen_mole_fraction", "inferred"),
    ("CO initial ambient composition; mole fraction", None, "ambiguous"),
    ("XO2 (init)", "oxygen_mole_fraction", "resolved"), ("percent_O2", "oxygen_mole_fraction", "resolved"),
    ("co2_initial", "carbon_dioxide_mole_fraction", "resolved"), ("CO-2 initial", "carbon_dioxide_mole_fraction", "resolved"), ("O₂ initial %", "oxygen_mole_fraction", "resolved"),
])
def test_header_species(h, param, status):
    c = headers.classify(h)
    assert c["parameter"] == param and c["status"] == status
    assert c["header"] == h.strip()


def test_co2_never_oxygen_anywhere():
    for d in M.DATASETS.values():
        for col in d["columns"]:
            if "co2" in headers.tokens(col["header"]):
                assert col["parameter"] == "carbon_dioxide_mole_fraction", col["header"]
    assert not [c for c in psi.conditions("PSI-25") if c["parameter"] == "oxygen" and "CO" in c["column"]]


def test_psi69_co_column_is_ambiguous_and_never_used():
    col = next(c for c in M.DATASETS["PSI-69"]["columns"] if c["header"].startswith("CO initial"))
    assert col["status"] == "ambiguous" and col["parameter"] is None
    assert all("carbon" not in k for o in M.DATASETS["PSI-69"]["observations"] for k in o["diluents"])


# ---------- cells ----------
@pytest.mark.parametrize("raw,kind", [
    ("", "empty"), ("N/A", "missing"), ("n/a", "missing"), ("NA", "missing"), ("-", "missing"), ("–", "missing"), ("—", "missing"),
    ("#DIV/0!", "error"), ("OR", "over_range"), (">500", "censored"), ("none", "none_token"), ("video", "text"),
    ("250>50>250", "text"), ("20 cm/s", "number"), ("0.27 mm", "number"), (".33 cm", "number"), ("1 atm", "number"),
    ("-0.28", "number"), ("1e-3", "number"), ("21.5 - 21.7", "range"), ("30%-40%", "range"), ("22.1 to 22.0", "range"),
    ("21; 26.5; 40", "list"), ("0.5; 1.0; 1.5; 2.0; or 3.0 ", "list"), ("037 mm", "ambiguous"), ("See Fig. 5", "reference"),
    ("~ 21.5", "number"), ("~ 10 cm (note 3)", "number"), ("n/a (Nomex)", "missing"), ("RAMPED", "text"),
])
def test_cell_kinds(raw, kind):
    c = cells.parse_cell(raw)
    assert c["kind"] == kind and c["raw"] == raw


def test_cell_values_and_units():
    c = cells.parse_cell("20 cm/s")
    assert c["value"] == 20 and c["unit"] == "cm/s"
    assert cells.parse_cell("-0.28")["value"] == -0.28
    assert cells.parse_cell("~ 21.5")["approximate"] is True
    c = cells.parse_cell(">500")
    assert c["op"] == ">" and c["bound"] == 500
    assert cells.parse_cell("0.5; 1.0; 1.5; 2.0; or 3.0")["values"] == [0.5, 1.0, 1.5, 2.0, 3.0]


# ---------- dataset edge cases (CASES C-J) ----------
def _cells(acc, header):
    return [m for r in M.DATASETS[acc]["rows"] for m in r["measurements"] if m["header"] == header and m["extraction_method"] == "csv_cell"]


def test_case_c_psi69_zero_pressure_is_invalid_not_minimum():
    z = [m for m in _cells("PSI-69", "Ambient pressure; mmHg") if m["raw_value"].strip() == "0"]
    assert len(z) == 1 and z[0]["value_status"] == "invalid" and "non_positive_absolute_pressure" in z[0]["flags"]
    pr = next(c for c in psi.conditions("PSI-69") if c["parameter"] == "pressure")
    assert pr["min"] > 0 and pr["excluded"].get("invalid") == 1
    assert not any(m["parameter"] == "oxygen_partial_pressure" and m["source"]["row"] == z[0]["source"]["row"] for m in M.measurements("PSI-69"))


def test_case_d_psi99_embedded_units_and_misspelled_header():
    th = _cells("PSI-99", "Samle Thickness")
    assert th[0]["raw_value"] == "0.27 mm" and math.isclose(th[0]["normalized_value"], 0.27) and th[0]["normalized_unit"] == "mm"
    assert any(m["raw_value"] == "037 mm" and m["value_status"] == "ambiguous" for m in th)  # not silently read as 37 or 0.37
    assert any(m["raw_value"] == "See Fig. 5" and m["value_status"] == "unresolved" for m in th)
    fl = _cells("PSI-99", "Air Flow (cm/s)")
    assert all(m["normalized_value"] == 20 for m in fl)
    ox = _cells("PSI-99", "Percent O2 (Note 1)")
    assert all(m["value_basis"] == "source_derived" for m in ox)


def test_case_e_psi107_negative_air_rate_preserved():
    neg = [m for m in _cells("PSI-107", "Air Rate (cm/s)") if m["raw_value"].strip().startswith("-")]
    assert len(neg) == 8  # five rows -0.28 and three rows -5.92 (verified in the CSV)
    assert all(m["value"] == float(m["raw_value"]) < 0 and "negative_flow_value" in m["flags"] for m in neg)
    assert all(m["value_status"] == "source_reported" for m in neg)
    rows = {m["source"]["row"] for m in neg}
    for o in M.DATASETS["PSI-107"]["observations"]:
        if o["row"] in rows:
            assert o["flow_cm_s"] is None  # unclear sign -> never used for matching or coverage


def test_case_f_lowercase_na():
    na = [m for m in M.measurements("PSI-101") if (m["raw_value"] or "").strip() == "n/a"]
    assert na and all(m["value_status"] == "missing" for m in na)


def test_case_g_div0_excluded_from_stats():
    bad = [m for m in M.measurements("PSI-159") if (m["raw_value"] or "").strip() == "#DIV/0!"]
    assert len(bad) == 4 and all(m["value_status"] == "invalid" for m in bad)
    st = M.parameter_stats("PSI-159")["adiabatic_flame_temperature"]
    assert st["statuses"]["invalid"] == 2 and st["min"] is not None  # 2 in Tad (K), 2 in Zst
    assert M.parameter_stats("PSI-159")["stoichiometric_mixture_fraction"]["statuses"]["invalid"] == 2


def test_case_h_autofill_artifacts_flagged_not_corrected():
    f21 = [m for m in M.measurements("PSI-21") if "implausible_formula" in m["flags"]]
    assert f21 and all(re.search(r"C\d*H\d+", m["raw_value"]) and m["value_status"] == "qualitative" for m in f21)
    seq = [m["raw_value"] for m in M.measurements("PSI-21") if "autofill_sequence" in m["flags"]]
    assert "100% C2H6" in seq  # a real species name inside an incrementing run is still flagged
    f23 = [m for m in M.measurements("PSI-23") if "implausible_formula" in m["flags"]]
    assert any("N3" in m["raw_value"] for m in f23)


def test_case_i_figure_index_is_not_observation():
    d = M.DATASETS["PSI-142"]
    assert d["granularity"] == "publication_figure_index" and d["observations"] == []


def test_case_j_modeling_studies_are_distinguished():
    for a in ("PSI-60", "PSI-62", "PSI-115"):
        assert M.DATASETS[a]["study_type"] != "flight_experiment" and M.DATASETS[a]["observations"] == []


def test_psi20_percent_artifacts_invalid():
    bad = [m for m in M.measurements("PSI-20") if (m["raw_value"] or "").strip() in ("3400%", "2100%")]
    assert len(bad) == 2 and all(m["value_status"] == "invalid" for m in bad)


def test_psi25_none_or_censored():
    ms = [m for m in M.measurements("PSI-25") if m["raw_value"] is not None]
    assert all(m["value_status"] == "over_range" for m in ms if m["raw_value"].strip() == "OR")
    assert all(m["value_status"] == "censored" for m in ms if m["raw_value"].strip() == ">500")
    assert all(m["value_status"] == "ambiguous" for m in ms if m["raw_value"].strip() == "none" and m["dimension"] == "fraction")


def test_psi68_matrix_forms_no_o2_pressure_points():
    for o in M.DATASETS["PSI-68"]["observations"]:
        assert o["x_o2"] is None and o["p_kpa"] is None and o["x_o2_values"] and o["p_values"]
        assert o["po2_kpa"] is None


# ---------- pO2, provenance, granularity ----------
def test_po2_only_from_valid_inputs_and_traceable():
    n = 0
    for d in M.DATASETS.values():
        for r in d["rows"]:
            for m in r["measurements"]:
                if m["parameter"] != "oxygen_partial_pressure":
                    continue
                n += 1
                assert m["value_status"] == "calculated" and m["value_basis"] == "calculated"
                x, p = m["calculation"]["inputs"]
                assert 0 <= x["value"] <= 1 and p["value"] > 0
                assert math.isclose(m["normalized_value"], x["value"] * p["value"], rel_tol=1e-6)
    assert n > 0


def test_raw_values_recoverable_and_provenance_complete():
    for acc, d in M.DATASETS.items():
        if not d["file"]:
            continue
        text = (psi.DATA / d["local_path"]).read_bytes()
        rows = list(csv.reader(io.StringIO(text.decode("utf-8-sig" if d["encoding"] == "utf-8" else "cp1252"))))
        for r in d["rows"]:
            for m in r["measurements"]:
                if m["extraction_method"] == "calculation":
                    continue
                s = m["source"]
                cell = rows[s["row"]][s["column_index"]] if s["column_index"] < len(rows[s["row"]]) else ""
                assert cell == m["raw_value"], (acc, s)
                assert rows[0][s["column_index"]].strip() == s["column"]
        assert d["quality"]["provenance_coverage"]["ratio"] in (None, 1.0)


def test_granularity_is_explicit_for_every_dataset():
    for acc, d in M.DATASETS.items():
        assert d["granularity"] in M.GRANULARITY_DEFS, acc
    assert M.DATASETS["PSI-20"]["granularity"] == "test_day_summary"


def test_quality_is_computed_not_hardcoded():
    q = M.DATASETS["PSI-159"]["quality"]
    assert q["invalid"] == sum(1 for m in M.measurements("PSI-159") if m["value_status"] == "invalid")


def test_material_canonicalization():
    assert materials.canonical("100 micron PMMA film   2 cm wide")["canonical"] == "PMMA"
    assert materials.canonical("40% CH5")["flags"]
    assert materials.canonical("1/4\" clear rod")["canonical"] is None  # material not stated -> not guessed
    g = materials.extract_geometry("100 micron PMMA film   2 cm wide")
    assert {x["parameter"] for x in g} == {"specimen_thickness", "specimen_width"}


def test_ambiguous_header_cells_never_usable():
    co = [m for m in M.measurements("PSI-69") if m["parameter"] == "unresolved_species"]
    assert co and all(m["value_status"] in ("ambiguous", "missing") for m in co)
    from app.science import passport
    assert passport.coverage("PSI-69")["unresolved_species"]["availability"] == "ambiguous"
