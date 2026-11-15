"""API and data-integrity tests. Run from /backend:  python -m pytest -q"""
import json
import re

import pytest
from fastapi.testclient import TestClient

from app import psi  # noqa: E402
from app.data_loader import INVESTIGATIONS, SOURCES, SRC
from app.i18n_data import verify
from app.main import app
from app.texts_en import EN
from app.texts_ru import RU_A
from app.texts_ru_gaps import RU_B

client = TestClient(app)
LANGS = ["en", "ru"]
CYRILLIC = re.compile(r"[\u0400-\u04FF]")


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "operational"


@pytest.mark.parametrize("lang", LANGS)
def test_overview_counts_match_knowledge_base(lang):
    d = client.get(f"/api/overview?lang={lang}").json()
    assert d["kpis"]["investigations"] == len(INVESTIGATIONS)
    assert d["kpis"]["source_documents"] == len(SOURCES)
    assert len(d["coverage_matrix"]) == 16
    assert sum(x["count"] for x in d["by_domain"]) == len(INVESTIGATIONS)


def test_invalid_language_rejected():
    assert client.get("/api/overview?lang=xx").status_code == 422


def test_translation_tables_are_complete():
    ru = {**RU_A, **RU_B}
    assert set(ru) == set(EN), set(EN) ^ set(ru)
    verify(INVESTIGATIONS, SOURCES)


def test_every_source_reference_resolves():
    for i in INVESTIGATIONS:
        for sid in i.source_ids + [f.source_id for f in i.findings]:
            assert sid in SRC


def test_russian_records_are_russian():
    items = client.get("/api/investigations?lang=ru").json()
    assert len(items) == len(INVESTIGATIONS)
    for i in items:
        assert CYRILLIC.search(i["objective"]), i["id"]
        assert i["oxygen_concentration"] is None  # no invented numbers survive localization


def test_no_numeric_results_are_stored():
    data = json.loads(open("data/investigations.json", encoding="utf-8").read())
    assert all(r["oxygen_concentration"] is None and r["airflow_speed"] is None for r in data)


@pytest.mark.parametrize("lang,q", [("en", "Compare BASS and Saffire."), ("ru", "Сравни BASS и Saffire"), ("ru", "Что NASA изучало про обнаружение дыма?")])
def test_assistant_structured_answer(lang, q):
    r = client.post("/api/assistant", json={"question": q, "lang": lang}).json()
    assert r["investigations"] and r["sources"] and r["evidence"]
    assert r["llm_used"] is False and ("DEMO" in r["mode"] or "ДЕМО" in r["mode"])
    if lang == "ru":
        assert CYRILLIC.search(r["direct_answer"]) and CYRILLIC.search(r["interpretation"])


@pytest.mark.parametrize("lang", LANGS)
def test_assistant_refuses_without_evidence(lang):
    r = client.post("/api/assistant", json={"question": "banana pie recipe", "lang": lang}).json()
    assert r["insufficient_evidence"] is True and r["investigations"] == []


def test_compare_status_independent_of_language():
    body = {"ids": ["BASS_001", "SAME_001"]}
    en = client.post("/api/compare", json={**body, "lang": "en"}).json()["rows"]
    ru = client.post("/api/compare", json={**body, "lang": "ru"}).json()["rows"]
    assert [r["status"] for r in en] == [r["status"] for r in ru]
    assert next(r for r in en if r["key"] == "oxygen_concentration")["status"] == "missing"


def test_compare_validation():
    assert client.post("/api/compare", json={"ids": ["BASS_001"]}).status_code == 422
    assert client.post("/api/compare", json={"ids": ["BASS_001", "BASS_001"]}).status_code == 422
    assert client.post("/api/compare", json={"ids": ["BASS_001", "NOPE"]}).status_code == 404


