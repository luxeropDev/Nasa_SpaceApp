import json
import logging
import os
import re

import httpx

from . import analysis, documents, psi
from .data_loader import CONTEXT, INVESTIGATIONS
from .i18n_data import invs, srcs
from .retrieval import INDEX, families_in, family_records, normalize, tokenize
from .retrieval_ru import is_limit_ru, ru_scenario
from .texts import T, table

log = logging.getLogger("flamewise.assistant")


def _select(q: str):
    ql = q.lower()
    fams = families_in(q)
    chosen = []
    for f in fams:
        chosen += family_records(f)
    hits = INDEX.search(q, 8)
    hint = ru_scenario(q)
    if not hint:
        if "lunar" in ql or "moon" in ql: hint = "lunar_habitat"
        elif "mars" in ql: hint = "mars_transit"
        elif "rover" in ql: hint = "lunar_rover"
        elif "iss" in ql or "space station" in ql: hint = "iss"
    if hint and not fams:
        pool = [(i, s) for i, s in hits if hint in i.relevance] or [(i, 1.0) for i in INVESTIGATIONS if hint in i.relevance]
        chosen += [i for i, _ in pool]
    elif not fams:
        chosen += [i for i, _ in hits]
    seen, out = set(), []
    for i in chosen:
        if i.id not in seen:
            seen.add(i.id)
            out.append(i)
    return out[:6], fams, hint, {i.id: s for i, s in hits}


