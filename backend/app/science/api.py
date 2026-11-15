"""PyroLens evidence API (additive; existing endpoints are unchanged)."""
from __future__ import annotations

from collections import Counter
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .. import psi
from ..models import Lang
from . import coverage, matching, measurements as M, passport, physics, report
from .scenario import PRESETS, ScenarioRequest, ScenarioTarget, validate

router = APIRouter(prefix="/api", tags=["evidence"])


def _acc(acc: str) -> str:
    if acc not in M.DATASETS:
        raise HTTPException(404, f"PSI dataset '{acc}' not found")
    return acc


@router.get("/evidence/summary")
def evidence_summary():
    """Collection inventory computed from files: what the counts represent, by granularity and study type."""
    ds = M.DATASETS.values()
    issues = Counter(i["code"] for d in ds for i in d["issues"])
    sev = Counter(i["severity"] for d in ds for i in d["issues"])
    q = [d["quality"] for d in ds]
    return {
        "psi_records": len(M.DATASETS), "tables": sum(1 for d in ds if d["file"]),
        "table_rows": sum(x["total_rows"] for x in q), "observations": len(M.all_observations()),
        "duplicates_excluded": sum(1 for o in M.all_observations(include_duplicates=True) if o["row_type"] == "duplicate"),
        "measurements": sum(x["measurements"] for x in q), "calculated": sum(x["calculated"] for x in q),
        "by_granularity": dict(Counter(d["granularity"] for d in ds)), "by_study_type": dict(Counter(d["study_type"] for d in ds)),
        "rows_by_granularity": {g: sum(d["quality"]["total_rows"] for d in ds if d["granularity"] == g) for g in {d["granularity"] for d in ds}},
        "by_status": dict(sum((Counter(x["by_status"]) for x in q), Counter())), "issues_by_code": dict(issues), "issues_by_severity": dict(sev),
        "granularity_definitions": M.GRANULARITY_DEFS,
        "note": "Rows are not independent experiments: summary, matrix, annotation and duplicate rows are counted separately.",
    }


@router.get("/evidence/quality")
def evidence_quality():
    return [{"accession": a, "acronym": psi.PSI[a]["acronym"], "granularity": d["granularity"], "study_type": d["study_type"], **d["quality"]}
            for a, d in M.DATASETS.items()]


@router.get("/evidence/datasets/{acc}/measurements")
def dataset_measurements(acc: str, parameter: Optional[str] = None, status: Optional[str] = None, row: Optional[int] = None,
                         offset: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=2000)):
    ms = [m for m in M.measurements(_acc(acc)) if (not parameter or m["parameter"] == parameter) and (not status or m["value_status"] == status)
          and (row is None or m["source"]["row"] == row)]
    return {"accession": acc, "total": len(ms), "offset": offset, "items": ms[offset: offset + limit]}


@router.get("/evidence/datasets/{acc}/issues")
def dataset_issues(acc: str, code: Optional[str] = None):
    return [i for i in M.DATASETS[_acc(acc)]["issues"] if not code or i["code"] == code]


@router.get("/evidence/datasets/{acc}/rows/{row}")
def dataset_row(acc: str, row: int):
    """One published table row with every cell's raw text, normalization and provenance (evidence drill-down)."""
    r = next((x for x in M.DATASETS[_acc(acc)]["rows"] if x["row"] == row), None)
    if not r:
        raise HTTPException(404, f"Row {row} not in {acc}")
    return {"accession": acc, "file": M.DATASETS[acc]["file"], "sha256": M.DATASETS[acc]["sha256"], **r}


@router.get("/passports")
def passports():
    out = []
    for a in M.DATASETS:
        p = passport.passport(a)
        out.append({k: p[k] for k in ("accession", "acronym", "title", "study_type", "granularity", "row_label", "kb_records", "observations",
                                       "core_completeness", "doi", "landing_url", "flight_platform", "related_unlinked")}
                   | {"issues_total": p["issues_total"], "rows": p["quality"]["total_rows"]})
    return out


