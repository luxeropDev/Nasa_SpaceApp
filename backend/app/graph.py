"""Evidence graph built ONLY from fields stored in the knowledge base.

Edge types and their provenance:
  RELATED_TO   investigation <-> investigation   `related` field (curated cross-reference)
  CITES        investigation  -> source          `source_ids` and each finding's `source_id`
  INVESTIGATES investigation  -> research domain `research_domain`
  ADDRESSES    investigation  -> safety domain   `fire_safety_domain`
  USES_FUEL    investigation  -> fuel phase      `fuel_type`
  RELEVANT_TO  investigation  -> mission scenario `relevance` (curated tag, partly by analogy)

  DOCUMENTED   investigation  -> PSI dataset   `psi_accessions` (dataset ingested from NASA PSI)
  PSI_RELATED  dataset       <-> dataset       PSI's own "Related Investigation" field
  MENTIONED_IN investigation  -> document      acronym found verbatim on extracted pages (pages listed in `basis`)
  CONTEXT_FOR  context record -> investigation curated topical link from a historical / technology-transfer case

No SUPPORTS / CONTRADICTS edges are produced: no source in the knowledge base states such a relation explicitly.
Every edge carries `origin`: "kb" (curated field), "psi" (stated by NASA PSI), "text_match" (computed from document
text) or "curated_context" (FLAMEWISE editorial link) so inferred links are never shown as stated facts.
"""
from . import documents, psi
from .data_loader import CONTEXT, INVESTIGATIONS
from .i18n_data import invs, localize_domain, srcs


def build(lang: str = "en") -> dict:
    _, loc = invs(lang)
    _, src = srcs(lang)
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    seen: set[tuple] = set()

    def node(nid: str, kind: str, label: str, **extra):
        if nid not in nodes:
            nodes[nid] = {"id": nid, "type": kind, "label": label, **extra}

    def edge(a: str, b: str, kind: str, basis: str, origin: str = "kb"):
        key = (min(a, b), max(a, b), kind) if kind in ("RELATED_TO", "PSI_RELATED") else (a, b, kind)
        if key in seen:
            return
        seen.add(key)
        edges.append({"source": a, "target": b, "type": kind, "basis": basis, "origin": origin})

    for i in INVESTIGATIONS:
        li = loc[i.id]
        node(i.id, "investigation", li.acronym, full_name=li.full_name)
    for i in INVESTIGATIONS:
        for r in i.related:
            if r in loc:
                edge(i.id, r, "RELATED_TO", "related")
        for sid in dict.fromkeys(i.source_ids + [f.source_id for f in i.findings]):
            s = src[sid]
            node(sid, "source", s.title, url=s.url, link_kind=s.link_kind)
            edge(i.id, sid, "CITES", "source_ids" if sid in i.source_ids else "findings.source_id")
        rd = "rd:" + i.research_domain
        node(rd, "research_domain", localize_domain(i.research_domain, lang))
        edge(i.id, rd, "INVESTIGATES", "research_domain")
        sd = "sd:" + i.fire_safety_domain
        node(sd, "safety_domain", i.fire_safety_domain, code=i.fire_safety_domain)
        edge(i.id, sd, "ADDRESSES", "fire_safety_domain")
        fu = "fuel:" + i.fuel_type
        node(fu, "fuel", i.fuel_type, code=i.fuel_type)
        edge(i.id, fu, "USES_FUEL", "fuel_type")
        for sc in i.relevance:
            node("scen:" + sc, "scenario", sc, code=sc)
            edge(i.id, "scen:" + sc, "RELEVANT_TO", "relevance")

    for i in INVESTIGATIONS:
        for a in i.psi_accessions:
            r = psi.PSI[a]
            node("psi:" + a, "dataset", a, full_name=r["title"], url=r["landing_url"], doi=r["doi"])
            edge(i.id, "psi:" + a, "DOCUMENTED", "psi_accessions", "psi")
        names = list(dict.fromkeys([i.acronym, i.acronym.split("-")[0]]))
        by_doc: dict[str, list] = {}
        for m in documents.mentions(names):
            by_doc.setdefault(m["doc_id"], []).append(m["page"])
        for did, pages in by_doc.items():
            d = documents.DOCS[did]
            node("doc:" + did, "document", d["title"], url=d["url"], evidence_class=d["evidence_class"])
            pg = [p for p in pages if p]
            edge(i.id, "doc:" + did, "MENTIONED_IN", ("pages " + ", ".join(map(str, pg))) if pg else "article text", "text_match")
    for a in [x for i in INVESTIGATIONS for x in i.psi_accessions]:
        for b in psi.PSI[a]["related_accessions"]:
            if "psi:" + b in nodes:
                edge("psi:" + a, "psi:" + b, "PSI_RELATED", "PSI 'Related Investigation' field", "psi")
    for c in CONTEXT:
        if not c["related_investigations"]:
            continue
        node("ctx:" + c["id"], "context", c["title"][lang], context_kind=c["kind"], year=c["year"])
        for r in c["related_investigations"]:
            edge("ctx:" + c["id"], r, "CONTEXT_FOR", "curated topical link (not a stated relation)", "curated_context")

    degree: dict[str, int] = {}
    for e in edges:
        degree[e["source"]] = degree.get(e["source"], 0) + 1
        degree[e["target"]] = degree.get(e["target"], 0) + 1
    for n in nodes.values():
        n["degree"] = degree.get(n["id"], 0)
    return {"nodes": list(nodes.values()), "edges": edges}
