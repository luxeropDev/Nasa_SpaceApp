"""Validate the measurement layer against the manually verified reference set and run consistency checks.

Usage (from backend/):  python -m validation.run_validation          # prints summary, writes ../docs/VALIDATION_REPORT.md
Metrics are computed, never asserted: a failing reference is reported as a failure.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from app.science import coverage, matching, measurements as M
from app.science.scenario import ScenarioTarget, validate

HERE = Path(__file__).resolve().parent
REF = json.loads((HERE / "reference_set.json").read_text(encoding="utf-8"))


def _find(ref: dict) -> list[dict]:
    row = next((r for r in M.DATASETS[ref["accession"]]["rows"] if r["row"] == ref["row"]), None)
    if not row:
        return []
    return row["measurements"]


def check(ref: dict) -> dict:
    ms = _find(ref)
    exp = ref["expected"]
    if "absent_parameter" in exp:
        ok = not any(m["parameter"] == exp["absent_parameter"] for m in ms)
        return {"id": ref["id"], "pass": ok, "detail": "absent as expected" if ok else "unexpectedly present"}
    cand = [m for m in ms if m["parameter"] == exp["parameter"] and (ref["column"] in ("pO2",) or m["header"] == ref["column"] or exp.get("extraction_method") == "text_pattern")]
    if exp.get("extraction_method"):
        cand = [m for m in cand if m["extraction_method"] == exp["extraction_method"]]
    if not cand:
        return {"id": ref["id"], "pass": False, "detail": "measurement not found"}
    m = cand[0]
    fails = []
    if ref["raw_expected"] not in ("(calculated)", "(none)") and m["extraction_method"] == "csv_cell" and m["raw_value"].strip() != ref["raw_expected"].strip():
        fails.append(f"raw {m['raw_value']!r} != {ref['raw_expected']!r}")
    for k, v in exp.items():
        if k in ("parameter", "extraction_method", "flags_include"):
            continue
        got = m.get(k) if k != "classification_status" else m["classification"]["status"]
        if isinstance(v, float) and isinstance(got, (int, float)):
            if not math.isclose(got, v, rel_tol=2e-4, abs_tol=1e-9):
                fails.append(f"{k} {got} != {v}")
        elif isinstance(v, list):
            if not got or any(not math.isclose(a, b, rel_tol=1e-6) for a, b in zip(got, v)) or len(got) != len(v):
                fails.append(f"{k} {got} != {v}")
        elif got != v:
            fails.append(f"{k} {got!r} != {v!r}")
    if exp.get("flags_include") and exp["flags_include"] not in m["flags"]:
        fails.append(f"flag {exp['flags_include']} missing")
    if m["value_status"] != "calculated" and not all(m["source"].get(k) is not None for k in ("file", "row", "column")):
        fails.append("provenance incomplete")
    return {"id": ref["id"], "pass": not fails, "detail": "; ".join(fails) or "ok"}


KNOWN_MATCH = [
    ("air at 1 atm is OBSERVED", {"oxygen_mole_fraction": {"value": 21, "unit": "%"}, "total_pressure": {"value": 1, "unit": "atm"}}, "o2_p", "OBSERVED"),
    ("lunar gravity has no records", {"gravity": {"value": "lunar"}}, "gravity", "NO_MATCHING_RECORDS"),
    ("microgravity is OBSERVED", {"gravity": {"value": "microgravity"}}, "gravity", "OBSERVED"),
    ("O2 x P undefined -> NOT_ASSESSABLE", {"flow_velocity": {"value": 20, "unit": "cm/s"}}, "o2_p", "NOT_ASSESSABLE"),
]
KNOWN_RANK = [
    ("FLEX-like target ranks PSI-69 first or second", {"oxygen_mole_fraction": {"value": 0.15, "unit": "fraction"}, "total_pressure": {"value": 760, "unit": "mmHg"},
                                                        "gravity": {"value": "microgravity"}, "material": {"value": "Methanol"}}, "PSI-69", 2),
    ("SAFFIRE-like target ranks a SAFFIRE table in top 3", {"oxygen_mole_fraction": {"value": 21.5, "unit": "%"}, "flow_velocity": {"value": 20, "unit": "cm/s"},
                                                             "material": {"value": "SIBAL"}, "gravity": {"value": "microgravity"}}, "PSI-98|PSI-99|PSI-100", 3),
]


def _get(o: dict, path: str):
    for k in path.split("."):
        o = (o or {}).get(k)
    return o


def _obs(acc: str, row: int | None):
    return next((o for o in M.DATASETS[acc]["observations"] if o["row"] == row), None)


def semantic(case: dict) -> dict:
    acc = case["accession"]
    exp = case["expected"]
    fails = []
    if case.get("row") is None and "row_where" not in case:
        d = M.DATASETS[acc]
        got = {"observations": len(d["observations"]), "observation_class": d.get("observation_class"), "related_unlinked": acc in M.RELATED_UNLINKED}
        fails = [f"{k} {got[k]!r} != {v!r}" for k, v in exp.items() if got.get(k) != v]
    elif "row_where" in case:
        w = case["row_where"]
        rows = [o for o in M.DATASETS[acc]["observations"] if o["row_type"] != "duplicate"]
        if "helium_min" in w:
            rows = [o for o in rows if any(c["gas"] == "He" and c["fraction"] >= w["helium_min"] for c in (o.get("gas") or {}).get("components", []))]
        if "unresolved_min" in w:
            rows = [o for o in rows if sum(u["fraction"] for u in (o.get("gas") or {}).get("unresolved_species", [])) >= w["unresolved_min"]]
        if not rows:
            fails.append("no rows satisfy the selector")
        for o in rows:
            for k, v in exp.items():
                if _get(o, k) != v:
                    fails.append(f"row {o['row']}: {k} {_get(o, k)!r} != {v!r}")
                    break
    else:
        o = _obs(acc, case["row"])
        if not o:
            fails.append("observation not found")
        else:
            for k, v in exp.items():
                got = _get(o, k)
                if isinstance(v, float) and isinstance(got, (int, float)):
                    ok = math.isclose(got, v, rel_tol=1e-6)
                else:
                    ok = got == v
                if not ok:
                    fails.append(f"{k} {got!r} != {v!r}")
    return {"id": case["id"], "category": case["category"], "pass": not fails, "detail": "; ".join(fails[:3]) or "ok", "reviewer_status": REF.get("reviewer_status")}


def matching_case(case: dict) -> dict:
    t = validate(ScenarioTarget(**case["scenario"]))["targets"]
    r = matching.match_dataset(case["accession"], t)
    st = next(x["state"] for x in r["dimensions"] if x["dimension"] == case["dimension"])
    return {"id": case["id"], "category": case["category"], "pass": st in case["expected_state_in"], "detail": f"{case['accession']} {case['dimension']} = {st}"}


def coverage_case(case: dict) -> dict:
    t = validate(ScenarioTarget(**case["scenario"]))["targets"]
    a = coverage.gaps(t)
    b = coverage.gaps(t)
    g = next(x for x in a["gaps"] if x["key"] == case["key"])
    fails = []
    if a != b:
        fails.append("not repeatable")
    if case.get("expected") and g["classification"] != case["expected"]:
        fails.append(f"classification {g['classification']} != {case['expected']}")
    if case.get("expected_in") and g["classification"] not in case["expected_in"]:
        fails.append(f"classification {g['classification']} not in {case['expected_in']}")
    for acc in case.get("must_not_count_accessions", []):
        if acc in g["accessions"]:
            fails.append(f"{acc} counted")
    for code in case.get("excluded_must_include", []):
        if not g["excluded"].get(code):
            fails.append(f"exclusion {code} not reported")
    if case.get("incompatible_must_include") and not g["incompatible"].get(case["incompatible_must_include"]):
        fails.append(f"incompatibility {case['incompatible_must_include']} not reported")
    return {"id": case["id"], "category": "coverage", "pass": not fails, "detail": "; ".join(fails) or f"{g['classification']} ({g['supporting_records']} matches)"}


def adversarial(case: dict) -> dict:
    v = validate(ScenarioTarget(**case["scenario"]))
    fails = []
    if case.get("expect_error") and case["expect_error"] not in [e["code"] for e in v["errors"]]:
        fails.append(f"error {case['expect_error']} not raised ({[e['code'] for e in v['errors']]})")
    if case.get("expect_warning") and case["expect_warning"] not in [w["code"] for w in v["warnings"]]:
        fails.append(f"warning {case['expect_warning']} not raised")
    po = v["targets"].get("oxygen_partial_pressure") or {}
    if case.get("expect_po2_uncertainty_status") and po.get("uncertainty_status") != case["expect_po2_uncertainty_status"]:
        fails.append(f"pO2 uncertainty status {po.get('uncertainty_status')} != {case['expect_po2_uncertainty_status']}")
    if case.get("expect_po2_uncertainty") is not None and not math.isclose(po.get("uncertainty") or -1, case["expect_po2_uncertainty"], rel_tol=1e-3):
        fails.append(f"pO2 uncertainty {po.get('uncertainty')} != {case['expect_po2_uncertainty']}")
    return {"id": case["id"], "category": "adversarial", "pass": not fails, "detail": "; ".join(fails) or "ok"}


def run() -> dict:
    res = [check(r) | {"category": r["category"]} for r in REF["references"]]
    by = defaultdict(lambda: [0, 0])
    for r in res:
        by[r["category"]][1] += 1
        by[r["category"]][0] += r["pass"]
    gaps = []
    for name, sc, key, exp in KNOWN_MATCH:
        t = validate(ScenarioTarget(**sc))["targets"]
        a = next(g for g in coverage.gaps(t)["gaps"] if g["key"] == key)
        b = next(g for g in coverage.gaps(t)["gaps"] if g["key"] == key)
        gaps.append({"case": name, "expected": exp, "got": a["classification"], "pass": a["classification"] == exp and a == b})
    ranks = []
    for name, sc, accs, k in KNOWN_RANK:
        t = validate(ScenarioTarget(**sc))["targets"]
        top = [r["accession"] for r in matching.rank(t, k)["ranked"][:k]]
        ranks.append({"case": name, "expected_in_top": accs, "top": top, "pass": any(a in top for a in accs.split("|"))})
    sem = [semantic(c) for c in REF.get("semantic_cases", [])]
    mcs = [matching_case(c) for c in REF.get("matching_cases", [])]
    ccs = [coverage_case(c) for c in REF.get("coverage_cases", [])]
    adv = [adversarial(c) for c in REF.get("adversarial_cases", [])]

    def rate(xs):
        return {"pass": sum(1 for x in xs if x["pass"]), "total": len(xs)}
    metrics = {
        "extraction_accuracy": rate([x for x in res if x["category"] in ("extraction", "missing")]),
        "unit_normalization_accuracy": rate([x for x in res if x["category"] in ("unit", "calculation")]),
        "gas_classification_accuracy": rate([x for x in res if x["category"] == "species"] + [x for x in sem if x["category"] == "diluent"]),
        "flow_semantics_accuracy": rate([x for x in sem if x["category"] == "flow"]),
        "eligibility_and_linkage": rate([x for x in sem if x["category"] in ("eligibility", "linkage")]),
        "matching_correctness": rate(mcs + ranks),
        "coverage_correctness": rate(ccs),
        "gap_classification_correctness": rate(gaps),
        "adversarial_negative": rate(adv),
    }
    total_ms = sum(d["quality"]["provenance_coverage"]["measurements"] or 0 for d in M.DATASETS.values())
    with_prov = sum(d["quality"]["provenance_coverage"]["with_cell_reference"] or 0 for d in M.DATASETS.values())
    return {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "references": res,
            "by_category": {k: {"pass": v[0], "total": v[1]} for k, v in by.items()},
            "overall": {"pass": sum(r["pass"] for r in res), "total": len(res)},
            "provenance_coverage": {"measurements": total_ms, "with_cell_reference": with_prov},
            "gap_consistency": gaps, "matching_known_answers": ranks, "known_issues_for_expert_review": REF["known_issues_for_expert_review"],
            "semantic": sem, "matching_cases": mcs, "coverage_cases": ccs, "adversarial": adv, "metrics": metrics,
            "reviewer_status": REF.get("reviewer_status"), "verified_against": REF.get("verified_against"), "scope_note": REF["_about"]}


def markdown(r: dict) -> str:
    L = ["# PyroLens validation report", "", f"Generated {r['generated_at']} by `python -m validation.run_validation` (backend/).", "",
         f"**Independent validation status: {r['reviewer_status']}.** No external combustion specialist has reviewed this reference set; "
         "the cases were prepared by the PyroLens developers (AI-assisted). Passing them shows internal consistency with the expected interpretations, "
         "not independent scientific validation.", "",
         f"Verified against: {', '.join(k for k, v in (r.get('verified_against') or {}).items() if v)}; NOT verified against: "
         f"{', '.join(k for k, v in (r.get('verified_against') or {}).items() if not v)}.", "",
         f"> {r['scope_note']}", "", "## Metrics", "", "| Metric | Pass | Total |", "|---|---|---|"]
    L += [f"| {k.replace('_', ' ')} | {v['pass']} | {v['total']} |" for k, v in r["metrics"].items()]
    L += ["", "## Reference-set results (cell level)", "", "| Category | Pass | Total |", "|---|---|---|"]
    names = {"extraction": "Extraction accuracy", "unit": "Unit conversion accuracy", "species": "O2/CO2/CO classification", "missing": "Missing/invalid classification"}
    for k, v in r["by_category"].items():
        L.append(f"| {names.get(k, k)} | {v['pass']} | {v['total']} |")
    o = r["overall"]
    L += [f"| **Overall** | **{o['pass']}** | **{o['total']}** |", "", "| Id | Result | Detail |", "|---|---|---|"]
    L += [f"| {x['id']} | {'pass' if x['pass'] else 'FAIL'} | {x['detail']} |" for x in r["references"]]
    p = r["provenance_coverage"]
    L += ["", f"Provenance coverage (all table-derived measurements with file/row/column): {p['with_cell_reference']} / {p['measurements']}.", "",
          "## Gap-detection consistency (known-answer and repeatability checks)", "", "| Case | Expected | Got | Result |", "|---|---|---|---|"]
    L += [f"| {g['case']} | {g['expected']} | {g['got']} | {'pass' if g['pass'] else 'FAIL'} |" for g in r["gap_consistency"]]
    L += ["", "## Matching sanity checks", "", "| Case | Expected in top | Top | Result |", "|---|---|---|---|"]
    L += [f"| {m['case']} | {m['expected_in_top']} | {', '.join(m['top'])} | {'pass' if m['pass'] else 'FAIL'} |" for m in r["matching_known_answers"]]
    L += ["", "Matching checks are sanity checks on a handful of constructed targets, not a measure of scientific matching quality; no expert-labelled relevance set exists.",
          "", "## Semantic cases (diluent, flow, eligibility, linkage)", "", "| Id | Category | Result | Detail |", "|---|---|---|---|"]
    L += [f"| {x['id']} | {x['category']} | {'pass' if x['pass'] else 'FAIL'} | {x['detail']} |" for x in r["semantic"]]
    L += ["", "## Matching cases (diluent-aware, flow incompatibility)", "", "| Id | Category | Result | Detail |", "|---|---|---|---|"]
    L += [f"| {x['id']} | {x['category']} | {'pass' if x['pass'] else 'FAIL'} | {x['detail']} |" for x in r["matching_cases"]]
    L += ["", "## Coverage cases", "", "| Id | Result | Detail |", "|---|---|---|"]
    L += [f"| {x['id']} | {'pass' if x['pass'] else 'FAIL'} | {x['detail']} |" for x in r["coverage_cases"]]
    L += ["", "## Adversarial / negative cases", "", "| Id | Result | Detail |", "|---|---|---|"]
    L += [f"| {x['id']} | {'pass' if x['pass'] else 'FAIL'} | {x['detail']} |" for x in r["adversarial"]]
    L += ["", "## Items requiring expert review", ""] + [f"- **{x['accession']}** — {x['detail']}" for x in r["known_issues_for_expert_review"]]
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    out = run()
    (HERE.parent.parent / "docs" / "VALIDATION_REPORT.md").write_text(markdown(out), encoding="utf-8")
    print(json.dumps({"overall": out["overall"], "by_category": out["by_category"],
                      "gaps": [(g["case"], g["got"], g["pass"]) for g in out["gap_consistency"]],
                      "ranks": [(m["case"], m["top"], m["pass"]) for m in out["matching_known_answers"]],
                      "metrics": out["metrics"],
                      "fails": [x for x in out["references"] + out["semantic"] + out["matching_cases"] + out["coverage_cases"] + out["adversarial"] if not x["pass"]]}, indent=1))
