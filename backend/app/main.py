import logging
import os
import time
import uuid
from collections import defaultdict, deque

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import analysis, assistant, compare as cmp, documents, graph, i18n_data, psi, resources, scenarios, scoring
from .data_loader import CONTEXT, DATASET_VERSION, INV, INVESTIGATIONS, SOURCES
from .models import AssistantRequest, CompareRequest, Lang, RiskRequest, SearchRequest
from .retrieval import INDEX
from .science.api import router as evidence_router

i18n_data.verify(INVESTIGATIONS, SOURCES)  # fail fast if any translation is missing

logging.basicConfig(level=os.getenv("PyroLens_LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("flamewise.api")

app = FastAPI(title="PyroLens API", version="2.3.0")
# Production origins come from the environment (comma-separated); the Vite dev server is allowed by default.
_origins = [o.strip() for o in os.getenv("PyroLens_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-Request-ID"],
                   expose_headers=["X-Request-ID"])

# Simple per-client sliding-window limit for the assistant endpoint (it may call a paid LLM).
AI_LIMIT = int(os.getenv("PyroLens_AI_RATE_PER_MIN", "20"))
_hits: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
    request.state.rid = rid
    if request.url.path == "/api/assistant" and request.method == "POST":
        key, now = (request.client.host if request.client else "?"), time.monotonic()
        q = _hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= AI_LIMIT:
            return JSONResponse(status_code=429, content={"detail": "Too many assistant requests; try again in a minute.", "request_id": rid},
                                headers={"X-Request-ID": rid, "Retry-After": "60"})
        q.append(now)
    t0 = time.perf_counter()
    resp = await call_next(request)
    resp.headers["X-Request-ID"] = rid
    log.info("%s %s %s %.0fms rid=%s", request.method, request.url.path, resp.status_code, (time.perf_counter() - t0) * 1000, rid)
    return resp


@app.exception_handler(Exception)
async def on_error(request: Request, exc: Exception):
    rid = getattr(request.state, "rid", "-")
    log.exception("unhandled error rid=%s", rid)
    return JSONResponse(status_code=500, content={"detail": f"Internal error: {type(exc).__name__}", "request_id": rid}, headers={"X-Request-ID": rid})


def enrich(inv: dict) -> dict:
    """Attach PSI dataset cards and document page mentions (both computed from ingested data)."""
    names = list(dict.fromkeys([inv["acronym"], inv["acronym"].split("-")[0]]))
    return {**inv, "datasets": [psi.summary(a) for a in inv["psi_accessions"]],
            "document_mentions": [m for m in documents.mentions(names)]}


app.include_router(evidence_router)


@app.get("/api/health")
def health():
    llm = "openai" if os.getenv("OPENAI_API_KEY") else ("anthropic" if os.getenv("ANTHROPIC_API_KEY") else None)
    return {"status": "operational", "dataset_version": DATASET_VERSION, "llm_provider": llm, "llm_live": llm is not None, "mode": "LIVE LLM" if llm else "DEMO / LOCAL KNOWLEDGE MODE"}


@app.get("/api/overview")
def overview(lang: Lang = Query("en")):
    return analysis.overview(lang)


@app.get("/api/investigations")
def investigations(lang: Lang = Query("en")):
    return [enrich(i.model_dump()) for i in i18n_data.invs(lang)[0]]


@app.get("/api/investigations/{inv_id}")
def investigation(inv_id: str, lang: Lang = Query("en")):
    i = i18n_data.invs(lang)[1].get(inv_id)
    if not i:
        raise HTTPException(404, f"Investigation '{inv_id}' not found")
    return enrich(i.model_dump())


@app.get("/api/sources")
def sources(lang: Lang = Query("en")):
    return [s.model_dump() for s in i18n_data.srcs(lang)[0]]


@app.get("/api/insights")
def insights(lang: Lang = Query("en")):
    return analysis.insights(lang)


@app.post("/api/search")
def search(req: SearchRequest):
    """Investigation search (BM25 + exact identifier match). Each hit explains which terms matched in which fields."""
    by_id = i18n_data.invs(req.lang)[1]
    return [{"score": round(s, 3), "investigation": enrich(by_id[i.id].model_dump()), "why": why}
            for i, s, why in INDEX.search_explained(req.query, req.limit)]


@app.post("/api/search/documents")
def search_documents(req: SearchRequest):
    """Full-text passage search over extracted documents, with document, page and section for every passage."""
    from .retrieval import normalize
    terms = normalize(req.query)
    return [{**p, "doc_title": documents.DOCS[p["doc_id"]]["title"]} for p in documents.search(terms, req.limit, min_score=1.0)]


@app.get("/api/resources")
def challenge_resources():
    return {"summary": resources.summary(), "resources": resources.coverage()}


@app.get("/api/datasets")
def datasets():
    linked = {a: i.id for i in INVESTIGATIONS for a in i.psi_accessions}
    return [{**psi.summary(a), "kb_record": linked.get(a)} for a in sorted(psi.PSI, key=lambda x: int(x.split("-")[1]))]


@app.get("/api/datasets/{acc}")
def dataset(acc: str):
    r = psi.full(acc)
    if not r:
        raise HTTPException(404, f"PSI dataset '{acc}' not found")
    return {**r, "kb_records": [i.id for i in INVESTIGATIONS if acc in i.psi_accessions]}


@app.get("/api/documents")
def document_list():
    return [documents.meta(d) for d in documents.DOCS.values()]


@app.get("/api/documents/{doc_id}")
def document(doc_id: str, page: int | None = Query(None, ge=1)):
    d = documents.DOCS.get(doc_id)
    if not d:
        raise HTTPException(404, f"Document '{doc_id}' not found")
    pages = d["pages"] if page is None else [p for p in d["pages"] if p["page"] == page]
    if page is not None and not pages:
        raise HTTPException(404, f"Page {page} not in document '{doc_id}'")
    return {**documents.meta(d), "pages": pages}


@app.get("/api/context")
def context_records(lang: Lang = Query("en")):
    """Historical incidents and technology-transfer cases. Kept separate from experimental evidence."""
    _, src = i18n_data.srcs(lang)
    out = []
    for c in CONTEXT:
        s = src[c["source_id"]]
        out.append({"id": c["id"], "kind": c["kind"], "year": c["year"], "title": c["title"][lang], "source": s.model_dump(), "doc_id": c["doc_id"],
                    "facts": [{"text": f[lang], "excerpt": f["excerpt"]} for f in c["facts"]], "relevance": c["relevance"][lang],
                    "related_investigations": c["related_investigations"]})
    return out


@app.post("/api/assistant")
def assist(req: AssistantRequest):
    scen = None
    if req.scenario is not None:
        from .science.scenario import ScenarioTarget
        try:
            scen = ScenarioTarget(**req.scenario)
        except Exception as e:  # pydantic validation error -> 422 with detail
            raise HTTPException(422, {"errors": [{"field": "scenario", "code": "invalid_scenario", "detail": str(e)[:300]}]})
    return assistant.answer(req.question, req.lang, scen)


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
