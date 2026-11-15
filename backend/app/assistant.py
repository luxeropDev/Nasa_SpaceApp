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
              '{"type": "EVIDENCE"|"CALCULATED"|"INTERPRETATION"|"HYPOTHESIS"|"SAFETY", "text": string, "evidence": [evidence ids like "E1"]}. '
              'EVIDENCE claims must restate what a cited excerpt says. CALCULATED is only for values the evidence marks as calculated (pO2). '
              'Every number you write must appear in the cited evidence. If the evidence cannot answer, say "I cannot establish this from the available evidence."\n\nEVIDENCE:\n' + ctx + "\n\nQUESTION: " + question)
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
                claims.append({"type": typ if typ in ("EVIDENCE", "CALCULATED", "INTERPRETATION", "HYPOTHESIS", "SAFETY") else "INTERPRETATION",
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


_NUM = re.compile(r"(?<![A-Za-z0-9.])([-−+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)(\s*(?:%|kPa|Pa|MPa|atm|psi|bar|mmHg|cm/s|mm/s|m/s|mm|cm|µm|micron|ms|s|min|K|°C|ppm|W|mg/s|mg|sccm)\b|\s*%)?")
_RANGE = re.compile(r"(\d)\s*[-–—]\s*(?=\d)")
_THOUSANDS = re.compile(r"\b(\d{1,3})(?:,(\d{3}))+\b")


def _numbers(text: str) -> list[tuple[float, bool]]:
    """(value, has_unit) for every number in a text. Range ends ('15-99') are split, signs and exponents kept,
    thousands separators removed, decimal commas read as points. Digits inside chemical formulas (CO2, C2H4) are not numbers."""
    t = _THOUSANDS.sub(lambda m: m.group(0).replace(",", ""), text)
    t = re.sub(r"(\d),(\d)", r"\1.\2", t)
    t = _RANGE.sub(r"\1 ", t)
    out = []
    for m in _NUM.finditer(t):
        try:
            out.append((float(m.group(1).replace("−", "-")), bool(m.group(2))))
        except ValueError:
            pass
    return out


def _numbers_grounded(claim: str, ev_texts: list[str]) -> bool:
    """Every number in a claim must appear in the cited evidence (equal value, same sign). Exempt only unit-less small
    integers 0-10 (counts, ordinals) and unit-less four-digit years."""
    ev = {v for t in ev_texts for v, _ in _numbers(t)}
    for v, unit in _numbers(claim):
        if not unit and v.is_integer() and (0 <= v <= 10 or 1900 <= v <= 2100):
            continue
        if not any(abs(v - e) <= 1e-9 * max(1.0, abs(e)) for e in ev):
            return False
    return True


GRAN = {"en": {"per_test": "per-test rows", "per_test_setpoint": "set-point rows", "per_specimen": "specimen rows", "test_log": "test-log rows",
               "test_day_summary": "test-day summary rows", "test_matrix": "campaign-matrix rows", "session_log": "session rows",
               "publication_figure_index": "figure-index rows", "no_table": "no table"},
        "ru": {"per_test": "строк отдельных опытов", "per_test_setpoint": "строк режимов", "per_specimen": "строк образцов", "test_log": "строк журнала",
               "test_day_summary": "сводных строк по дням", "test_matrix": "строк матрицы кампании", "session_log": "строк сеансов",
               "publication_figure_index": "строк указателя рисунков", "no_table": "нет таблицы"}}
BASIS = {"en": {"measured": "measured (calibrated)", "source_reported": "source table value", "source_derived": "derived by investigators", "model_derived": "model-derived"},
         "ru": {"measured": "измерено (калибровано)", "source_reported": "значение таблицы источника", "source_derived": "получено исследователями", "model_derived": "расчётная модель"}}


def scenario_evidence_items(user_scen, lang: str) -> tuple[list[dict], dict | None]:
    """Evidence items for a user-created scenario: validation, ranked matches (rule-based explanations), deterministic
    gaps, and passport facts (diluent, flow configuration, uncertainty) for the top experiments. All values come from
    the deterministic engine; the assistant never computes them."""
    from .science import coverage as cov, explain as sx, matching, passport
    from .science.explain import fmt
    from .science.scenario import validate
    from .science.texts_sci import label
    v = validate(user_scen)
    org = "PyroLens (deterministic engine)"
    base = {"investigation_id": None, "verbatim": False, "year": None, "url": None, "doi": None, "page": None, "section": None, "source_id": None}
    if v["errors"]:
        return [{**base, "kind": "scenario_validation", "verification": "scenario_validation", "title": user_scen.name, "organization": org,
                 "text": T(lang, "ev_scen_invalid", errors="; ".join(f"{e['field']}: {e['code']}" for e in v["errors"]))}], v
    tg = v["targets"]
    desc = "; ".join(f"{label(lang, 'param', k)} = {fmt(k, x['value']) if isinstance(x.get('value'), (int, float)) else x.get('value')} ({x.get('origin')})"
                     for k, x in tg.items())
    items = [{**base, "kind": "scenario_definition", "verification": "user_scenario", "title": user_scen.name, "organization": "user",
              "text": T(lang, "ev_scen_def", name=user_scen.name, targets=desc)}]
    po = tg.get("oxygen_partial_pressure")
    if po and po.get("derived"):
        unc = (T(lang, "ev_unc_prop", u=f"{po['uncertainty']:.3g}") if po.get("uncertainty") is not None else T(lang, "ev_unc_none"))
        items.append({**base, "kind": "calculated_value", "verification": "calculated_by_pyrolens", "title": f"{user_scen.name} · pO2", "organization": org,
                      "text": T(lang, "ev_scen_po2", v=f"{po['value']:.4g}") + " " + unc})
    g = cov.gaps(tg, lang)
    lines = [T(lang, "ev_gap_head", scenario=user_scen.name)] + [T(lang, "ev_gap_item", title=x["title"], cls=x["classification"], n=x["supporting_records"],
                                                                     p=x["partial_records"], r=x["reporting_records"]) for x in g["gaps"] if x["classification"] != "NOT_ASSESSABLE"]
    items.append({**base, "kind": "gap_analysis", "verification": "deterministic_gap_analysis", "title": user_scen.name, "organization": org, "text": " ".join(lines)})
    for x in g["gaps"]:
        if x["classification"] in ("NO_MATCHING_RECORDS", "INSUFFICIENT_METADATA", "SPARSE_COVERAGE") and x.get("insufficiency_reasons"):
            items.append({**base, "kind": "gap_analysis", "verification": "deterministic_gap_analysis", "title": x["title"], "organization": org, "text": x["explanation"]})
    rk = matching.rank(tg, 3)
    if rk["ranked"]:
        items.append({**base, "kind": "gap_analysis", "verification": "deterministic_condition_matching", "title": user_scen.name, "organization": org,
                      "text": T(lang, "ev_rank_head") + " " + " ".join(f"[{r['accession']}] {sx.explain(r, lang)}" for r in rk["ranked"][:3])})
        for r in rk["ranked"][:3]:
            pp = passport.passport(r["accession"])
            gs, fl = pp["gas"], pp["flow"]
            items.append({**base, "kind": "passport_summary", "verification": "computed_from_psi_table", "title": f"{r['accession']} passport",
                          "organization": "NASA Physical Sciences Informatics", "url": pp["landing_url"], "doi": pp["doi"], "accession": r["accession"],
                          "text": T(lang, "ev_passport", acc=r["accession"], dil=gs["mode"], dils=", ".join(f"{k} {v}" for k, v in gs["primary_diluents"].items()) or "—",
                                    flow=", ".join(f"{label(lang, 'flowcfg', k)} {c['n']}" for k, c in fl["configurations"].items()) or "—",
                                    unc=", ".join(f"{k} {n}" for k, n in pp["uncertainty"]["by_status"].items()) or "—")})
    return items, v


def structured_evidence(question: str, recs_en: list, scen: str | None, lang: str) -> list[dict]:
    """Evidence items generated from the measurement layer and the deterministic gap engine (values only from data)."""
    from .science import coverage as cov, explain as sx, matching, measurements as M, passport
    from .science.scenario import ScenarioTarget, preset, validate
    from .science.texts_sci import label
    items: list[dict] = []
    for i in recs_en[:4]:
        for a in i.psi_accessions[:3]:
            d = M.DATASETS.get(a)
            if not d or not d["file"] or not d["observations"]:
                continue
            st = M.parameter_stats(a)
            parts, missing = [], []
            for p in ("oxygen_mole_fraction", "total_pressure", "flow_velocity", "specimen_thickness"):
                x = st.get(p)
                if not x or not x["n_usable"]:
                    missing.append(label(lang, "param", p))
                    continue
                k = 100 if p == "oxygen_mole_fraction" else 1
                unit = "%" if p == "oxygen_mole_fraction" else x["unit"]
                bases = [b for b in x["bases"] if b != "calculated"]
                excl = sum(v for s_, v in x["statuses"].items() if s_ in ("invalid", "ambiguous", "unresolved"))
                parts.append(T(lang, "ev_measure_param", param=label(lang, "param", p), rng=f"{x['min'] * k:.4g}–{x['max'] * k:.4g} {unit}",
                               basis=", ".join(BASIS[lang].get(b, b) for b in bases), cols="; ".join(f"'{h}'" for h in x["headers"][:2]), n=x["n_usable"],
                               excl=f"; excluded {excl}" if excl and lang == "en" else (f"; исключено {excl}" if excl else "")))
            text = T(lang, "ev_measure_head", acc=a, rows=d["quality"]["total_rows"], gran=GRAN[lang].get(d["granularity"], d["granularity"]), file=d["file"])
            text += " " + "; ".join(parts + ([T(lang, "ev_measure_missing", params=", ".join(missing))] if missing else [])) + "."
            items.append({"kind": "measurement_summary", "investigation_id": i.id, "text": text, "verbatim": False, "verification": "computed_from_psi_table",
                          "title": f"{psi.PSI[a]['title']} ({a})", "organization": "NASA Physical Sciences Informatics", "year": None, "url": psi.PSI[a]["landing_url"],
                          "doi": psi.PSI[a]["doi"], "page": None, "section": d["file"], "source_id": "SRC_PSI_COMBUSTION", "accession": a})
            po = st.get("oxygen_partial_pressure")
            if po and po["n_usable"]:
                items.append({"kind": "calculated_value", "investigation_id": i.id, "text": T(lang, "ev_po2", acc=a, rng=f"{po['min']:.4g}–{po['max']:.4g}", n=po["n_usable"]),
                              "verbatim": False, "verification": "calculated_by_pyrolens", "title": f"{a} · pO2", "organization": "PyroLens", "year": None,
                              "url": psi.PSI[a]["landing_url"], "doi": psi.PSI[a]["doi"], "page": None, "section": None, "source_id": None, "accession": a})
    ql = question.lower()
    wants_gap = any(w in ql for w in ("gap", "missing", "coverage", "comparable", "relevant", "match", "similar", "condition", "пробел", "покрыт", "сопостав", "похож", "услови"))
    if scen and wants_gap and preset(scen):
        v = validate(ScenarioTarget(**preset(scen)["scenario"]))
        if not v["errors"] and v["targets"]:
            g = cov.gaps(v["targets"], lang)
            name = preset(scen)["name"][lang]
            lines = [T(lang, "ev_gap_head", scenario=name)] + [T(lang, "ev_gap_item", title=x["title"], cls=x["classification"], n=x["supporting_records"],
                                                                 p=x["partial_records"], r=x["reporting_records"]) for x in g["gaps"] if x["classification"] != "NOT_ASSESSABLE"]
            items.append({"kind": "gap_analysis", "investigation_id": None, "text": " ".join(lines), "verbatim": False, "verification": "deterministic_gap_analysis",
                          "title": name, "organization": "PyroLens", "year": None, "url": None, "doi": None, "page": None, "section": None, "source_id": None})
            rk = matching.rank(v["targets"], 3)
            if rk["ranked"]:
                items.append({"kind": "gap_analysis", "investigation_id": None, "verbatim": False, "verification": "deterministic_condition_matching",
                              "text": T(lang, "ev_rank_head") + " " + " ".join(f"[{r['accession']}] {sx.explain(r, lang)}" for r in rk["ranked"][:3]),
                              "title": name, "organization": "PyroLens", "year": None, "url": None, "doi": None, "page": None, "section": None, "source_id": None})
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


def answer(question: str, lang: str = "en", user_scenario=None) -> dict:
    ql = question.lower()
    recs_en, fams, scen, scores = _select(question)
    scen_items, scen_val = ([], None)
    if user_scenario is not None:
        scen_items, scen_val = scenario_evidence_items(user_scenario, lang)
        if not recs_en:
            # ground the answer in the records linked to the experiments the deterministic matcher ranked
            from .science import matching
            accs = [r["accession"] for r in matching.rank(scen_val["targets"], 4)["ranked"]] if scen_val and not scen_val["errors"] else []
            recs_en = [i for i in INVESTIGATIONS if set(i.psi_accessions) & set(accs)][:4]
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
    elif user_scenario is not None:
        direct = T(lang, "user_scen_direct", name=user_scenario.name, names=names)
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
    struct = structured_evidence(question, recs_en, None if user_scenario is not None else scen, lang)
    ev_items = scen_items + struct + ev_items
    for n, it in enumerate(ev_items, 1):
        it["id"] = f"E{n}"
    ctx += "\n" + "\n".join(f"[{e['id']}] ({e['title']}{', p. ' + str(e['page']) if e['page'] else ''}) {e['text']}" for e in ev_items)
    out, llm_err = _llm(question, ctx, {i.id for i in recs}, lang, {e["id"] for e in ev_items})
    llm_used = out is not None
    weak = False
    by_ev = {e["id"]: e for e in ev_items}
    answer_grounded = True
    if out:
        direct, interp = out["direct_answer"], out["interpretation"]
        all_ev = [e["text"] for e in ev_items] + [ctx]
        if not _numbers_grounded(direct, all_ev):
            direct += " " + T(lang, "llm_numbers_ungrounded")
            answer_grounded = False
        if not _numbers_grounded(interp, all_ev):
            interp += " " + T(lang, "llm_numbers_ungrounded")
            answer_grounded = False
        claims = []
        for c in out["claims"]:
            cited = [by_ev[e]["text"] for e in c["evidence"] if e in by_ev]
            supported = _support(c["text"], cited)
            grounded = _numbers_grounded(c["text"], cited)
            if c["type"] in ("EVIDENCE", "CALCULATED") and not supported:
                c = {**c, "type": "INTERPRETATION", "text": c["text"] + " " + T(lang, "llm_unsupported")}
            if not grounded:
                c = {**c, "type": "INTERPRETATION" if c["type"] in ("EVIDENCE", "CALCULATED") else c["type"], "text": c["text"] + " " + T(lang, "llm_numbers_ungrounded")}
            claims.append({**c, "supported": supported and grounded, "numbers_grounded": grounded})
    else:
        qt = set(normalize(question))
        weak = False
        top = sorted((e for e in ev_items if e["verbatim"]), key=lambda e: -len(qt & set(tokenize(e["text"]))))[:4]
        order = {"scenario_definition": 0, "scenario_validation": 0, "gap_analysis": 1, "passport_summary": 2, "measurement_summary": 3, "calculated_value": 4}
        st_items = sorted((e for e in ev_items if e["kind"] in order), key=lambda e: order[e["kind"]])[:10 if user_scenario is not None else 7]
        claims = [{"type": "EVIDENCE" if e["kind"] in ("measurement_summary", "passport_summary") else ("CALCULATED" if e["kind"] == "calculated_value" else "INTERPRETATION"),
                   "text": e["text"], "evidence": [e["id"]], "supported": True, "structured": True} for e in st_items]
        claims += [{"type": "EVIDENCE", "text": e["text"], "evidence": [e["id"]], "supported": True} for e in top]
        best_overlap = max((len(qt & set(tokenize(e["text"]))) for e in ev_items), default=0)
        if len(qt) >= 2 and best_overlap < 2:
            weak = True
            claims.insert(0, {"type": "INTERPRETATION", "text": T(lang, "cannot_establish"), "evidence": [], "supported": False})
        claims.append({"type": "INTERPRETATION", "text": interp, "evidence": [], "supported": False})
    ctx_recs = context_for(recs_en, lang)
    for c in ctx_recs:
        claims.append({"type": "SAFETY", "text": f"{c['title']}: {c['relevance']}", "evidence": [], "supported": False, "context_id": c["id"]})
    return {"mode": T(lang, "mode_live", model=out["model"]) if out else T(lang, "mode_demo"), "llm_used": llm_used, "llm_error": llm_err, "insufficient_evidence": False,
            "scenario": ({"name": user_scenario.name, "validation": scen_val} if user_scenario is not None else None),
            "weak_evidence": weak, "answer_numbers_grounded": answer_grounded,
            "direct_answer": direct,
            "investigations": [{"id": i.id, "acronym": i.acronym, "full_name": i.full_name, "objective": i.objective, "bm25": round(scores.get(i.id, 0), 2)} for i in recs],
            "evidence": evidence, "interpretation": interp, "exploration_relevance": expl, "knowledge_gaps": gps,
            "sources": [src[s].model_dump() for s in srcs_used],
            "evidence_items": ev_items, "claims": claims, "context": ctx_recs, "safety_note": T(lang, "safety_note"),
            "pipeline": [T(lang, "pipeline_norm"), T(lang, "pipeline_bm25"), T(lang, "pipeline_struct"), T(lang, "pipeline_passages"), T(lang, "pipeline_select"), T(lang, "pipeline_agg"),
                         T(lang, "pipeline_llm") if llm_used else T(lang, "pipeline_llm_skip"), T(lang, "pipeline_cite")]}