@router.get("/passports/{acc}")
def passport_detail(acc: str):
    return passport.passport(_acc(acc))


@router.get("/coverage/matrix")
def coverage_matrix():
    return {"core_parameters": passport.CORE, "rows": passport.coverage_matrix()}


@router.get("/coverage/map")
def coverage_map():
    return coverage.coverage_map()


@router.get("/coverage/pairs")
def coverage_pairs(lang: Lang = Query("en")):
    from .texts_sci import label
    return {"pairs": [{"x": x, "y": y, "x_label": label(lang, "param", x), "y_label": label(lang, "param", y)} for x, y in coverage.PAIRS],
            "axes": {k: {**v, "label": label(lang, "param", v["label_key"])} for k, v in coverage.AXES.items()}, "filters": list(coverage.FILTERS),
            "flow_configurations": physics.FLOW_CONFIGS, "observation_classes": physics.OBSERVATION_CLASSES, "rules": coverage.COVERAGE_RULES}


@router.get("/coverage/explore")
def coverage_explore(x: str, y: str, accession: Optional[str] = None, material: Optional[str] = None, gravity: Optional[str] = None,
                     flow_configuration: Optional[str] = None, diluent: Optional[str] = None, gas_status: Optional[str] = None, lang: Lang = Query("en")):
    f = {"accession": accession, "material": material, "gravity": gravity, "flow_configuration": flow_configuration, "diluent": diluent, "gas_status": gas_status}
    f = {k: [s.strip() for s in v.split(",") if s.strip()] for k, v in f.items() if v}
    try:
        return coverage.explore(x, y, f, lang)
    except ValueError:
        raise HTTPException(422, {"errors": [{"code": "unknown_axis", "detail": f"{x} × {y}"}], "axes": list(coverage.AXES)})


@router.get("/coverage/observations")
def coverage_observations():
    """All observation rows (eligible and excluded, with the reason) in compact form for interactive atlases."""
    rows = coverage.observation_table()
    return {"rows": rows, "n": len(rows), "eligible": sum(1 for r in rows if r["eligible"]),
            "flow_configurations": physics.FLOW_CONFIGS, "observation_classes": physics.OBSERVATION_CLASSES}


@router.get("/atlas")
def atlas():
    """Research atlas: investigations with platform, category, materials, conditions envelope and evidence counts (real data only).
    No geographic coordinates exist in the PSI metadata (every investigation lists the same NASA center), so the atlas is a
    scientific parameter-space atlas, not a map."""
    inv = []
    for a, d in M.DATASETS.items():
        r = psi.PSI[a]
        obs = [o for o in d["observations"] if o["row_type"] != "duplicate"]
        el = [o for o in obs if o["combustion_eligible"]]
        def rng(k, scale=1.0):
            v = [o[k] * scale for o in el if o.get(k) is not None]
            return [round(min(v), 4), round(max(v), 4)] if v else None
        inv.append({"accession": a, "acronym": r["acronym"], "title": r["title"], "platform": r["flight_platform"], "center": r.get("nasa_center"),
                    "project_type": r["project_type"], "research_area": r["research_area"], "sub_research_area": r["sub_research_area"],
                    "start_date": r["start_date"], "end_date": r["end_date"], "doi": r["doi"], "landing_url": r["landing_url"],
                    "study_type": d["study_type"], "granularity": d["granularity"], "observation_class": d.get("observation_class"),
                    "geometry": (d.get("geometry") or {}).get("value"), "gravity": d["gravity"]["condition"],
                    "observations": len(obs), "eligible": len(el), "materials": sorted({o["material"] for o in obs if o.get("material")}),
                    "diluents": sorted({o["diluent"] for o in obs if o.get("diluent")}),
                    "flow_configurations": sorted({o["flow_configuration"] for o in obs if o.get("flow_configuration") not in (None, "unknown")}),
                    "o2_pct": rng("x_o2", 100), "p_kpa": rng("p_kpa"), "po2_kpa": rng("po2_kpa"), "flow_cm_s": rng("flow_cm_s"),
                    "issues": len(d["issues"]), "publications": len(r["publications"] or [])})
    centers = Counter(i["center"] for i in inv)
    return {"investigations": inv, "geography": {"available": False, "centers": dict(centers),
            "reason": "PSI metadata names a NASA center for every investigation (all the same) and a flight platform; no test-site coordinates exist, so no map is drawn."},
            "totals": {"investigations": len(inv), "with_tables": sum(1 for d in M.DATASETS.values() if d["file"]),
                       "observations": sum(i["observations"] for i in inv), "eligible": sum(i["eligible"] for i in inv),
                       "measurements": sum(d["quality"]["measurements"] for d in M.DATASETS.values()),
                       "calculated_po2": sum(d["quality"]["calculated"] for d in M.DATASETS.values()),
                       "issues": sum(len(d["issues"]) for d in M.DATASETS.values())}}


