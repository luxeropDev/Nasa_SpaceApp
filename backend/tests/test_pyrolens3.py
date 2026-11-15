"""PyroLens 3.0 regression tests: eligibility, diluent intelligence, flow-configuration semantics, multidimensional coverage,
uncertainty, passports, scenario builder, assistant scenario integration, legacy gap texts and validation framework."""
import json
import math

import pytest
from fastapi.testclient import TestClient

from app import analysis, scenarios as legacy_scenarios, scoring
from app.main import app
from app.science import coverage, matching, passport, physics, report
from app.science import measurements as M
from app.science.scenario import ScenarioTarget, preset, validate

client = TestClient(app)


def T(sc: dict) -> dict:
    v = validate(ScenarioTarget(**sc))
    assert not v["errors"], v["errors"]
    return v["targets"]


def obs(acc, row):
    return next(o for o in M.DATASETS[acc]["observations"] if o["row"] == row)


# ---------------------------------------------------------------- eligibility / gravity contamination (audit finding 4)
def test_dust_sessions_and_test_logs_never_count_as_combustion_coverage():
    elig, excluded = coverage.eligible_observations()
    accs = {o["accession"] for o in elig}
    assert "PSI-47" not in accs, "PSI-47 dust sessions must not count as combustion"
    assert "PSI-26" not in accs, "PSI-26 material-only test log rows must not count as condition coverage"
    assert not ({"PSI-101", "PSI-102"} & accs), "smoke-generation rows are not flame observations"
    assert excluded["non_combustion"] == len(M.DATASETS["PSI-47"]["observations"])
    assert excluded["no_condition_values"] >= len(M.DATASETS["PSI-26"]["observations"])


def test_gravity_gap_counts_only_eligible_observations():
    g = next(x for x in coverage.gaps(T({"gravity": {"value": "microgravity"}}))["gaps"] if x["key"] == "gravity")
    assert g["classification"] == "OBSERVED"
    assert "PSI-47" not in g["accessions"] and "PSI-26" not in g["accessions"]
    assert g["excluded"]["non_combustion"] > 0 and g["excluded"]["no_condition_values"] > 0
    all_obs = len(M.all_observations())
    assert g["supporting_records"] < all_obs  # previously every observation (incl. dust sessions) counted


def test_coverage_map_gravity_reports_exclusions():
    cm = coverage.coverage_map()
    assert cm["gravity"]["eligible_only"] is True
    reasons = {e["reason"] for e in cm["gravity"]["excluded"]}
    assert {"non_combustion", "no_condition_values"} <= reasons


# ------------------------------------------------------------------------------------- diluent intelligence (finding 2)
def test_diluent_is_extracted_with_provenance_and_status():
    o = obs("PSI-39", 1)
    g = o["gas"]
    assert g["status"] == "numeric_composition" and g["primary_diluent"] == "N2" and not g["mixture"]
    n2 = next(c for c in g["components"] if c["gas"] == "N2")
    assert n2["raw"] == "0.79" and n2["ref"].startswith("PSI-39:r1:c") and n2["unit_inferred"]
    assert abs(g["closure"] - 1.0) < 1e-6


def test_missing_diluent_is_never_assumed():
    for acc in ("PSI-10", "PSI-159"):
        for o in M.DATASETS[acc]["observations"]:
            assert o["gas"]["status"] == "missing" and o["diluent"] is None
    st, _, why = physics.compare_diluent({"value": "N2"}, obs("PSI-10", 1)["gas"])
    assert st == "MISSING_IN_EXPERIMENT" and why == "diluent_not_reported"


def test_unresolved_co_column_makes_composition_ambiguous_not_nitrogen():
    rows = [o for o in M.DATASETS["PSI-69"]["observations"] if o["gas"]["unresolved_species"]]
    assert rows
    for o in rows:
        assert o["gas"]["status"] == "ambiguous" and o["diluent"] is None
    st, _, _ = physics.compare_diluent({"value": "N2"}, rows[0]["gas"])
    assert st == "MISMATCH"  # contains a non-N2 species whichever it is
    st, _, _ = physics.compare_diluent({"value": "CO2"}, rows[0]["gas"])
    assert st == "NOT_COMPARABLE"  # could be the target, could be CO


