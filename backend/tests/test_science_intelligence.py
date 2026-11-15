"""Stage 3-5 gates: passports, physical matching, explanations, coverage, gap detection, reports, exports, API."""
import csv
import io
import json
import re

import pytest
from fastapi.testclient import TestClient

from app import psi
from app.main import app
from app.science import coverage, explain, matching, passport, report
from app.science import measurements as M
from app.science.scenario import ScenarioTarget, validate
from app.science.texts_sci import EN as SEN, RU as SRU

client = TestClient(app)
LUNAR = {"name": "Lunar habitat demo", "oxygen_mole_fraction": {"value": 34, "unit": "%", "origin": "curated_assumption"},
         "total_pressure": {"value": 8.2, "unit": "psi", "origin": "curated_assumption"}, "gravity": {"value": "lunar", "origin": "curated_assumption"}}


def targets(sc=LUNAR):
    v = validate(ScenarioTarget(**sc))
    assert not v["errors"]
    return v["targets"]


# ---------- passports ----------
def test_every_psi_record_has_a_passport_from_real_data():
    for acc in psi.PSI:
        p = passport.passport(acc)
        assert p["accession"] == acc and p["objective"] == psi.PSI[acc]["objective"]
        params = {x["parameter"] for g in p["groups"] for x in g["parameters"]}
        assert {"oxygen_mole_fraction", "total_pressure", "flow_velocity", "gravity_condition"} <= params


def test_passport_marks_missing_instead_of_placeholders():
    p = passport.passport("PSI-25")
    cov = {x["parameter"]: x for g in p["groups"] for x in g["parameters"]}
    assert cov["total_pressure"]["availability"] == "missing"  # BASS-II table states no pressure
    assert cov["oxygen_mole_fraction"]["availability"] == "measured"  # 'Calibrated' O2 columns
    assert cov["carbon_dioxide_mole_fraction"]["availability"] in ("measured", "source_reported")
    assert passport.passport("PSI-60")["limitations"][0] == "no_experiment_table"


def test_passport_po2_is_calculated_and_psi99_o2_source_derived():
    cov = passport.coverage("PSI-69")
    assert cov["oxygen_partial_pressure"]["availability"] == "calculated"
    assert passport.coverage("PSI-99")["oxygen_mole_fraction"]["availability"] == "source_derived"
    assert passport.coverage("PSI-25")["specimen_thickness"]["availability"] == "extracted"


# ---------- validation ----------
def test_scenario_validation():
    v = validate(ScenarioTarget(**LUNAR))
    t = v["targets"]
    assert abs(t["total_pressure"]["value"] - 56.537) < 0.01 and t["oxygen_mole_fraction"]["value"] == 0.34
    assert t["oxygen_partial_pressure"]["origin"] == "calculated_from_scenario" and abs(t["oxygen_partial_pressure"]["value"] - 19.2226) < 1e-3
    bad = validate(ScenarioTarget(oxygen_mole_fraction={"value": 140, "unit": "%"}, total_pressure={"value": -1, "unit": "kPa"}))
    assert {e["code"] for e in bad["errors"]} == {"fraction_out_of_range", "non_positive"}
    assert validate(ScenarioTarget(total_pressure={"value": 1, "unit": "furlong"}))["errors"][0]["code"] == "unknown_unit"
    w = validate(ScenarioTarget(oxygen_mole_fraction={"value": 0.3, "unit": "fraction"}, total_pressure={"value": 100, "unit": "kPa"},
                                oxygen_partial_pressure={"value": 50, "unit": "kPa"}))["warnings"]
    assert w[0]["code"] == "inconsistent_po2"
    assert validate(ScenarioTarget())["targets"] == {}  # no silent defaults


# ---------- matching ----------
def test_matching_uses_physical_values_and_counts_dimensions():
    r = matching.rank(targets())
    top = r["ranked"][0]
    assert top["counts"]["requested"] == 4 and top["counts"]["comparable"] >= 2
    for d in top["dimensions"]:
        if d["state"] in ("MATCH", "PARTIAL_MATCH", "MISMATCH") and d["dimension"] in matching.CONTINUOUS:
            assert d["experiment_value"] is not None and d["target"] is not None and d["source_ref"]
    # gravity never matches: every flight dataset is microgravity
    assert all(next(x for x in r_["dimensions"] if x["dimension"] == "gravity")["state"] != "MATCH" for r_ in r["ranked"])


