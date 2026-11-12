import os

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import analysis, assistant, compare as cmp, graph, i18n_data, scenarios, scoring
from .data_loader import DATASET_VERSION, INV, INVESTIGATIONS, SOURCES
from .models import AssistantRequest, CompareRequest, Lang, RiskRequest, SearchRequest
from .retrieval import INDEX

i18n_data.verify(INVESTIGATIONS, SOURCES)  # fail fast if any translation is missing

app = FastAPI(title="FLAMEWISE API", version="2.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(Exception)
async def on_error(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": f"Internal error: {type(exc).__name__}"})


@app.get("/api/health")
def health():
    llm = "openai" if os.getenv("OPENAI_API_KEY") else ("anthropic" if os.getenv("ANTHROPIC_API_KEY") else None)
    return {"status": "operational", "dataset_version": DATASET_VERSION, "llm_provider": llm, "llm_live": llm is not None, "mode": "LIVE LLM" if llm else "DEMO / LOCAL KNOWLEDGE MODE"}


@app.get("/api/overview")
def overview(lang: Lang = Query("en")):
    return analysis.overview(lang)


@app.get("/api/investigations")
def investigations(lang: Lang = Query("en")):
    return [i.model_dump() for i in i18n_data.invs(lang)[0]]


@app.get("/api/investigations/{inv_id}")
def investigation(inv_id: str, lang: Lang = Query("en")):
    i = i18n_data.invs(lang)[1].get(inv_id)
    if not i:
        raise HTTPException(404, f"Investigation '{inv_id}' not found")
    return i.model_dump()


@app.get("/api/sources")
def sources(lang: Lang = Query("en")):
    return [s.model_dump() for s in i18n_data.srcs(lang)[0]]


@app.get("/api/insights")
def insights(lang: Lang = Query("en")):
    return analysis.insights(lang)


@app.post("/api/search")
def search(req: SearchRequest):
    by_id = i18n_data.invs(req.lang)[1]
    return [{"score": round(s, 3), "investigation": by_id[i.id].model_dump()} for i, s in INDEX.search(req.query, req.limit)]


@app.post("/api/assistant")
def assist(req: AssistantRequest):
    return assistant.answer(req.question, req.lang)


@app.post("/api/compare")
def compare(req: CompareRequest):
    if len(set(req.ids)) != len(req.ids):
        raise HTTPException(422, "Select distinct investigations")
    bad = [i for i in req.ids if i not in INV]
    if bad:
        raise HTTPException(404, f"Unknown investigation id(s): {', '.join(bad)}")
    return cmp.compare(req.ids, req.lang)


@app.post("/api/risk-analysis")
def risk(req: RiskRequest):
    return scoring.analyze(req.scenario, req.domain, req.lang)


@app.get("/api/graph")
def evidence_graph(lang: Lang = Query("en")):
    return graph.build(lang)


@app.get("/api/scenarios")
def scenario_mapping(lang: Lang = Query("en")):
    return scenarios.mapping(lang)