def test_autofill_diluent_text_is_not_interpreted():
    assert obs("PSI-23", 1)["gas"]["primary_diluent"] == "N2"
    o = obs("PSI-23", 2)  # '~21% O2 with N3'
    assert o["gas"]["status"] == "ambiguous" and o["diluent"] is None


def test_equal_oxygen_with_different_diluents_is_not_equivalent():
    he_rows = [o for o in M.DATASETS["PSI-39"]["observations"] if any(c["gas"] == "He" for c in o["gas"]["components"])]
    assert he_rows
    t = T({"oxygen_mole_fraction": {"value": 21, "unit": "%"}, "diluent": {"value": "N2"}})
    c = matching.compare_observation(he_rows[0], t)
    assert c["oxygen_mole_fraction"]["state"] == "MATCH"
    assert c["diluent"]["state"] in ("PARTIAL_MATCH", "MISMATCH")


def test_diluent_changes_gap_analysis():
    base = {"oxygen_mole_fraction": {"value": 21, "unit": "%"}, "total_pressure": {"value": 1, "unit": "atm"}}
    a = {g["key"]: g for g in coverage.gaps(T(base))["gaps"]}["o2_p"]
    b = {g["key"]: g for g in coverage.gaps(T({**base, "diluent": {"value": "He"}}))["gaps"]}["o2_p"]
    assert a["supporting_records"] > b["supporting_records"]
    assert b["incompatible"].get("diluent_mismatch", 0) > 0
    assert "diluent" in b["context_parameters"]


def test_air_source_term_is_partial_against_nitrogen():
    st, val, why = physics.compare_diluent({"value": "N2"}, obs("PSI-98", 1)["gas"])
    assert (st, val) == ("PARTIAL_MATCH", "air") and "not_tabulated" in why


def test_scenario_gas_composition_matching():
    t = T({"oxygen_mole_fraction": {"value": 21, "unit": "%"}, "gas_composition": {"N2": 0.5, "He": 0.29}})
    assert t["diluent"]["value"] == "N2" and t["diluent"]["composition"] == {"N2": 0.5, "He": 0.29}
    mix = next(o for o in M.DATASETS["PSI-39"]["observations"] if any(c["gas"] == "He" and abs(c["fraction"] - 0.29) < 1e-6 for c in o["gas"]["components"]))
    assert matching.compare_observation(mix, t)["diluent"]["state"] == "MATCH"
    pure = obs("PSI-39", 1)
    assert matching.compare_observation(pure, t)["diluent"]["state"] == "MISMATCH"


# ------------------------------------------------------------------------------ flow configuration semantics (finding 3)
def test_flow_configurations_per_dataset():
    assert obs("PSI-98", 1)["flow_configuration"] == "concurrent_flow_over_solid"
    assert obs("PSI-98", 2)["flow_configuration"] == "opposed_flow_over_solid"
    assert obs("PSI-107", 1)["flow_configuration"] == "coflow_jet_burner"
    assert obs("PSI-101", 1)["flow_configuration"] == "inlet_flow"
    assert obs("PSI-68", 1)["flow_configuration"] == "other_source_defined"
    f = obs("PSI-98", 1)["flow"]
    assert f["source_term"] and f["basis"] and f["configuration_ref"] == "PSI-98:r1:c10"


def test_psi107_negative_flow_is_kept_flagged_and_never_compared():
    neg = [m for r in M.DATASETS["PSI-107"]["rows"] for m in r["measurements"] if m["parameter"] == "flow_velocity" and "negative_flow_value" in m["flags"]]
    assert neg and all(m["normalized_value"] < 0 for m in neg)
    rows = {m["source"]["row"] for m in neg}
    for o in M.DATASETS["PSI-107"]["observations"]:
        if o["row"] in rows:
            assert o["flow_cm_s"] is None and not o["combustion_eligible"]