def test_missing_never_counts_as_match():
    r = matching.match_dataset("PSI-25", targets())  # BASS-II: no pressure column
    st = {d["dimension"]: d["state"] for d in r["dimensions"]}
    assert st["total_pressure"] == "MISSING_IN_EXPERIMENT"
    assert r["counts"]["match"] + r["counts"]["partial"] + r["counts"]["mismatch"] + r["counts"]["missing"] + r["counts"]["not_comparable"] == 4


def test_best_observation_is_joint_not_marginal():
    r = matching.match_dataset("PSI-69", targets())
    row = next(x for x in M.DATASETS["PSI-69"]["rows"] if x["row"] == r["best_observation"]["row"])
    vals = {m["parameter"]: m.get("normalized_value") for m in row["measurements"]}
    o2 = next(d for d in r["dimensions"] if d["dimension"] == "oxygen_mole_fraction")["experiment_value"]
    p = next(d for d in r["dimensions"] if d["dimension"] == "total_pressure")["experiment_value"]
    assert o2 == vals["oxygen_mole_fraction"] and abs(p - vals["total_pressure"]) < 1e-9


def test_test_matrix_never_claims_joint_match():
    r = matching.match_dataset("PSI-68", targets({"oxygen_mole_fraction": {"value": 0.21, "unit": "fraction"}, "total_pressure": {"value": 1, "unit": "atm"}}))
    assert r["joint_matches"] == 0
    assert all(d["state"] != "MATCH" for d in r["dimensions"] if d["dimension"] in matching.CONTINUOUS)


def test_insufficient_data_is_not_ranked():
    r = matching.rank(targets({"flow_velocity": {"value": 20, "unit": "cm/s"}, "specimen_thickness": {"value": 0.25, "unit": "mm"}}))
    for x in r["insufficient"]:
        assert x["counts"]["comparable"] < 2 and "rank" not in x
    only_one = matching.rank(targets({"gravity": {"value": "lunar"}}))
    assert only_one["status"] == "insufficient_data_for_reliable_ranking" and not only_one["ranked"]


def test_tolerance_boundaries():
    assert matching._state("oxygen_mole_fraction", matching._dist("oxygen_mole_fraction", 0.34, 0.36), 0.34) == "MATCH"
    assert matching._state("oxygen_mole_fraction", matching._dist("oxygen_mole_fraction", 0.34, 0.38), 0.34) == "PARTIAL_MATCH"
    assert matching._state("oxygen_mole_fraction", matching._dist("oxygen_mole_fraction", 0.34, 0.21), 0.34) == "MISMATCH"
    assert matching._state("total_pressure", matching._dist("total_pressure", 56.5, 101.3), 56.5) == "MISMATCH"


def test_explanations_use_only_comparison_values():
    for r in matching.rank(targets())["ranked"][:5]:
        txt = explain.explain(r, "en")
        nums = {float(x) for x in re.findall(r"(\d+(?:\.\d+)?) (?:%|kPa)", txt)}
        allowed = set()
        for d in r["dimensions"]:
            for v in (d.get("experiment_value"), d.get("target")):
                if isinstance(v, (int, float)):
                    allowed |= {float(explain.fmt(d["dimension"], v).split()[0])}
        assert nums <= allowed, (r["accession"], nums - allowed)
        if any(d["state"] in ("MISMATCH", "MISSING_IN_EXPERIMENT", "NOT_COMPARABLE") for d in r["dimensions"]):
            assert "not evidence of equivalent combustion behaviour" in txt
        assert not re.search(r"\b(is|are) equivalent\b|\bsafe\b", txt, re.I)


def test_science_texts_are_complete_in_russian():
    assert set(SEN) == set(SRU)
    for k, v in SEN.items():
        if isinstance(v, dict):
            assert set(v) == set(SRU[k]), k


# ---------- coverage and gaps (Stage 4) ----------
def test_coverage_map_points_are_real_rows():
    cm = coverage.coverage_map()
    assert cm["o2_vs_p"]["n"] == len(cm["o2_vs_p"]["points"]) > 0
    for p in cm["o2_vs_p"]["points"][:50]:
        acc, row = p["id"].split(":r")
        r = next(x for x in M.DATASETS[acc]["rows"] if x["row"] == int(row))
        o2 = [m for m in r["measurements"] if m["parameter"] == "oxygen_mole_fraction" and m.get("normalized_value") is not None]
        assert any(abs(m["normalized_value"] * 100 - p["o2_pct"]) < 1e-6 for m in o2)
    assert all(p["accession"] != "PSI-68" for p in cm["o2_vs_p"]["points"])  # matrix rows are envelopes, not points
    assert cm["o2_vs_p"]["envelopes"]