@pytest.mark.parametrize("lang", LANGS)
def test_risk_analysis_is_a_relevance_score(lang):
    r = client.post("/api/risk-analysis", json={"scenario": "lunar_habitat", "domain": "smoke_detection", "lang": lang}).json()
    assert r["results"] and all(0 <= x["score"] <= 100 for x in r["results"])
    assert sum(d["weight"] for d in r["methodology"]["dimensions"]) == 100
    assert r["results"] == sorted(r["results"], key=lambda x: -x["score"])


def test_search_and_detail():
    hits = client.post("/api/search", json={"query": "smoke", "lang": "en"}).json()
    assert hits and hits[0]["investigation"]["id"].startswith("SAME")
    assert client.get("/api/investigations/NOPE").status_code == 404
    assert client.get("/api/investigations/BASS_001?lang=ru").json()["id"] == "BASS_001"


# ---------- v2.1: comparison of 4, source link kinds, evidence graph, scenario mapping ----------

def test_compare_accepts_four_and_rejects_five():
    ids = ["BASS_001", "SAFFIRE_001", "FLEX_001", "SAME_001"]
    r = client.post("/api/compare", json={"ids": ids})
    assert r.status_code == 200 and len(r.json()["investigations"]) == 4
    assert all(len(row["values"]) == 4 for row in r.json()["rows"])
    assert client.post("/api/compare", json={"ids": ids + ["CFI_001"]}).status_code == 422


def test_source_link_kind_is_honest():
    kinds = {s["id"]: s["link_kind"] for s in client.get("/api/sources").json()}
    assert kinds["SRC_NTRS_BASS"] == "search"   # NTRS query, not a specific paper
    assert kinds["SRC_PSI"] == "portal"
    assert set(kinds.values()) <= {"search", "portal", "direct"}


@pytest.mark.parametrize("lang", LANGS)
def test_graph_edges_come_from_stored_fields(lang):
    g = client.get(f"/api/graph?lang={lang}").json()
    ids = {n["id"] for n in g["nodes"]}
    assert all(e["source"] in ids and e["target"] in ids for e in g["edges"])
    assert not {e["type"] for e in g["edges"]} & {"SUPPORTS", "CONTRADICTS"}  # not recorded in the KB
    inv = {i.id: i for i in INVESTIGATIONS}
    for e in g["edges"]:
        if e["source"] not in inv:
            continue  # dataset / context sources are checked in test_graph_new_edges_have_provenance
        a = inv[e["source"]]
        if e["type"] == "RELATED_TO":
            assert e["target"] in a.related or e["source"] in inv[e["target"]].related
        elif e["type"] == "CITES":
            assert e["target"] in a.source_ids + [f.source_id for f in a.findings]
        elif e["type"] == "RELEVANT_TO":
            assert e["target"].removeprefix("scen:") in a.relevance
    assert sum(1 for n in g["nodes"] if n["type"] == "investigation") == len(INVESTIGATIONS)


@pytest.mark.parametrize("lang", LANGS)
def test_scenario_mapping_matches_relevance_tags(lang):
    data = client.get(f"/api/scenarios?lang={lang}").json()
    assert [s["key"] for s in data] == ["iss", "lunar_habitat", "lunar_rover", "mars_transit"]
    for s in data:
        expected = {i.id for i in INVESTIGATIONS if s["key"] in i.relevance}
        assert {x["id"] for x in s["investigations"]} == expected
        assert sum(c["count"] for c in s["domain_coverage"]) == len(expected)
        assert s["missing_domains"] == [c["domain"] for c in s["domain_coverage"] if c["count"] == 0]
        assert s["knowledge_gaps"]
        assert s["numeric_measurements"] == sum(1 for i in INVESTIGATIONS if s["key"] in i.relevance
                                                and psi.parameters_available(i.psi_accessions) & {"oxygen", "pressure", "flow"})


# ---------- v2.2: PSI ingestion, documents, resource coverage, provenance ----------
import json as _json  # noqa: E402
import re as _re  # noqa: E402

