"""API and data-integrity tests. Run from /backend:  python -m pytest -q"""
import json
import re

import pytest
from fastapi.testclient import TestClient

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
        assert s["knowledge_gaps"] and s["numeric_measurements"] == 0
