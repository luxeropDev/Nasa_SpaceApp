"""Coverage of the ten official 'Flame in Freefall' challenge resources, computed from what is actually loaded.

A resource counts as integrated only through the stages it really passes:
  discovered -> accessible -> metadata_imported -> content_extracted -> indexed -> searchable -> connected -> citable
Status rules (evaluated on the computed stages, never hand-set):
  FULLY_INTEGRATED      all eight stages
  PARTIALLY_INTEGRATED  content extracted but at least one later stage missing, or known scope exclusions
  LINK_ONLY             link + metadata only, no content extracted
  NOT_INTEGRATED        not even metadata
  UNAVAILABLE           not accessible when last verified
"""
from . import documents, psi
from .data_loader import CONTEXT, INVESTIGATIONS, SRC

STAGES = ["discovered", "accessible", "metadata_imported", "content_extracted", "indexed", "searchable", "connected", "citable"]
VERIFIED_ON = "2026-11-14"
CHALLENGE_URL = "https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/?tab=resources"

# resource number -> (source id, document id or None, linked url exactly as on the challenge page, role)
RESOURCES = [
    (1, "SRC_PSI_COMBUSTION", None, "https://psi.nasa.gov/physci/repo/search?q=combustion", "data_repository"),
    (2, "SRC_NASA_COMBUSTION", "DOC_NASA_COMBUSTION", "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/", "program_overview"),
    (3, "SRC_SCIENCECASTS_2018", None, "https://www.youtube.com/watch?v=W1oXykoz9zg", "educational_video"),
    (4, "SRC_GUIDE_2015", "DOC_GUIDE_2015", "https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/", "review_publication"),
    (5, "SRC_APOLLO1", "DOC_APOLLO1", "https://sma.nasa.gov/sma-disciplines/accllp/apollo-1", "historical_incident"),
    (6, "SRC_APOLLO13", "DOC_APOLLO13", "https://sma.nasa.gov/sma-disciplines/accllp/apollo-13", "historical_incident"),
    (7, "SRC_MIR_FIRE", "DOC_MIR_FIRE", "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/", "historical_incident"),
    (8, "SRC_SPINOFF_AIR_TANKS", "DOC_SPINOFF_AIR_TANKS", "https://spinoff.nasa.gov/node/9582", "technology_transfer"),
    (9, "SRC_SPINOFF_FIRE_DETECTOR", "DOC_SPINOFF_FIRE_DETECTOR", "https://spinoff.nasa.gov/node/9407", "technology_transfer"),
    (10, "SRC_SPINOFF_FIRE_ATTIRE", "DOC_SPINOFF_FIRE_ATTIRE", "https://spinoff.nasa.gov/node/9918", "technology_transfer"),
]

# scope exclusions that keep a resource below FULLY_INTEGRATED even when every stage passes (stated, not hidden)
EXCLUSIONS = {
    1: "Raw data files, images and videos hosted by PSI (tens to hundreds of GB per investigation) are not downloaded; "
       "only metadata, publications and the experiment tables are ingested.",
    4: "Text only: figures, figure captions rendered as images and the image-only page 4 are not extracted (no OCR).",
}


def _acronyms() -> list[str]:
    names = set()
    for i in INVESTIGATIONS:
        names.add(i.acronym)
        names.add(i.acronym.split("-")[0])
    return sorted(n for n in names if len(n) >= 3)


def stages_for(n: int, sid: str, did: str | None) -> dict:
    s = SRC[sid]
    st = dict.fromkeys(STAGES, False)
    st["discovered"] = True
    st["accessible"] = s.verification == "verified_accessible"
    st["metadata_imported"] = bool(s.title and s.publisher)
    detail: dict = {}
    if n == 1:
        linked = psi.linked_accessions(INVESTIGATIONS)
        st["content_extracted"] = bool(psi.PSI)
        st["indexed"] = st["searchable"] = bool(psi.PSI)  # PSI objective/approach text is part of the search index
        st["connected"] = bool(linked)
        st["citable"] = any(r["doi"] for r in psi.PSI.values())
        detail = {"records": len(psi.PSI), "linked_to_kb": len(linked), "with_doi": sum(1 for r in psi.PSI.values() if r["doi"])}
    elif did and did in documents.DOCS:
        d = documents.DOCS[did]
        npass = sum(1 for p in documents.PASSAGES if p["doc_id"] == did)
        ctx = [c for c in CONTEXT if c["doc_id"] == did]
        ment = documents.mentions(_acronyms())
        ment = [m for m in ment if m["doc_id"] == did]
        st["content_extracted"] = d["extraction"]["status"] != "failed"
        st["indexed"] = st["searchable"] = npass > 0
        st["connected"] = bool(ment) or any(c["related_investigations"] for c in ctx)
        st["citable"] = npass > 0
        detail = {"passages": npass, "pages": d.get("page_count"), "mention_pages": len(ment),
                  "linked_investigations": sorted({x for c in ctx for x in c["related_investigations"]} | {n for m in ment for n in m["names"]})}
    return {"stages": st, "detail": detail}


def status(n: int, st: dict) -> str:
    if not st["accessible"]:
        return "UNAVAILABLE"
    if not st["metadata_imported"]:
        return "NOT_INTEGRATED"
    if not st["content_extracted"]:
        return "LINK_ONLY"
    if all(st.values()) and n not in EXCLUSIONS:
        return "FULLY_INTEGRATED"
    return "PARTIALLY_INTEGRATED"


def coverage() -> list[dict]:
    out = []
    for n, sid, did, url, role in RESOURCES:
        s = SRC[sid]
        c = stages_for(n, sid, did)
        missing = [k for k, v in c["stages"].items() if not v]
        out.append({"number": n, "source_id": sid, "doc_id": did, "title": s.title, "publisher": s.publisher, "url": url,
                    "role": role, "evidence_class": s.evidence_class, "date": s.date, "verified_on": VERIFIED_ON,
                    "stages": c["stages"], "missing_stages": missing, "detail": c["detail"], "exclusion": EXCLUSIONS.get(n),
                    "status": status(n, c["stages"])})
    return out


def summary() -> dict:
    cov = coverage()
    counts: dict[str, int] = {}
    for r in cov:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    return {"total": len(cov), "by_status": counts, "stage_totals": {s: sum(1 for r in cov if r["stages"][s]) for s in STAGES},
            "challenge_url": CHALLENGE_URL, "verified_on": VERIFIED_ON}