def test_gap_classification_is_deterministic_and_traceable():
    a = coverage.gaps(targets(), "en")
    b = coverage.gaps(targets(), "en")
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    g = {x["key"]: x for x in a["gaps"]}
    assert g["gravity"]["classification"] == "NO_MATCHING_RECORDS"  # no lunar-gravity record in the collection
    assert g["flow_o2"]["classification"] == "NOT_ASSESSABLE"
    o2p = g["o2_p"]
    # verified by hand: nearest PSI-159 rows are at 50.66 kPa, 10.4 % below the 56.54 kPa target (> 10 % MATCH tolerance)
    assert o2p["classification"] == "NO_MATCHING_RECORDS" and o2p["supporting_records"] == 0
    assert o2p["partial_records"] > 0 and o2p["reporting_records"] > 0 and o2p["nearest"]["id"]
    for ref in o2p["evidence_refs"] + o2p["partial_refs"]:
        acc, row = ref.split(":r")
        assert any(r["row"] == int(row) for r in M.DATASETS[acc]["rows"])


def test_gap_text_never_claims_absent_knowledge():
    for lang in ("en", "ru"):
        for g in coverage.gaps(targets(), lang)["gaps"]:
            assert "no scientific knowledge" not in g["explanation"].lower()
    assert "does not mean" in coverage.gaps(targets(), "en")["disclaimer"]


def test_observed_rule_requires_two_investigations():
    t = targets({"oxygen_mole_fraction": {"value": 21, "unit": "%"}, "total_pressure": {"value": 1, "unit": "atm"}})
    g = coverage.analyze_combo("o2_p", "gap_o2p", ["oxygen_mole_fraction", "total_pressure"], t, "en")
    assert g["classification"] == "OBSERVED" and len(g["accessions"]) >= 2 and g["supporting_records"] >= 3


# ---------- reports, exports, API ----------
def test_report_sections_and_classes():
    r = report.report(ScenarioTarget(**LUNAR), "en")
    for k in ("scenario", "relevant_experiments", "comparison_matrix", "coverage", "gaps", "missing_information", "data_quality",
              "source_references", "limitations", "generated_at"):
        assert r[k] is not None
    assert r["scenario"]["content_class"] == "scenario_assumption" and r["ai_used"] is False
    assert "not endorsed by NASA" in r["markdown"] and "Scenario definition" in r["markdown"]


def test_csv_export_preserves_raw_and_provenance():
    rsp = client.get("/api/evidence/export?format=csv&accessions=PSI-69")
    assert rsp.status_code == 200
    rows = list(csv.DictReader(io.StringIO(rsp.text)))
    z = [r for r in rows if r["source_column"] == "Ambient pressure; mmHg" and r["raw_value"] == "0"]
    assert z and z[0]["value_status"] == "invalid" and z[0]["raw_unit"] == "mmhg"
    calc = [r for r in rows if r["content_class"] == "calculated_value"]
    assert calc and all(r["calculation_inputs"] for r in calc)


def test_json_export_labels_dataset_honestly():
    j = client.post("/api/evidence/export", json={"scenario": LUNAR, "format": "json"}).json()
    assert "NOT validated" in j["dataset_type"] and j["scenario"]["content_class"] == "scenario_assumption"
    assert j["measurements"] and all("source" in m and "value_status" in m for m in j["measurements"])


@pytest.mark.parametrize("path", ["/api/evidence/summary", "/api/evidence/quality", "/api/passports", "/api/passports/PSI-69", "/api/coverage/matrix",
                                  "/api/coverage/map", "/api/scenario-presets?lang=ru", "/api/evidence/datasets/PSI-25/measurements?parameter=carbon_dioxide_mole_fraction",
                                  "/api/evidence/datasets/PSI-69/issues", "/api/evidence/datasets/PSI-69/rows/1"])
def test_new_endpoints(path):
    assert client.get(path).status_code == 200


def test_new_endpoint_errors():
    assert client.get("/api/passports/PSI-0").status_code == 404
    assert client.post("/api/match", json={"scenario": {"oxygen_mole_fraction": {"value": 340, "unit": "%"}}}).status_code == 422
    assert client.post("/api/gaps", json={"scenario": {"total_pressure": {"value": 1, "unit": "xyz"}}}).status_code == 422


@pytest.mark.parametrize("lang", ["en", "ru"])
def test_match_and_gaps_endpoints(lang):
    m = client.post("/api/match", json={"scenario": LUNAR, "lang": lang}).json()
    assert m["ranked"] and m["ranked"][0]["explanation"]
    g = client.post("/api/gaps", json={"scenario": LUNAR, "lang": lang}).json()
    assert g["gaps"] and g["coverage_map"]["o2_vs_p"]["n"] > 0