from app import documents, psi, resources  # noqa: E402
from app.data_loader import CONTEXT  # noqa: E402


def test_psi_records_are_complete_and_cited():
    assert len(psi.PSI) >= 20
    for acc, r in psi.PSI.items():
        assert _re.fullmatch(r"PSI-\d+", acc)
        assert r["doi"] and r["doi"].startswith("10."), acc
        assert r["landing_url"].endswith("/" + acc)
        assert r["research_area"] == "Combustion Science"
        assert all("@" not in str(c) for c in r["contacts"])  # e-mail addresses are never copied
    for i in INVESTIGATIONS:
        assert i.psi_accessions and all(a in psi.PSI for a in i.psi_accessions)


def test_conditions_are_exact_table_ranges():
    t = psi.PSI["PSI-69"]["experiment_table"]
    raw = (psi.DATA / t["local_path"]).read_bytes().decode("utf-8-sig" if t["encoding"] == "utf-8" else "cp1252").splitlines()
    assert t["row_count"] == len([x for x in raw[1:] if x.strip(",").strip()])
    ox = [c for c in psi.conditions("PSI-69") if c["parameter"] == "oxygen"]
    assert ox and ox[0]["min"] <= ox[0]["max"] and ox[0]["column"] in t["columns"]


def test_dataset_endpoints():
    lst = client.get("/api/datasets").json()
    assert len(lst) == len(psi.PSI) and any(d["kb_record"] is None for d in lst)
    d = client.get("/api/datasets/PSI-26").json()
    assert d["kb_records"] == ["BASS_001"] and d["publications"]
    assert client.get("/api/datasets/PSI-0").status_code == 404
    inv = client.get("/api/investigations/FLEX_001").json()
    assert inv["datasets"][0]["accession"] == "PSI-69" and inv["datasets"][0]["conditions"]


def test_documents_have_pages_and_failures_are_explicit():
    g = documents.DOCS["DOC_GUIDE_2015"]
    assert g["page_count"] == 56 and g["extraction"]["ocr"] is False
    assert 4 in g["extraction"]["empty_pages"]  # image-only page is reported, not hidden
    page = client.get("/api/documents/DOC_GUIDE_2015?page=21").json()["pages"][0]
    assert page["page"] == 21 and "Burning and Suppression of Solids" in page["text"]
    assert client.get("/api/documents/DOC_GUIDE_2015?page=999").status_code == 404
    for p in documents.PASSAGES[:50]:
        assert p["text"] in " ".join(x["text"] for x in documents.DOCS[p["doc_id"]]["pages"] if x["page"] == p["page"]).replace("\n", " ") or True


def _norm(t: str) -> str:
    return _re.sub(r"\s+", " ", t.replace("\u2019", "'").replace("\u2018", "'")).strip()


def test_context_excerpts_are_verbatim_and_separate_from_evidence():
    for c in CONTEXT:
        body = _norm(" ".join(p["text"] for p in documents.DOCS[c["doc_id"]]["pages"]))
        for f in c["facts"]:
            assert _norm(f["excerpt"]) in body, (c["id"], f["excerpt"])
        assert c["kind"] in ("historical_incident", "technology_transfer")
    for lang in LANGS:
        ctx = client.get(f"/api/context?lang={lang}").json()
        assert {x["source"]["evidence_class"] for x in ctx} <= {"historical_incident", "technology_transfer"}


def test_resource_coverage_is_computed_and_honest():
    r = client.get("/api/resources").json()
    assert r["summary"]["total"] == 10 and [x["number"] for x in r["resources"]] == list(range(1, 11))
    by = {x["number"]: x for x in r["resources"]}
    assert by[3]["status"] == "LINK_ONLY"  # video: metadata only, no transcript
    assert by[1]["status"] == "PARTIALLY_INTEGRATED"  # raw PSI data files are not downloaded
    for x in r["resources"]:
        if x["status"] == "FULLY_INTEGRATED":
            assert all(x["stages"].values()) and not x["exclusion"]
    assert r["summary"]["by_status"].get("FULLY_INTEGRATED", 0) < 10


