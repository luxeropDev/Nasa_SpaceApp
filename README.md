# PyroLens — Scientific Evidence Intelligence for Spacecraft Fire Safety

> From experimental data to engineering evidence.

PyroLens 3.0 is an independent research workspace for exploring NASA Physical Sciences Informatics (PSI) combustion records. It preserves source values and provenance, normalizes units, distinguishes measured/derived/assumed/missing information, and uses deterministic rules for scenario matching, evidence coverage, and gap classification.

PyroLens is **not affiliated with or endorsed by NASA**, is not a fire simulator or certification tool, and must not be used as operational safety guidance. Matching bands and coverage labels are evidence-navigation aids, not probabilities of safety or proof of physical equivalence.

## What is in this repository

- React, Vite, TypeScript, Tailwind, and Recharts frontend with English/Russian localization and light/dark themes.
- FastAPI/Pydantic backend with the legacy research API plus PyroLens evidence endpoints.
- Deterministic observation eligibility, gas/diluent semantics, flow-configuration compatibility, scenario matching, multidimensional coverage, experiment passports, and evidence reports.
- A reviewable validation set whose status is **PENDING INDEPENDENT DOMAIN-EXPERT REVIEW**.

The checkout at commit `9c50b9b` contains the PyroLens 3.0 scientific backend, while the available frontend is the earlier screen set rather than the reported unpushed Coverage Intelligence redesign. Core visible branding has been updated without rewriting those working screens. See [the final report](docs/PYROLENS_3_0_FINAL_REPORT.md) for the verified scope and handoff discrepancy.

## Requirements

- Python 3.10 or newer
- Node.js 18 or newer and npm
- Two free local ports (defaults: backend `8000`, frontend `5173`)

No LLM key is required. Without one, the assistant returns a deterministic local response and labels `llm_used` as false.

## Windows PowerShell quick start

Backend, terminal 1:

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

If `python` is unavailable but `uv` is installed:

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\backend
$env:UV_CACHE_DIR = "D:\QASH\Works\Nasa_SpaceApp\.uv-cache"
uv run --with-requirements requirements.txt uvicorn app.main:app --reload --port 8000
```

Frontend, terminal 2:

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Open <http://127.0.0.1:5173>. Interactive backend documentation is at <http://127.0.0.1:8000/docs>. The Vite development server proxies `/api`, `/docs`, and `/openapi.json` to port 8000.

If either default port is occupied, preserve the existing process and choose unused ports. When changing the backend origin or frontend port, update the Vite proxy or `PYROLENS_CORS_ORIGINS` accordingly.

## Configuration

The backend does not load `.env` automatically. Set variables in the launching shell or through the deployment environment; never commit API keys.

| Variable | Purpose | Default |
|---|---|---|
| `OPENAI_API_KEY` | Enable OpenAI synthesis | unset |
| `OPENAI_MODEL` | OpenAI model | `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | Enable Anthropic synthesis when OpenAI is unset | unset |
| `ANTHROPIC_MODEL` | Anthropic model | `claude-3-5-haiku-latest` |
| `PYROLENS_CORS_ORIGINS` | Comma-separated browser origins | Vite localhost origins |
| `PYROLENS_AI_RATE_PER_MIN` | Assistant requests per client per minute | `20` |
| `PYROLENS_LOG_LEVEL` | Backend log level | `INFO` |

Legacy `FLAMEWISE_CORS_ORIGINS`, `FLAMEWISE_AI_RATE_PER_MIN`, and `FLAMEWISE_LOG_LEVEL` names remain accepted, but the `PYROLENS_*` names take precedence.

## API

The original endpoints remain available, including `/api/health`, `/api/investigations`, `/api/search`, `/api/assistant`, `/api/compare`, `/api/graph`, and `/api/scenarios`.

PyroLens evidence endpoints include:

- `GET /api/evidence/summary`, `/api/evidence/quality`
- `GET /api/evidence/datasets/{accession}/measurements`, `/issues`, `/rows/{row}`
- `GET /api/passports`, `/api/passports/{accession}`
- `GET /api/coverage/map`, `/matrix`, `/pairs`, `/explore`, `/observations`
- `GET /api/atlas`, `/api/scenario-presets`
- `POST /api/scenario/validate`, `/api/match`, `/api/gaps`, `/api/evidence/report`
- `GET|POST /api/evidence/export`

`POST /api/assistant` optionally accepts a complete `scenario` object. Deterministic matching and gap results are calculated before any optional LLM synthesis. A fallback or mocked response is not evidence of live-LLM operation.

## Verification

Backend:

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\backend
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
python -m validation.run_validation
```

Frontend:

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\frontend
npm ci
npm run typecheck
npm run build
```

This checkout has no configured frontend component-test or Playwright scripts, so those suites cannot be run from the available files. See the final report for the dated verification record.

## Scientific documentation

- [Scientific methods](docs/SCIENTIFIC_METHODS.md)
- [External expert review package](docs/EXTERNAL_EXPERT_REVIEW_PACKAGE.md)
- [PyroLens 3.0 final report](docs/PYROLENS_3_0_FINAL_REPORT.md)
- [Scientific data provenance](docs/SCIENTIFIC_DATA_PROVENANCE.md)
- Machine-readable cases: `backend/validation/reference_set.json`

Raw PSI values, headers, units, cell locations, ambiguity flags, and provenance are retained. Absence of a match in the selected PyroLens collection does not mean that a phenomenon has never been studied.