@router.get("/scenario-presets")
def scenario_presets(lang: Lang = Query("en")):
    return [{"key": k, "name": v["name"][lang], "scenario": v["scenario"], "unknown": v.get("unknown", [])} for k, v in PRESETS["presets"].items()]


@router.post("/scenario/validate")
def scenario_validate(req: ScenarioRequest):
    return validate(req.scenario)


@router.post("/match")
def match(req: ScenarioRequest):
    ev = report.scenario_evidence(req.scenario, req.lang, req.limit)
    if ev["matches"] is None:
        raise HTTPException(422, {"errors": ev["validation"]["errors"]})
    return {"validation": ev["validation"], **ev["matches"]}


@router.post("/gaps")
def gaps(req: ScenarioRequest):
    v = validate(req.scenario)
    if v["errors"]:
        raise HTTPException(422, {"errors": v["errors"]})
    return {"validation": v, **coverage.gaps(v["targets"], req.lang), "coverage_map": coverage.coverage_map(v["targets"])}


@router.post("/evidence/report")
def evidence_report(req: ScenarioRequest):
    r = report.report(req.scenario, req.lang)
    if r["status"] != "ok":
        raise HTTPException(422, {"errors": r["validation"]["errors"]})
    return r


class ExportRequest(BaseModel):
    scenario: Optional[ScenarioTarget] = None
    accessions: Optional[list[str]] = Field(None, max_length=30)
    parameters: Optional[list[str]] = None
    format: Literal["csv", "json"] = "json"
    lang: Lang = "en"


def _export(ms: list[dict], fmt: str, name: str, extra: dict | None = None) -> Response:
    if fmt == "csv":
        return Response(report.to_csv(ms), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{name}.csv"', "X-PyroLens-Dataset-Type": "candidate-input-not-validated"})
    return Response(report.dumps(report.to_json(ms, extra)), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{name}.json"'})


@router.get("/evidence/export")
def export_get(format: Literal["csv", "json"] = "json", accessions: Optional[str] = None, parameters: Optional[str] = None):
    accs = [a.strip() for a in accessions.split(",")] if accessions else None
    for a in accs or []:
        _acc(a)
    ms = report.select_measurements(accs, [p.strip() for p in parameters.split(",")] if parameters else None)
    return _export(ms, format, "pyrolens-evidence-" + ("-".join(accs) if accs and len(accs) <= 3 else "collection"))


@router.post("/evidence/export")
def export_post(req: ExportRequest):
    rows = None
    extra = {}
    if req.scenario:
        v = validate(req.scenario)
        if v["errors"]:
            raise HTTPException(422, {"errors": v["errors"]})
        rows = report.scenario_rows(req.scenario)
        extra = {"scenario": {"name": req.scenario.name, "targets": v["targets"], "content_class": "scenario_assumption"},
                 "selection": "rows supporting or partially supporting the scenario's gap analyses, plus the best row of each ranked experiment"}
    accs = req.accessions or (sorted({a for a, _ in rows}) if rows is not None else None)
    ms = report.select_measurements(accs, req.parameters, rows)
    return _export(ms, req.format, "pyrolens-scenario-evidence" if req.scenario else "pyrolens-evidence", extra)
