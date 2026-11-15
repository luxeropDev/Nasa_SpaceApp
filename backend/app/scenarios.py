"""Mission scenario research mapping (evidence organisation, NOT a fire simulation).

For each scenario it lists the records curated as relevant, how they cover the four
safety domains, their stored limitations and the knowledge gaps that apply.
"""
from collections import Counter

from . import psi
from .data_loader import INVESTIGATIONS, SCENARIOS
from .i18n_data import invs, srcs
from .texts import T, table

SAFETY = ["prevention", "material_flammability", "smoke_detection", "suppression"]


def scenario_gaps(scenario: str, lang: str) -> list[str]:
    """Gap statements for a mission scenario, produced by the deterministic gap engine from the scenario preset.
    Undefined preset parameters are reported as not assessable (never filled with defaults)."""
    from .science.coverage import preset_gap_sentences
    return preset_gap_sentences(scenario, lang)


def mapping(lang: str = "en") -> list[dict]:
    _, loc = invs(lang)
    _, src = srcs(lang)
    scen_l = table(lang, "scenario")
    out = []
    for key in SCENARIOS:
        recs = [i for i in INVESTIGATIONS if key in i.relevance]
        cov = Counter(i.fire_safety_domain for i in recs)
        source_ids = list(dict.fromkeys(s for i in recs for s in i.source_ids))
        out.append({
            "key": key,
            "label": scen_l[key],
            "investigations": [{"id": i.id, "acronym": loc[i.id].acronym, "full_name": loc[i.id].full_name,
                                "fire_safety_domain": i.fire_safety_domain, "fuel_type": i.fuel_type,
                                "research_domain": loc[i.id].research_domain, "relevance_note": loc[i.id].relevance_note,
                                "finding": loc[i.id].findings[0].model_dump() if i.findings else None} for i in recs],
            "domain_coverage": [{"domain": d, "count": cov.get(d, 0)} for d in SAFETY],
            "missing_domains": [d for d in SAFETY if cov.get(d, 0) == 0],
            "research_domains": sorted({loc[i.id].research_domain for i in recs}),
            "sources": [{"id": s, "title": src[s].title, "url": src[s].url, "link_kind": src[s].link_kind} for s in source_ids],
            "limitations": list(dict.fromkeys(l for i in recs for l in loc[i.id].limitations))[:8],
            "knowledge_gaps": scenario_gaps(key, lang),
            # records whose linked PSI experiment table states oxygen, pressure or flow per test (counts, not values)
            "numeric_measurements": sum(1 for i in recs if psi.parameters_available(i.psi_accessions) & {"oxygen", "pressure", "flow"}),
            "datasets": [{"investigation": i.id, "accession": a, "doi": psi.PSI[a]["doi"], "url": psi.PSI[a]["landing_url"],
                          "parameters": sorted(psi.parameters_available([a]))} for i in recs for a in i.psi_accessions],
        })
    return out