def test_incompatible_flow_configurations_are_not_compared():
    t = T({"flow_configuration": {"value": "concurrent_flow_over_solid"}, "flow_velocity": {"value": 36.39, "unit": "cm/s"}})
    c = matching.compare_observation(obs("PSI-107", 1), t)
    assert c["flow_velocity"]["state"] == "NOT_COMPARABLE" and c["flow_velocity"]["reason"] == "incompatible_flow_configuration"
    assert c["flow_velocity"]["numeric_state"] == "MATCH"  # numerically identical, physically incompatible
    assert c["flow_configuration"]["state"] == "MISMATCH"
    r = matching.match_dataset("PSI-107", t)
    d = next(x for x in r["dimensions"] if x["dimension"] == "flow_velocity")
    assert d["state"] == "NOT_COMPARABLE" and d["reason"] == "incompatible_flow_configuration"


def test_velocity_without_configuration_is_capped_at_partial():
    v = validate(ScenarioTarget(flow_velocity={"value": 20, "unit": "cm/s"}))
    assert "flow_velocity_without_configuration" in [w["code"] for w in v["warnings"]]
    c = matching.compare_observation(obs("PSI-99", 1), v["targets"])
    assert c["flow_velocity"]["state"] == "PARTIAL_MATCH" and c["flow_velocity"]["numeric_state"] == "MATCH"


def test_flow_gap_excludes_incompatible_configurations():
    t = T({"flow_configuration": {"value": "concurrent_flow_over_solid"}, "flow_velocity": {"value": 20, "unit": "cm/s"}, "gravity": {"value": "microgravity"}})
    g = {x["key"]: x for x in coverage.gaps(t)["gaps"]}["flow_gravity"]
    assert not ({"PSI-107", "PSI-101", "PSI-102"} & set(g["accessions"]))
    assert g["incompatible"]["incompatible_flow_configuration"] > 0
    assert set(g["accessions"]) <= {"PSI-98", "PSI-99", "PSI-100"}


def test_legacy_flow_direction_maps_to_configuration():
    t = T({"flow_direction": {"value": "opposed"}})
    assert "flow_direction" not in t and t["flow_configuration"]["value"] == "opposed_flow_over_solid"


# ------------------------------------------------------------------------- multidimensional coverage explorer (finding 1)
@pytest.mark.parametrize("x,y", coverage.PAIRS)
def test_explorer_pairs_are_real_rows(x, y):
    r = coverage.explore(x, y)
    grids = r["layers"].values() if r["layered_by"] else [r["grid"]]
    for gr in grids:
        for c in gr["cells"]:
            assert c["state"] in ("observed", "partial", "insufficient")
            if c["n"]:
                for ref in c["evidence_refs"][:3]:
                    acc, row = ref.split(":r")
                    o = obs(acc, int(row))
                    assert o["combustion_eligible"]
            else:
                assert c["state"] == "insufficient"


def test_explorer_never_pools_flow_velocity_across_configurations():
    r = coverage.explore("flow_velocity", "gravity")
    assert r["layered_by"] == "flow_configuration"
    for cfg, layer in r["layers"].items():
        for c in layer["cells"]:
            for ref in c["evidence_refs"]:
                acc, row = ref.split(":r")
                assert obs(acc, int(row))["flow_configuration"] == cfg


def test_explorer_filters_and_missing_indicators():
    r = coverage.explore("oxygen_mole_fraction", "total_pressure", {"accession": ["PSI-69"]})
    accs = {a for c in r["grid"]["cells"] for a in c["accessions"]}
    assert accs == {"PSI-69"}
    full = coverage.explore("diluent", "oxygen_mole_fraction")
    assert full["grid"]["missing"]["y_only_total"] > 0  # O2 rows without a stated diluent are counted, not hidden
    with pytest.raises(ValueError):
        coverage.explore("oxygen_mole_fraction", "oxygen_mole_fraction")


def test_observed_cell_rule_matches_gap_thresholds():
    r = coverage.explore("oxygen_mole_fraction", "total_pressure")
    for c in r["grid"]["cells"]:
        if c["state"] == "observed":
            assert c["n"] >= coverage.COVERAGE_RULES["observed_min_matches"] and len(c["accessions"]) >= 2


