"""Evidence reports and evidence-preserving exports (CSV / JSON).

Content classes are kept apart in every output:
  nasa_source_value    value copied from a published NASA PSI table cell (raw text kept)
  extracted_value      value read from text inside a cell by a documented pattern
  calculated_value     computed by PyroLens (pO2), with inputs listed
  model_derived_value  computed by the investigators with a model (stated by the column)
  scenario_assumption  user-defined or curated scenario target
  interpretation       generated explanation text (rule-based; no LLM unless stated)
"""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone

from .. import psi
from . import coverage, matching, measurements as M, passport
from .explain import explain, fmt
from .scenario import ScenarioTarget, validate
from .texts_sci import label

DATASET_LABEL = "Simulation-oriented evidence dataset (candidate input; NOT validated simulation input)"

CSV_FIELDS = ["measurement_id", "content_class", "accession", "source_file", "source_sha256", "source_row", "source_column_index", "source_column",
              "parameter", "qualifier", "role", "raw_value", "raw_unit", "value_kind", "normalized_value", "normalized_low", "normalized_high",
              "normalized_values", "normalized_unit", "value_status", "value_basis", "approximate", "conversion_method", "conversion_status",
              "extraction_method", "extraction_confidence", "classification_status", "classification_confidence", "flags", "calculation_inputs",
              "granularity", "study_type", "gravity_condition"]


def content_class(m: dict) -> str:
    if m["value_status"] == "calculated":
        return "calculated_value"
    if m["extraction_method"] == "text_pattern":
        return "extracted_value"
    if m["value_basis"] == "model_derived":
        return "model_derived_value"
    return "nasa_source_value"


def _row(m: dict) -> dict:
    s = m["source"]
    d = M.DATASETS[s["accession"]]
    calc = m.get("calculation")
    return {
        "measurement_id": m["id"], "content_class": content_class(m), "accession": s["accession"], "source_file": s["file"], "source_sha256": s["sha256"],
        "source_row": s["row"], "source_column_index": s["column_index"], "source_column": s["column"], "parameter": m["parameter"], "qualifier": m["qualifier"],
        "role": m["role"], "raw_value": m["raw_value"], "raw_unit": m["raw_unit"], "value_kind": m["value_kind"], "normalized_value": m.get("normalized_value"),
        "normalized_low": m.get("normalized_low"), "normalized_high": m.get("normalized_high"),
        "normalized_values": ";".join(str(v) for v in m["normalized_values"]) if m.get("normalized_values") else None,
        "normalized_unit": m.get("normalized_unit"), "value_status": m["value_status"], "value_basis": m["value_basis"], "approximate": m["approximate"],
        "conversion_method": (m.get("conversion") or {}).get("method"), "conversion_status": (m.get("conversion") or {}).get("status"),
        "extraction_method": m["extraction_method"], "extraction_confidence": m["extraction_confidence"],
        "classification_status": m["classification"]["status"], "classification_confidence": m["classification"]["confidence"], "flags": ";".join(m["flags"]),
        "calculation_inputs": ";".join(i["id"] for i in calc["inputs"]) if calc else None,
        "granularity": d["granularity"], "study_type": d["study_type"], "gravity_condition": d["gravity"]["condition"],
    }


def select_measurements(accessions: list[str] | None = None, parameters: list[str] | None = None, rows: set[tuple[str, int]] | None = None) -> list[dict]:
    out = []
    for acc in (accessions or list(M.DATASETS)):
        if acc not in M.DATASETS:
            continue
        for r in M.DATASETS[acc]["rows"]:
            if rows is not None and (acc, r["row"]) not in rows:
                continue
            for m in r["measurements"]:
                if parameters and m["parameter"] not in parameters:
                    continue
                out.append(m)
    return out


def to_csv(ms: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CSV_FIELDS, extrasaction="ignore")
    w.writeheader()
    for m in ms:
        w.writerow({k: ("" if v is None else v) for k, v in _row(m).items()})
    return buf.getvalue()