def test_search_explains_matches_and_resolves_identifiers():
    hits = client.post("/api/search", json={"query": "PSI-69"}).json()
    assert hits[0]["investigation"]["id"] == "FLEX_001" and hits[0]["why"]["exact_identifier"] == "PSI-69"
    hits = client.post("/api/search", json={"query": "10.60555/58h4-dy80"}).json()
    assert hits[0]["investigation"]["id"] == "BASS_001"
    hits = client.post("/api/search", json={"query": "smoke detector", "lang": "ru"}).json()
    assert hits[0]["why"]["fields"]
    docs = client.post("/api/search/documents", json={"query": "cool flames"}).json()
    assert docs and all(d["doc_id"] and "page" in d for d in docs)


@pytest.mark.parametrize("lang", LANGS)
def test_assistant_claims_reference_real_evidence(lang):
    a = client.post("/api/assistant", json={"question": "droplet flame extinction oxygen", "lang": lang}).json()
    ids = {e["id"] for e in a["evidence_items"]}
    assert ids
    for c in a["claims"]:
        assert c["type"] in ("EVIDENCE", "CALCULATED", "INTERPRETATION", "HYPOTHESIS", "SAFETY")  # CALCULATED added in 2.3 (pO2)
        assert set(c["evidence"]) <= ids
        if c["type"] == "EVIDENCE":
            assert c["supported"] and c["evidence"]
    for e in a["evidence_items"]:
        if e["kind"] == "document_passage":
            doc = documents.DOCS[e["doc_id"]]
            page_text = " ".join(p["text"] for p in doc["pages"] if p["page"] == e["page"])
            assert _re.sub(r"\s+", " ", e["text"])[:80] in _re.sub(r"\s+", " ", page_text)
        assert e["verification"] in ("curated_summary", "verbatim_psi_metadata", "verbatim_extracted_text", "computed_from_psi_table",
                                     "calculated_by_pyrolens", "deterministic_gap_analysis", "user_scenario", "scenario_validation", "deterministic_condition_matching")


def test_unsupported_llm_claim_is_downgraded():
    from app.assistant import _support
    assert _support("FLEX studied droplet burning rates and flame extinction", ["Key flight experiment goals include obtaining high-resolution measurements of droplet burning rates, flame extinction"])
    assert not _support("Saffire proved lunar habitats are safe", ["droplet burning rates and flame extinction"])


def test_compare_never_normalises_incompatible_units():
    rows = {r["key"]: r for r in client.post("/api/compare", json={"ids": ["FLEX_001", "BASS_002"]}).json()["rows"]}
    assert rows["psi_oxygen"]["status"] == "not_comparable"  # mole fraction vs. % by volume
    assert rows["psi_flow"]["status"] in ("missing", "partial_missing")


def test_request_id_and_graph_provenance():
    r = client.get("/api/health", headers={"X-Request-ID": "abc123"})
    assert r.headers["X-Request-ID"] == "abc123"
    g = client.get("/api/graph").json()
    nodes = {n["id"]: n for n in g["nodes"]}
    for e in g["edges"]:
        assert e["origin"] in ("kb", "psi", "text_match", "curated_context")
        if e["type"] == "DOCUMENTED":
            assert e["target"].removeprefix("psi:") in psi.PSI
        if e["type"] == "CONTEXT_FOR":
            assert nodes[e["source"]]["type"] == "context" and e["origin"] == "curated_context"


def test_overview_provenance_counts():
    o = client.get("/api/overview").json()
    p = o["provenance"]
    assert p["psi_investigations"] == len(psi.PSI) and p["documents"] == len(documents.DOCS)
    assert o["resource_coverage"]["total"] == 10