# ------------------------------------------------------------------------------------------------ uncertainty (finding 5)
def test_every_measurement_has_an_uncertainty_record_and_none_is_invented():
    for d in M.DATASETS.values():
        for r in d["rows"]:
            for m in r["measurements"]:
                if m["value_status"] == "calculated":
                    assert m["uncertainty"]["status"] == physics.UNCERTAINTY_NOT_REPORTED and m["uncertainty"]["value"] is None
                    continue
                assert m["uncertainty"]["status"] == physics.UNCERTAINTY_NOT_REPORTED
                assert m["uncertainty"]["value"] is None


def test_range_cells_carry_reported_bounds_not_uncertainty():
    m = next(m for m in M.measurements("PSI-98") if m["parameter"] == "oxygen_mole_fraction" and m["value_kind"] == "range")
    u = m["uncertainty"]
    assert u["lower"] == pytest.approx(0.215) and u["upper"] == pytest.approx(0.217) and u["value"] is None


def test_po2_propagation_only_with_both_uncertainties():
    p = physics.propagate_product(0.21, 0.005, 101.3, 1.0)
    q = 0.21 * 101.3
    assert p["status"] == "propagated" and p["value"] == pytest.approx(q * math.sqrt((0.005 / 0.21) ** 2 + (1 / 101.3) ** 2), rel=1e-9)
    for ux, up in ((None, 1.0), (0.005, None), (None, None)):
        r = physics.propagate_product(0.21, ux, 101.3, up)
        assert r["status"] == "uncertainty_not_reported" and r["value"] is None


def test_po2_propagation_with_source_stated_uncertainty():
    ox = {"normalized_value": 0.30, "value_basis": "measured", "role": "condition", "value_kind": "number"}
    u = physics.measurement_uncertainty(ox, {"uncertainty": {"type": "absolute", "value": 0.003, "source": "synthetic"}})
    assert u["status"] == "reported" and u["value"] == pytest.approx(0.003) and u["measurement_type"] == "measured"
    r = physics.propagate_product(0.30, u["value"], 50.0, 0.5)
    assert r["status"] == "propagated" and r["relative"] == pytest.approx(math.sqrt(0.01 ** 2 + 0.01 ** 2))


def test_scenario_po2_uncertainty():
    v = validate(ScenarioTarget(oxygen_mole_fraction={"value": 21, "unit": "%", "uncertainty": 0.5}, total_pressure={"value": 101.3, "unit": "kPa", "uncertainty": 1}))
    po = v["targets"]["oxygen_partial_pressure"]
    assert po["uncertainty_status"] == "propagated" and po["uncertainty"] == pytest.approx(0.5483, rel=1e-3)
    v2 = validate(ScenarioTarget(oxygen_mole_fraction={"value": 21, "unit": "%"}, total_pressure={"value": 101.3, "unit": "kPa"}))
    assert v2["targets"]["oxygen_partial_pressure"]["uncertainty_status"] == "uncertainty_not_reported"
    assert v2["targets"]["oxygen_partial_pressure"]["uncertainty"] is None


# ------------------------------------------------------------------------------------------------------------- passports
def test_passports_expose_traceable_physical_sections():
    for acc in M.DATASETS:
        p = passport.passport(acc)
        for k in ("gas", "flow", "geometry", "uncertainty", "ignition", "observation_class", "evidence_classes", "source_references"):
            assert k in p, (acc, k)
        assert p["gas"]["mode"] in physics.GAS_MODES
        assert set(p["evidence_classes"]) <= {"measured", "reported", "derived", "estimated", "assumed", "ambiguous", "missing"}
        assert "uncertainty_not_reported" in p["limitations"]
    p = passport.passport("PSI-69")
    assert p["gas"]["rows_with_unresolved_species"] > 0 and "diluent:unresolved_species" in p["limitations"]
    assert passport.passport("PSI-47")["observation_class"] == "non_combustion"
    assert passport.passport("PSI-107")["flow"]["negative_velocity_rows"] > 0