def _llm(question: str, ctx: str, allowed: set[str], lang: str, ev_ids: set[str] | None = None):
    """Optional live LLM synthesis. Returns None when no key is set; failures are logged and surfaced via `llm_error`."""
    if not (os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY")):
        return None, None
    prompt = ("You are a NASA microgravity combustion research assistant. Use ONLY the evidence below. "
              "Never invent numbers, papers, authors. If evidence is insufficient, say so. Cite using the tags [ID] given. "
              + T(lang, "llm_lang") + ' Return JSON with keys "direct_answer" and "interpretation" (strings) and "claims": a list of objects '
              '{"type": "EVIDENCE"|"INTERPRETATION"|"HYPOTHESIS"|"SAFETY", "text": string, "evidence": [evidence ids like "E1"]}. '
              'EVIDENCE claims must restate what a cited excerpt says.\n\nEVIDENCE:\n' + ctx + "\n\nQUESTION: " + question)
    try:
        if os.getenv("OPENAI_API_KEY"):
            model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
            r = httpx.post("https://api.openai.com/v1/chat/completions", timeout=40, headers={"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"]},
                           json={"model": model, "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}})
            r.raise_for_status()
            txt, name = r.json()["choices"][0]["message"]["content"], f"openai:{model}"
        else:
            model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
            r = httpx.post("https://api.anthropic.com/v1/messages", timeout=40, headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01"},
                           json={"model": model, "max_tokens": 900, "messages": [{"role": "user", "content": prompt}]})
            r.raise_for_status()
            txt, name = r.json()["content"][0]["text"], f"anthropic:{model}"
        data = json.loads(re.search(r"\{.*\}", txt, re.S).group(0))

        def clean(s: str) -> str:  # citation validation: drop tags that are not retrieved record ids
            return re.sub(r"\[([A-Za-z0-9_\-]+)\]", lambda m: m.group(0) if m.group(1) in allowed else "", str(s))

        claims = []
        for c in data.get("claims") or []:
            if isinstance(c, dict) and c.get("text"):
                typ = str(c.get("type", "INTERPRETATION")).upper()
                claims.append({"type": typ if typ in ("EVIDENCE", "INTERPRETATION", "HYPOTHESIS", "SAFETY") else "INTERPRETATION",
                               "text": clean(c["text"]), "evidence": [e for e in c.get("evidence") or [] if not ev_ids or e in ev_ids]})
        return {"direct_answer": clean(data["direct_answer"]), "interpretation": clean(data["interpretation"]), "claims": claims, "model": name}, None
    except Exception as exc:  # noqa: BLE001 - reported to the client, never silent
        log.warning("LLM synthesis failed: %s", exc)
        return None, f"{type(exc).__name__}"


def _best_sentence(text: str, terms: set[str]) -> str:
    sents = [x.strip() for x in re.split(r"(?<=[.!?])\s+", text) if len(x.strip()) > 40]
    if not sents:
        return text[:400]
    best = max(sents, key=lambda x: len(terms & set(tokenize(x))))
    return best[:500]


def build_evidence(question: str, recs_en: list, lang: str) -> list[dict]:
    """Evidence items with explicit provenance. Each item states whether its text is a verbatim excerpt of the source."""
    terms = set(normalize(question))
    _, by_id = invs(lang)
    _, src = srcs(lang)
    items: list[dict] = []
    for i in recs_en:
        li = by_id[i.id]
        for f in li.findings:
            s = src[f.source_id]
            items.append({"kind": "curated_finding", "investigation_id": i.id, "text": f.text, "verbatim": False,
                          "verification": "curated_summary", "title": s.title, "organization": s.publisher, "year": s.date,
                          "url": s.url, "doi": None, "page": None, "section": None, "source_id": f.source_id})
        for a in i.psi_accessions[:2]:
            r = psi.PSI.get(a)
            if not r:
                continue
            body = r["objective"] + " " + r["approach"]
            items.append({"kind": "psi_record", "investigation_id": i.id, "text": _best_sentence(body, terms), "verbatim": True,
                          "verification": "verbatim_psi_metadata", "title": f"{r['title']} ({a})", "organization": "NASA Physical Sciences Informatics",
                          "year": (r["release_date"] or "")[-4:] or None, "url": r["landing_url"], "doi": r["doi"], "page": None,
                          "section": "Objectives / Approach", "source_id": "SRC_PSI_COMBUSTION"})
    for p in documents.search(list(terms), limit=4, classes={"scientific_publication", "background"}):
        d = documents.DOCS[p["doc_id"]]
        items.append({"kind": "document_passage", "investigation_id": None, "text": p["text"], "verbatim": True,
                      "verification": "verbatim_extracted_text", "title": d["title"], "organization": d["publisher"],
                      "year": (d.get("date") or "")[:4] or None, "url": d["url"], "doi": None, "page": p["page"], "section": p["section"],
                      "source_id": None, "doc_id": d["id"], "matched_terms": p["matched_terms"]})
    for n, it in enumerate(items, 1):
        it["id"] = f"E{n}"
    return items


def _support(claim: str, ev_texts: list[str]) -> bool:
    """Lexical support check: a claim counts as supported when enough of its content words occur in the cited excerpts."""
    ct = set(tokenize(claim))
    if not ct or not ev_texts:
        return False
    et = set(tokenize(" ".join(ev_texts)))
    shared = ct & et
    return len(shared) >= 3 and len(shared) / len(ct) >= 0.3


def context_for(recs_en: list, lang: str) -> list[dict]:
    ids = {i.id for i in recs_en}
    out = []
    for c in CONTEXT:
        if ids & set(c["related_investigations"]):
            out.append({"id": c["id"], "kind": c["kind"], "title": c["title"][lang], "relevance": c["relevance"][lang], "source_id": c["source_id"]})
    return out


def answer(question: str, lang: str = "en") -> dict:
    ql = question.lower()
    recs_en, fams, scen, scores = _select(question)
    if not recs_en and (any(w in ql for w in ["limitation", "gap", "unknown", "missing"]) or is_limit_ru(question)):
        # knowledge-gap questions are about the whole KB: show one representative record per investigation family
        recs_en = [i for i in INVESTIGATIONS if i.id.endswith("_001")][:6]
    loc, by_id = invs(lang)
    _, src = srcs(lang)
    scen_l, fuel_l, dom_l = table(lang, "scenario"), table(lang, "fuel"), table(lang, "domain")
    gaps_all = [g["detail"] for g in analysis.gaps(lang)]
    if not recs_en:
        return {"mode": T(lang, "mode_demo"), "llm_used": False, "llm_error": None, "insufficient_evidence": True, "direct_answer": T(lang, "insufficient"),
                "investigations": [], "evidence": [], "interpretation": T(lang, "no_match"), "exploration_relevance": "", "knowledge_gaps": gaps_all,
                "sources": [], "evidence_items": [], "claims": [], "context": [], "safety_note": T(lang, "safety_note"),
                "pipeline": [T(lang, "pipeline_norm"), T(lang, "pipeline_bm25_zero")]}
    recs = [by_id[i.id] for i in recs_en]

    def cite(i, f=None):
        return f"[{i.acronym} \u2014 {src[(f.source_id if f else i.source_ids[0])].type}]"

    is_limit = any(w in ql for w in ["limitation", "gap", "unknown", "missing"]) or is_limit_ru(question)
    evidence = [{"investigation_id": i.id, "citation": cite(i, f), "text": f.text, "source_id": f.source_id, "source_url": src[f.source_id].url} for i in recs for f in i.findings]
    names = ", ".join(i.acronym for i in recs)
    if is_limit:
        direct = T(lang, "limits_direct", items=" ".join(f"{g['title']} \u2014 {g['detail']}" for g in analysis.gaps(lang)[:4]))
    elif len(fams) >= 2:
        parts = []
        for f in fams[:3]:
            r = family_records(f)
            if r:
                x = by_id[r[0].id]
                parts.append(T(lang, "compare_part", acr=x.acronym.split("-")[0], fuel=fuel_l.get(x.fuel_type, x.fuel_type), hw=x.hardware, grav=x.gravity_environment, obj=x.objective, cite=cite(x)))
        direct = T(lang, "compare_direct", parts=" | ".join(parts))
    elif scen:
        direct = T(lang, "scen_direct", n=len(recs), scenario=scen_l[scen], names=names)
    else:
        direct = T(lang, "default_direct", names=names, finding=recs[0].findings[0].text, cite=cite(recs[0], recs[0].findings[0]))
    interp = T(lang, "interp", domains=", ".join(sorted({i.research_domain.lower() for i in recs})))
    expl = " ".join(T(lang, "expl", acr=i.acronym, scens=", ".join(scen_l[r] for r in i.relevance)) + (f" {i.relevance_note}" if i.relevance_note else "") for i in recs[:4])
    gps = list(dict.fromkeys(l for i in recs[:4] for l in i.limitations))[:5]
    srcs_used = list(dict.fromkeys(s for i in recs for s in i.source_ids))
    ctx = "\n".join(f"[{i.id}] {i.acronym}: {i.objective} Findings: {' '.join(f.text for f in i.findings)} Limitations: {' '.join(i.limitations)}" for i in recs)
    ev_items = build_evidence(question, recs_en, lang)
    ctx += "\n" + "\n".join(f"[{e['id']}] ({e['title']}{', p. ' + str(e['page']) if e['page'] else ''}) {e['text']}" for e in ev_items)
    out, llm_err = _llm(question, ctx, {i.id for i in recs}, lang, {e["id"] for e in ev_items})
    llm_used = out is not None
    by_ev = {e["id"]: e for e in ev_items}
    if out:
        direct, interp = out["direct_answer"], out["interpretation"]
        claims = []
        for c in out["claims"]:
            supported = _support(c["text"], [by_ev[e]["text"] for e in c["evidence"] if e in by_ev])
            if c["type"] == "EVIDENCE" and not supported:
                c = {**c, "type": "INTERPRETATION", "text": c["text"] + " " + T(lang, "llm_unsupported")}
            claims.append({**c, "supported": supported})
    else:
        qt = set(normalize(question))
        top = sorted((e for e in ev_items if e["verbatim"]), key=lambda e: -len(qt & set(tokenize(e["text"]))))[:4]
        claims = [{"type": "EVIDENCE", "text": e["text"], "evidence": [e["id"]], "supported": True} for e in top]
        claims.append({"type": "INTERPRETATION", "text": interp, "evidence": [], "supported": False})
    ctx_recs = context_for(recs_en, lang)
    for c in ctx_recs:
        claims.append({"type": "SAFETY", "text": f"{c['title']}: {c['relevance']}", "evidence": [], "supported": False, "context_id": c["id"]})
    return {"mode": T(lang, "mode_live", model=out["model"]) if out else T(lang, "mode_demo"), "llm_used": llm_used, "llm_error": llm_err, "insufficient_evidence": False,
            "direct_answer": direct,
            "investigations": [{"id": i.id, "acronym": i.acronym, "full_name": i.full_name, "objective": i.objective, "bm25": round(scores.get(i.id, 0), 2)} for i in recs],
            "evidence": evidence, "interpretation": interp, "exploration_relevance": expl, "knowledge_gaps": gps,
            "sources": [src[s].model_dump() for s in srcs_used],
            "evidence_items": ev_items, "claims": claims, "context": ctx_recs, "safety_note": T(lang, "safety_note"),
            "pipeline": [T(lang, "pipeline_norm"), T(lang, "pipeline_bm25"), T(lang, "pipeline_passages"), T(lang, "pipeline_select"), T(lang, "pipeline_agg"),
                         T(lang, "pipeline_llm") if llm_used else T(lang, "pipeline_llm_skip"), T(lang, "pipeline_cite")]}