def test_summary_does_not_equate_rows_with_experiments():
    s = client.get("/api/evidence/summary").json()
    assert s["table_rows"] == sum(d["quality"]["total_rows"] for d in M.DATASETS.values())
    assert s["observations"] < s["table_rows"] and "not independent experiments" in s["note"]


def test_compare_keeps_legacy_rows_and_adds_normalized():
    rows = {r["key"]: r for r in client.post("/api/compare", json={"ids": ["FLEX_001", "CFI_002"]}).json()["rows"]}
    assert "psi_oxygen" in rows and "objective" in rows
    assert rows["norm_oxygen_mole_fraction"]["status"] in ("same", "similar", "different", "incompatible_granularity")
    assert rows["norm_oxygen_partial_pressure"]["values"][0][0].find("calculated") > 0


# ---------- assistant grounding (Stage 5.1) ----------
from app import assistant  # noqa: E402


def test_numeric_grounding():
    ev = ["PSI-69: oxygen mole fraction 12–34 % from 274 rows"]
    assert assistant._numbers_grounded("Oxygen ranged from 12 to 34 %.", ev)
    assert not assistant._numbers_grounded("Oxygen reached 41 % in FLEX.", ev)


def test_assistant_structured_evidence_and_calculated_claims():
    a = client.post("/api/assistant", json={"question": "FLEX oxygen pressure conditions", "lang": "en"}).json()
    kinds = {e["kind"] for e in a["evidence_items"]}
    assert "measurement_summary" in kinds and "calculated_value" in kinds
    calc = [c for c in a["claims"] if c["type"] == "CALCULATED"]
    assert calc and all("CALCULATED by PyroLens" in c["text"] for c in calc)


def test_assistant_says_when_it_cannot_establish():
    a = client.post("/api/assistant", json={"question": "What is the melting point of tungsten?", "lang": "en"}).json()
    assert a["weak_evidence"] is True and "cannot establish" in a["claims"][0]["text"]


def test_assistant_gap_evidence_comes_from_engine():
    a = client.post("/api/assistant", json={"question": "Which lunar habitat conditions are missing from the experiments?", "lang": "en"}).json()
    gap = [e for e in a["evidence_items"] if e["kind"] == "gap_analysis"]
    assert gap and "NO_MATCHING_RECORDS" in gap[0]["text"]