def to_json(ms: list[dict], extra: dict | None = None) -> dict:
    accs = sorted({m["source"]["accession"] for m in ms}, key=lambda a: int(a.split("-")[1]))
    return {
        "dataset_type": DATASET_LABEL, "generated_at": _now(), "generator": "PyroLens evidence export",
        "content_classes": __doc__.split("Content classes are kept apart in every output:")[1].strip(),
        "sources": [{"accession": a, "doi": psi.PSI[a]["doi"], "landing_url": psi.PSI[a]["landing_url"], "license": psi.PSI[a]["license"],
                     "file": M.DATASETS[a]["file"], "sha256": M.DATASETS[a]["sha256"], "granularity": M.DATASETS[a]["granularity"],
                     "study_type": M.DATASETS[a]["study_type"], "gravity": M.DATASETS[a]["gravity"],
                     "quality_warnings": [i for i in M.DATASETS[a]["issues"] if i["severity"] in ("high", "medium")][:50]} for a in accs],
        "measurements": [{**m, "content_class": content_class(m)} for m in ms], **(extra or {}),
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def scenario_evidence(t: ScenarioTarget, lang: str = "en", limit: int = 12) -> dict:
    """Validated targets + ranked matches (with explanations) + gaps + coverage counts. Shared by /api/match, report, export."""
    v = validate(t)
    if v["errors"]:
        return {"validation": v, "matches": None, "gaps": None}
    rk = matching.rank(v["targets"], limit)
    for r in rk["ranked"] + rk["insufficient"]:
        r["explanation"] = explain(r, lang)
        r["explanation_kind"] = "rule_based_interpretation"
    return {"validation": v, "matches": rk, "gaps": coverage.gaps(v["targets"], lang)}


def report(t: ScenarioTarget, lang: str = "en") -> dict:
    ev = scenario_evidence(t, lang, limit=8)
    if ev["matches"] is None:
        return {"status": "invalid_scenario", **ev}
    targets = ev["validation"]["targets"]
    top = ev["matches"]["ranked"][:8]
    accs = [r["accession"] for r in top]
    matrix = [{"dimension": d, "label": label(lang, "param", d), "target": targets.get(d, {}).get("value"),
               "states": {r["accession"]: next(x for x in r["dimensions"] if x["dimension"] == d)["state"] for r in top}} for d in matching.ALL_DIMS]
    dq = []
    for a in accs:
        q = M.DATASETS[a]["quality"]
        dq.append({"accession": a, "granularity": M.DATASETS[a]["granularity"], "rows": q["total_rows"], "valid_numeric": q["valid_numeric"],
                   "missing": q["missing"], "invalid": q["invalid"], "ambiguous": q["ambiguous"], "unresolved": q["unresolved"],
                   "unit_coverage": q["unit_conversion_coverage"]["ratio"], "provenance_coverage": q["provenance_coverage"]["ratio"],
                   "ambiguous_headers": q["ambiguous_headers"], "inferred_headers": q["inferred_headers"]})
    refs = []
    for a in accs:
        r = psi.PSI[a]
        refs.append({"accession": a, "title": r["title"], "doi": r["doi"], "landing_url": r["landing_url"], "table_file": M.DATASETS[a]["file"],
                     "table_sha256": M.DATASETS[a]["sha256"], "publications": [p for p in r["publications"] if p["doi"]][:5]})
    cmap = coverage.coverage_map(targets)
    missing = sorted({x["dimension"] for r in top for x in r["dimensions"] if x["state"] == "MISSING_IN_EXPERIMENT"})
    not_in_scenario = [d for d in matching.ALL_DIMS if d not in targets]
    out = {
        "status": "ok", "generated_at": _now(), "lang": lang,
        "scenario": {"name": t.name, "preset": t.preset, "targets": targets, "warnings": ev["validation"]["warnings"],
                     "content_class": "scenario_assumption"},
        "relevant_experiments": [{k: r[k] for k in ("rank", "accession", "acronym", "title", "band", "counts", "joint_matches", "best_observation",
                                                    "granularity", "study_type", "explanation", "explanation_kind", "dimensions", "doi", "landing_url", "kb_records")} for r in top],
        "insufficient_for_ranking": [r["accession"] for r in ev["matches"]["insufficient"]],
        "comparison_matrix": matrix,
        "coverage": {"o2_vs_p_points": cmap["o2_vs_p"]["n"], "po2_points": cmap["po2_vs_p"]["n"], "flow_vs_o2_points": cmap["flow_vs_o2"]["n"],
                     "observations_total": cmap["totals"]["observations"], "by_granularity": cmap["totals"]["by_granularity"]},
        "gaps": ev["gaps"]["gaps"], "gap_summary": ev["gaps"]["summary"], "gap_rules": ev["gaps"]["rules"],
        "missing_information": {"not_reported_by_ranked_experiments": missing, "not_defined_in_scenario": not_in_scenario},
        "data_quality": dq, "source_references": refs,
        "physical_semantics": [_semantics(a, lang) for a in accs],
        "comparability": ev["validation"].get("comparability"),
        "uncertainty": {"scenario_po2": {k: targets.get("oxygen_partial_pressure", {}).get(k) for k in ("value", "uncertainty", "uncertainty_status")},
                        "statement": "Uncertainty is propagated only from stated numeric uncertainties; otherwise 'uncertainty_not_reported'. No source table in this collection states numeric uncertainty."},
        "limitations": [
            "Rankings are navigation aids based on documented comparison tolerances; they are not probabilities of safety and do not establish equivalent combustion behaviour.",
            "Equal oxygen partial pressure does not imply equal flammability; mole fraction, total pressure, diluent and gravity act separately.",
            "Equal oxygen mole fractions with different diluents (N2, He, CO2) are different combustion environments; a missing diluent is reported as missing, never assumed.",
            "Flow velocities are compared only within the same flow configuration; co-flow burners, inlet flows and flow over solid specimens are never pooled.",
            "Dust-session, smoke-generation and material-only test-log rows are excluded from combustion coverage.",
            "All PSI flight experiments in this collection are microgravity experiments; partial-gravity conditions are not represented.",
            "Coverage describes the ingested NASA PSI tables only; absence of records is not absence of scientific knowledge.",
            "Scenario values are targets (user-defined or curated assumptions), not measurements.",
            "This report is not a certified fire-safety assessment and is not endorsed by NASA.",
        ],
        "content_classes": ["nasa_source_value", "extracted_value", "calculated_value", "model_derived_value", "scenario_assumption", "interpretation"],
        "ai_used": False,
    }
    out["markdown"] = markdown(out)
    return out


def _semantics(acc: str, lang: str) -> dict:
    pp = passport.passport(acc)
    return {"accession": acc, "observation_class": pp["observation_class"], "gas_mode": pp["gas"]["mode"], "diluents": pp["gas"]["primary_diluents"],
            "unresolved_rows": pp["gas"]["rows_with_unresolved_species"], "gas_basis": pp["gas"]["basis"],
            "flow_configurations": {k: v["n"] for k, v in pp["flow"]["configurations"].items()}, "flow_basis": pp["flow"]["basis"],
            "geometry": (pp.get("geometry") or {}).get("value"), "uncertainty": pp["uncertainty"]["by_status"]}


def markdown(r: dict) -> str:
    L = [f"# PyroLens evidence report — {r['scenario']['name']}", "", f"Generated {r['generated_at']} (UTC). Rule-based; no LLM was used.", "",
         "> Not a certified fire-safety assessment. Not endorsed by NASA. Rankings are navigation aids, not evidence of equivalent combustion behaviour.", "",
         "## 1. Scenario definition (scenario assumptions — not measurements)", "", "| Parameter | Target | Origin | Note |", "|---|---|---|---|"]
    for k, v in r["scenario"]["targets"].items():
        val = fmt(k, v["value"]) if isinstance(v.get("value"), (int, float)) else v.get("value")
        raw = f" (entered {v['raw_value']} {v['raw_unit']})" if v.get("raw_unit") else ""
        L.append(f"| {k} | {val}{raw} | {v.get('origin')} | {(v.get('note') or '').replace('|', '/')} |")
    L += ["", "## 2. Relevant experiments (ranked)", ""]
    for e in r["relevant_experiments"]:
        c = e["counts"]
        L.append(f"**{e['rank']}. {e['accession']} {e['acronym'] or ''}** — band: {e['band']}; matched {c['match']}, partial {c['partial']}, "
                 f"mismatch {c['mismatch']}, missing {c['missing']} of {c['requested']} requested; granularity: {e['granularity']}. DOI {e['doi'] or 'n/a'}")
        L.append(f"  - Interpretation (rule-based): {e['explanation']}")
    if r["insufficient_for_ranking"]:
        L.append(f"\nInsufficient data for reliable ranking: {', '.join(r['insufficient_for_ranking'])}")
    accs = [e["accession"] for e in r["relevant_experiments"]]
    L += ["", "## 3. Comparison matrix", "", "| Dimension | Target | " + " | ".join(accs) + " |", "|---|---|" + "---|" * len(accs)]
    for row in r["comparison_matrix"]:
        t = fmt(row["dimension"], row["target"]) if isinstance(row["target"], (int, float)) else (row["target"] or "—")
        L.append(f"| {row['dimension']} | {t} | " + " | ".join(row["states"][a] for a in accs) + " |")
    cv = r["coverage"]
    L += ["", "## 4. Coverage (published table rows only)", "",
          f"- Observations in collection: {cv['observations_total']} ({', '.join(f'{k}: {v}' for k, v in cv['by_granularity'].items())})",
          f"- O2 × pressure points: {cv['o2_vs_p_points']}; calculated pO2 points: {cv['po2_points']}; flow × O2 points: {cv['flow_vs_o2_points']}", "",
          "## 5. Research gaps (deterministic rules)", "", "| Id | Combination | Classification | Matches | Partial | Reporting | Records |", "|---|---|---|---|---|---|---|"]
    for g in r["gaps"]:
        L.append(f"| {g['id']} | {g['title']} | {g['classification']} | {g['supporting_records']} | {g['partial_records']} | {g['reporting_records']} | {', '.join(g['accessions']) or '—'} |")
    L += [""] + [f"- **{g['id']}** {g['explanation']}" for g in r["gaps"]]
    mi = r["missing_information"]
    L += ["", "## 6. Missing information", "", f"- Not reported by ranked experiments: {', '.join(mi['not_reported_by_ranked_experiments']) or 'none'}",
          f"- Not defined in scenario: {', '.join(mi['not_defined_in_scenario']) or 'none'}", "", "## 7. Data quality", "",
          "| Dataset | Granularity | Rows | Valid numeric | Missing | Invalid | Ambiguous | Unresolved | Unit cov. | Provenance cov. |", "|---|---|---|---|---|---|---|---|---|---|"]
    for q in r["data_quality"]:
        L.append(f"| {q['accession']} | {q['granularity']} | {q['rows']} | {q['valid_numeric']} | {q['missing']} | {q['invalid']} | {q['ambiguous']} | {q['unresolved']} | {q['unit_coverage']} | {q['provenance_coverage']} |")
    L += ["", "## 7a. Diluent, flow configuration and uncertainty of ranked experiments", "",
          "| Dataset | Observation class | Diluent mode | Diluents (rows) | Flow configurations (rows) | Geometry | Uncertainty |", "|---|---|---|---|---|---|---|"]
    for x in r.get("physical_semantics", []):
        L.append(f"| {x['accession']} | {x['observation_class']} | {x['gas_mode']} | {', '.join(f'{k}: {v}' for k, v in x['diluents'].items()) or '—'} | "
                 f"{', '.join(f'{k}: {v}' for k, v in x['flow_configurations'].items()) or '—'} | {x['geometry'] or '—'} | {', '.join(f'{k}: {v}' for k, v in x['uncertainty'].items()) or '—'} |")
    L += ["", "## 8. Source references (NASA PSI, CC0)", ""]
    for s in r["source_references"]:
        L.append(f"- {s['accession']} — {s['title']}. DOI {s['doi']}. {s['landing_url']} · table `{s['table_file']}` sha256 `{(s['table_sha256'] or '')[:16]}…`")
    L += ["", "## 9. Scientific limitations", ""] + [f"- {x}" for x in r["limitations"]]
    L += ["", "Content classes: NASA source values (table cells), extracted values (text pattern), calculated values (pO2 by PyroLens), "
          "model-derived values (stated by investigators), scenario assumptions, rule-based interpretations."]
    return "\n".join(L) + "\n"


def scenario_rows(t: ScenarioTarget) -> set[tuple[str, int]]:
    """Rows supporting or partially supporting any gap analysis + best rows of ranked experiments (for scenario exports)."""
    ev = scenario_evidence(t)
    rows: set[tuple[str, int]] = set()
    if not ev["matches"]:
        return rows
    for g in ev["gaps"]["gaps"]:
        for ref in g.get("evidence_refs", []) + g.get("partial_refs", []):
            a, r = ref.split(":r")
            rows.add((a, int(r)))
    for r in ev["matches"]["ranked"]:
        if r.get("best_observation"):
            rows.add((r["accession"], r["best_observation"]["row"]))
    return rows


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=1, default=str)
