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
