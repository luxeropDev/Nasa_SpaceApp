import json
import logging
import os
import re

import httpx

from . import analysis
from .data_loader import INVESTIGATIONS
from .i18n_data import invs, srcs
from .retrieval import INDEX, families_in, family_records
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


def _llm(question: str, ctx: str, allowed: set[str], lang: str):
    """Optional live LLM synthesis. Returns None when no key is set; failures are logged and surfaced via `llm_error`."""
    if not (os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY")):
        return None, None
    prompt = ("You are a NASA microgravity combustion research assistant. Use ONLY the evidence below. "
              "Never invent numbers, papers, authors. If evidence is insufficient, say so. Cite using the tags [ID] given. "
              + T(lang, "llm_lang") + ' Return JSON with keys "direct_answer" and "interpretation" (strings).\n\nEVIDENCE:\n' + ctx + "\n\nQUESTION: " + question)
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

        return {"direct_answer": clean(data["direct_answer"]), "interpretation": clean(data["interpretation"]), "model": name}, None
    except Exception as exc:  # noqa: BLE001 - reported to the client, never silent
        log.warning("LLM synthesis failed: %s", exc)
        return None, f"{type(exc).__name__}"


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
                "sources": [], "pipeline": [T(lang, "pipeline_norm"), T(lang, "pipeline_bm25_zero")]}
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
    out, llm_err = _llm(question, ctx, {i.id for i in recs}, lang)
    llm_used = out is not None
    if out:
        direct, interp = out["direct_answer"], out["interpretation"]
    return {"mode": T(lang, "mode_live", model=out["model"]) if out else T(lang, "mode_demo"), "llm_used": llm_used, "llm_error": llm_err, "insufficient_evidence": False,
            "direct_answer": direct,
            "investigations": [{"id": i.id, "acronym": i.acronym, "full_name": i.full_name, "objective": i.objective, "bm25": round(scores.get(i.id, 0), 2)} for i in recs],
            "evidence": evidence, "interpretation": interp, "exploration_relevance": expl, "knowledge_gaps": gps,
            "sources": [src[s].model_dump() for s in srcs_used],
            "pipeline": [T(lang, "pipeline_norm"), T(lang, "pipeline_bm25"), T(lang, "pipeline_select"), T(lang, "pipeline_agg"),
                         T(lang, "pipeline_llm") if llm_used else T(lang, "pipeline_llm_skip"), T(lang, "pipeline_cite")]}
