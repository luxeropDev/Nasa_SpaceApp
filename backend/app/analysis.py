from collections import Counter

from . import documents, psi, resources
from .data_loader import CONTEXT, DATASET_VERSION, INVESTIGATIONS, SCENARIOS, SOURCES
from .i18n_data import invs, localize_domain, srcs
from .texts import T, table


def overview(lang: str = "en") -> dict:
    dom = Counter(i.research_domain for i in INVESTIGATIONS)
    fuel = Counter(i.fuel_type for i in INVESTIGATIONS)
    fsd = Counter(i.fire_safety_domain for i in INVESTIGATIONS)
    rel = {k: sum(1 for i in INVESTIGATIONS if k in i.relevance) for k in SCENARIOS}
    scen = table(lang, "scenario")
    n_find = sum(len(i.findings) for i in INVESTIGATIONS)
    usage = Counter(f.source_id for i in INVESTIGATIONS for f in i.findings)  # real per-source citation counts
    sl, _ = srcs(lang)
    matrix = [{"scenario": s, "domain": d, "count": sum(1 for i in INVESTIGATIONS if s in i.relevance and i.fire_safety_domain == d)}
              for s in SCENARIOS for d in table("en", "domain")]
    return {
        "dataset_version": DATASET_VERSION,
        "kpis": {"investigations": len(INVESTIGATIONS), "research_domains": len(dom), "source_documents": len(SOURCES), "evidence_insights": n_find},
        "by_domain": [{"name": localize_domain(k, lang), "count": v} for k, v in dom.most_common()],
        "by_fuel": [{"key": k, "count": v} for k, v in fuel.most_common()],
        "by_safety_domain": [{"key": k, "count": v} for k, v in fsd.most_common()],
        "mission_relevance": [{"key": k, "name": scen[k], "count": v} for k, v in rel.items()],
        "coverage_matrix": matrix,
        "source_usage": [{"id": s.id, "title": s.title, "findings": usage.get(s.id, 0)} for s in sl],
        "knowledge_gaps": gaps(lang),
        "record_status": T(lang, "record_status"),
        "provenance": provenance(),
        "resource_coverage": resources.summary(),
    }


def provenance() -> dict:
    """Counts that describe what the platform actually holds (all computed from loaded data)."""
    linked = psi.linked_accessions(INVESTIGATIONS)
    params = {p: sum(1 for i in INVESTIGATIONS if p in psi.parameters_available(i.psi_accessions)) for p in psi.PARAM_ORDER}
    return {
        "psi_investigations": len(psi.PSI),
        "psi_linked": len(linked),
        "psi_unlinked": sorted(set(psi.PSI) - linked),
        "psi_with_table": sum(1 for r in psi.PSI.values() if r.get("experiment_table")),
        "psi_table_rows": sum((r.get("experiment_table") or {}).get("row_count", 0) for r in psi.PSI.values()),
        "psi_publications": sum(len(r["publications"]) for r in psi.PSI.values()),
        "psi_publications_with_doi": sum(1 for r in psi.PSI.values() for p in r["publications"] if p["doi"]),
        "psi_ingested_at": psi.MANIFEST.get("finished_at"),
        "documents": len(documents.DOCS),
        "document_pages": sum(len(d["pages"]) for d in documents.DOCS.values()),
        "passages": len(documents.PASSAGES),
        "context_records": len(CONTEXT),
        "records_with_parameter": params,
        "records_total": len(INVESTIGATIONS),
    }


def gaps(lang: str = "en") -> list[dict]:
    n = len(INVESTIGATIONS)
    no_o2 = sum(1 for i in INVESTIGATIONS if "oxygen" in psi.parameters_available(i.psi_accessions))
    no_air = sum(1 for i in INVESTIGATIONS if "flow" in psi.parameters_available(i.psi_accessions))
    sup = sum(1 for i in INVESTIGATIONS if i.fire_safety_domain == "suppression")
    return [
        {"title": T(lang, "gap_o2_title"), "detail": T(lang, "gap_o2_detail", n=no_o2, total=n, air=no_air)},
        {"title": T(lang, "gap_partial_title"), "detail": T(lang, "gap_partial_detail")},
        {"title": T(lang, "gap_supp_title"), "detail": T(lang, "gap_supp_detail", n=sup)},
        {"title": T(lang, "gap_rover_title"), "detail": T(lang, "gap_rover_detail")},
    ]


def insights(lang: str = "en") -> list[dict]:
    _, inv = invs(lang)
    _, src = srcs(lang)
    res = []
    for p in ["SAFFIRE_001", "BASS_001", "SAME_001", "FLEX_001", "CFI_001"]:
        i = inv[p]
        f = i.findings[0]
        res.append({"investigation_id": i.id, "acronym": i.acronym, "text": f.text, "source_id": f.source_id,
                    "source_url": src[f.source_id].url, "source_title": src[f.source_id].title})
    return res