def test_llm_numbers_are_downgraded(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")

    class R:
        def __init__(self, txt):
            self.txt = txt

        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": self.txt}}]}

    def fake_post(*a, **k):
        return R(json.dumps({"direct_answer": "x", "interpretation": "y", "claims": [
            {"type": "EVIDENCE", "text": "FLEX burned droplets at 41.7 % oxygen in microgravity droplet combustion experiments", "evidence": ["E1"]}]}))
    monkeypatch.setattr(assistant.httpx, "post", fake_post)
    out = assistant.answer("FLEX droplet combustion oxygen", "en")
    c = out["claims"][0]
    assert c["type"] == "INTERPRETATION" and c["numbers_grounded"] is False and not c["supported"]


def test_validation_reference_set():
    from validation.run_validation import run
    r = run()
    fails = [x for x in r["references"] if not x["pass"]]
    assert not fails, fails
    assert all(g["pass"] for g in r["gap_consistency"])



# ---------- regression tests for the independent QA review ----------
@pytest.mark.parametrize("claim,ev,ok", [
    ("Range was 15-99 kPa", ["15 kPa"], False), ("CO fell to -40 ppm", ["0 ppm"], False), ("2.5e3 mg/s", ["2.5 mg/s"], False),
    ("7 atm", ["nothing"], False), ("1,500 rows", ["1500 rows"], True), ("3 tests in CO2 at 21 %", ["21 % O2"], True),
    ("-0.28 cm/s", ["-0.28 cm/s"], True), ("-0.28 cm/s", ["0.28 cm/s"], False),
])
def test_numeric_grounding_edge_cases(claim, ev, ok):
    assert assistant._numbers_grounded(claim, ev) is ok


def test_llm_direct_answer_numbers_checked(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test")

    class R:
        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": json.dumps({"direct_answer": "FLEX burned at 77.7 % oxygen.", "interpretation": "ok", "claims": []})}}]}
    monkeypatch.setattr(assistant.httpx, "post", lambda *a, **k: R())
    out = assistant.answer("FLEX droplet combustion oxygen", "en")
    assert out["answer_numbers_grounded"] is False and "not found in the cited evidence" in out["direct_answer"]


def test_header_level_approximate_pressure_propagates():
    o = next(o for o in M.DATASETS["PSI-159"]["observations"] if o["p_kpa"] is not None)
    assert o["p_approximate"] is True
    po2 = next(m for m in M.measurements("PSI-159") if m["parameter"] == "oxygen_partial_pressure")
    assert po2["approximate"] and po2["extraction_confidence"] == "medium"
    po2_39 = next(m for m in M.measurements("PSI-39") if m["parameter"] == "oxygen_partial_pressure")
    assert po2_39["extraction_confidence"] == "medium"  # O2 unit inferred by composition closure


def test_diluted_fuel_is_never_exact_match():
    from app.science import materials
    for raw in ("50% C2H4", "30% butane", "50 % Propylene", "20% C2H4 with He"):
        assert materials.canonical(raw)["mixture"] is True, raw
    assert materials.canonical("44.4% H2 with CH4")["canonical"] is None  # blend: no single canonical by table order
    t = targets({"material": {"value": "Ethylene"}, "oxygen_mole_fraction": {"value": 21, "unit": "%"}})
    for o in M.all_observations():
        if o.get("material_mixture") and o.get("material") == "Ethylene":
            assert matching.compare_observation(o, t)["material"]["state"] == "PARTIAL_MATCH"


def test_stats_do_not_pool_gravity_or_initial_final():
    st = M.parameter_stats("PSI-99")
    assert "burn_length" not in st or all(not h.startswith(("1-g", "?-g")) for h in st["burn_length"]["headers"])
    assert any(k.startswith("burn_length__") for k in st)
    st25 = M.parameter_stats("PSI-25")
    assert all("final" not in h.lower() for h in st25["oxygen_mole_fraction"]["headers"])
    assert "oxygen_mole_fraction__final" in st25
    assert any(i["code"] == "large_initial_final_change" for i in M.DATASETS["PSI-25"]["issues"])


def test_duplicates_excluded_from_stats():
    st = M.parameter_stats("PSI-107")["flow_velocity"]
    non_dup = [r for r in M.DATASETS["PSI-107"]["rows"] if not r["duplicate_of"]]
    assert st["n_total"] == sum(1 for r in non_dup for m in r["measurements"] if m["parameter"] == "flow_velocity")


def test_tolerance_boundary_is_symmetric():
    for a, b in ((0.34, 0.36), (0.34, 0.32), (0.21, 0.23), (0.21, 0.19)):
        assert matching._state("oxygen_mole_fraction", matching._dist("oxygen_mole_fraction", a, b), a) == "MATCH", (a, b)


def test_envelope_note_requires_listed_value():
    # PSI-68 lists pressures 0.5; 1.0; 1.5; 2.0; 3.0 atm. 2.5 atm lies inside the span but within ±10 % of no listed value.
    t = targets({"oxygen_mole_fraction": {"value": 21, "unit": "%"}, "total_pressure": {"value": 2.5, "unit": "atm"}})
    g = coverage.analyze_combo("o2_p", "gap_o2p", ["oxygen_mole_fraction", "total_pressure"], t, "en")
    assert g["envelope_note"] is None
    t2 = targets({"oxygen_mole_fraction": {"value": 21, "unit": "%"}, "total_pressure": {"value": 2.0, "unit": "atm"}})
    assert coverage.analyze_combo("o2_p", "gap_o2p", ["oxygen_mole_fraction", "total_pressure"], t2, "en")["envelope_note"]


def test_reference_rows_keep_material():
    mats = {o["material"] for o in M.DATASETS["PSI-102"]["observations"]}
    assert {"Kapton", "Lampwick (cotton)"} <= mats


def test_day_summary_lists_never_full_match():
    r = matching.match_dataset("PSI-20", targets({"oxygen_mole_fraction": {"value": 34, "unit": "%"}, "gravity": {"value": "microgravity"}}))
    assert next(d for d in r["dimensions"] if d["dimension"] == "oxygen_mole_fraction")["state"] == "PARTIAL_MATCH"


def test_unrecognized_target_material_reason():
    r = matching.match_dataset("PSI-98", targets({"material": {"value": "Unobtainium"}, "oxygen_mole_fraction": {"value": 21.5, "unit": "%"}}))
    assert "not in PyroLens's material table" in explain.explain(r, "en")


def test_po2_inputs_are_not_ambiguous():
    for d in M.DATASETS.values():
        for r in d["rows"]:
            for m in r["measurements"]:
                if m["parameter"] == "oxygen_partial_pressure":
                    ids = {i["id"] for i in m["calculation"]["inputs"]}
                    src = [x for x in r["measurements"] if x["id"] in ids]
                    assert all(x["value_status"] in M.USABLE and x["classification"]["status"] != "ambiguous" for x in src)
                    assert m["approximate"] == any(x["approximate"] for x in src)