# ---------------------------------------------------------------------------------------------------- scenario builder
@pytest.mark.parametrize("sc,code", [
    ({"oxygen_mole_fraction": {"value": 21, "unit": "%"}, "gas_composition": {"N2": 0.9}}, "composition_exceeds_unity"),
    ({"flow_configuration": {"value": "quiescent"}, "flow_velocity": {"value": 5, "unit": "cm/s"}}, "quiescent_with_flow_velocity"),
    ({"diluent": {"value": "unobtainium"}}, "unknown_diluent"),
    ({"flow_configuration": {"value": "warp"}}, "unknown_flow_configuration"),
    ({"specimen_geometry": {"value": "torus"}}, "unknown_specimen_geometry"),
    ({"flow_configuration": {"value": "opposed_flow_over_solid"}, "flow_direction": {"value": "concurrent"}}, "conflicting_flow_direction"),
])
def test_inconsistent_scenarios_are_rejected(sc, code):
    assert code in [e["code"] for e in validate(ScenarioTarget(**sc))["errors"]]


def test_unknown_values_stay_unknown_and_comparability_is_reported():
    v = validate(ScenarioTarget(oxygen_mole_fraction={"value": 30, "unit": "%"}))
    assert set(v["targets"]) == {"oxygen_mole_fraction"}
    assert v["comparability"]["diluent"]["defined"] is False and v["comparability"]["gravity"]["collection_support"]
    assert "diluent_not_specified" in [w["code"] for w in v["warnings"]]


def test_ignition_dimensions_match_saffire_rows():
    t = T({"ignition_power": {"value": 80, "unit": "W"}, "ignition_duration": {"value": 9.2, "unit": "s"}})
    c = matching.compare_observation(obs("PSI-99", 1), t)
    assert c["ignition_power"]["state"] == "MATCH" and c["ignition_duration"]["state"] == "MATCH"


# ------------------------------------------------------------------------------------------- gap engine / legacy texts
def test_gap_results_explain_insufficiency():
    lunar = preset("lunar_habitat")["scenario"]
    gs = coverage.gaps(T(lunar))["gaps"]
    for g in gs:
        if g["classification"] in ("NO_MATCHING_RECORDS", "INSUFFICIENT_METADATA", "SPARSE_COVERAGE", "LIMITED_COVERAGE", "NOT_ASSESSABLE"):
            assert g["insufficiency_reasons"], g["key"]
        assert "never been studied" not in g["explanation"].lower()


def test_legacy_gap_texts_are_computed_not_static():
    g = analysis.gaps("en")
    assert {x["code"] for x in g} >= {"partial_gravity", "diluent", "flow", "uncertainty", "eligibility"}
    assert any(ch.isdigit() for ch in g[1]["detail"])  # counts come from data
    sg = legacy_scenarios.scenario_gaps("lunar_habitat", "en")
    assert sg and all(":" in s for s in sg)
    ru = analysis.gaps("ru")
    assert ru[0]["title"] != g[0]["title"]
    r = scoring.analyze("lunar_habitat", "material_flammability", "en")
    assert any("No sufficient matching experimental records" in s or "Observed" in s for s in r["knowledge_gaps"])


# ------------------------------------------------------------------------------------- assistant + user scenario (6)
LUNAR_USER = {"name": "My lunar module", "oxygen_mole_fraction": {"value": 34, "unit": "%"}, "total_pressure": {"value": 56.5, "unit": "kPa"},
              "diluent": {"value": "N2"}, "gravity": {"value": "lunar"}, "flow_configuration": {"value": "concurrent_flow_over_solid"},
              "flow_velocity": {"value": 15, "unit": "cm/s"}, "material": {"value": "SIBAL"}}


@pytest.mark.parametrize("lang", ["en", "ru"])
def test_assistant_accepts_user_scenario(lang):
    r = client.post("/api/assistant", json={"question": "Which experiments are comparable to my scenario and where are the gaps?", "lang": lang, "scenario": LUNAR_USER})
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["scenario"]["name"] == "My lunar module" and not a["scenario"]["validation"]["errors"]
    kinds = {e["kind"] for e in a["evidence_items"]}
    assert {"scenario_definition", "gap_analysis", "passport_summary", "calculated_value"} <= kinds
    calc = [e for e in a["evidence_items"] if e["kind"] == "calculated_value" and "pO2" in e["title"]]
    assert calc and "19.21" in calc[0]["text"]  # 0.34 × 56.5 = 19.21 kPa, computed by the deterministic layer
    assert all(e["verification"] in ("user_scenario", "calculated_by_pyrolens", "deterministic_gap_analysis", "deterministic_condition_matching",
                                     "computed_from_psi_table", "curated_summary", "verbatim_psi_metadata", "verbatim_extracted_text", "scenario_validation")
               for e in a["evidence_items"])
    if not a["llm_used"]:
        assert any(c.get("structured") for c in a["claims"])


def test_assistant_rejects_invalid_scenario_shape():
    r = client.post("/api/assistant", json={"question": "Compare my scenario", "scenario": {"oxygen_mole_fraction": {"value": "abc", "unit": "%"}}})
    assert r.status_code == 422


def test_assistant_reports_invalid_scenario_values_without_analysis():
    r = client.post("/api/assistant", json={"question": "Compare my scenario", "scenario": {"name": "bad", "oxygen_mole_fraction": {"value": 150, "unit": "%"}}})
    assert r.status_code == 200
    a = r.json()
    assert a["scenario"]["validation"]["errors"]
    assert "gap_analysis" not in {e["kind"] for e in a["evidence_items"] if e.get("title") == "bad"}


# ---------------------------------------------------------------------------------------------------------- API surface
def test_new_endpoints():
    at = client.get("/api/atlas").json()
    assert at["geography"]["available"] is False and len(at["investigations"]) == len(M.DATASETS)
    assert at["totals"]["eligible"] == len(coverage.eligible_observations()[0])
    p = client.get("/api/coverage/pairs").json()
    assert len(p["pairs"]) == len(coverage.PAIRS)
    e = client.get("/api/coverage/explore", params={"x": "flow_velocity", "y": "oxygen_mole_fraction"}).json()
    assert e["layered_by"] == "flow_configuration"
    assert client.get("/api/coverage/explore", params={"x": "nope", "y": "gravity"}).status_code == 422
    ob = client.get("/api/coverage/observations").json()
    assert ob["n"] == len(ob["rows"]) and ob["eligible"] < ob["n"]
    m = client.post("/api/match", json={"scenario": LUNAR_USER}).json()
    assert any(d["dimension"] == "diluent" for d in m["ranked"][0]["dimensions"])


def test_lunar_habitat_end_to_end_report():
    r = client.post("/api/evidence/report", json={"scenario": {**preset("lunar_habitat")["scenario"], "name": "Lunar habitat"}, "lang": "en"})
    assert r.status_code == 200
    d = r.json()
    assert d["physical_semantics"] and d["scenario"]["targets"]["diluent"]["value"] == "N2"
    assert "## 7a." in d["markdown"] and "PyroLens evidence report" in d["markdown"]
    g = {x["key"]: x for x in d["gaps"]}
    assert g["gravity"]["classification"] == "NO_MATCHING_RECORDS"
    assert g["flowcfg_material"]["classification"] in ("OBSERVED", "LIMITED_COVERAGE", "SPARSE_COVERAGE")
    ru = client.post("/api/evidence/report", json={"scenario": {**preset("lunar_habitat")["scenario"], "name": "Лунный модуль"}, "lang": "ru"}).json()
    assert ru["status"] == "ok"


# ------------------------------------------------------------------------------------------------- validation framework
def test_validation_framework_passes_and_reports_pending_review():
    from validation import run_validation as V
    out = V.run()
    assert out["reviewer_status"] == "PENDING INDEPENDENT DOMAIN-EXPERT REVIEW"
    assert out["verified_against"]["original_publications"] is False
    for k, v in out["metrics"].items():
        assert v["pass"] == v["total"] and v["total"] > 0, k
    md = V.markdown(out)
    assert "PENDING INDEPENDENT DOMAIN-EXPERT REVIEW" in md and "not independent scientific validation" in md
