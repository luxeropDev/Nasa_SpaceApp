<div align="center">

# FLAMEWISE

**Scientific research intelligence for microgravity combustion and spacecraft fire safety**

*Understanding fire. Protecting the future.*

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Python_3-009688?logo=fastapi&logoColor=white)
![Pydantic](https://img.shields.io/badge/Pydantic-2-E92063?logo=pydantic&logoColor=white)

**English** · [Русский](README.ru.md)

</div>

> Built for the **NASA Space Apps Challenge 2026**. FLAMEWISE organises NASA microgravity combustion investigations (BASS, Saffire, FLEX, SAME, ACME, CFI, SPICE, SLICE, E-FIELD Flames) into searchable, comparable, source-linked evidence for spacecraft fire safety research. It is an independent project — **not affiliated with or endorsed by NASA**.

---

## ✨ Features

| Area | What it does |
| --- | --- |
| **Overview** | Cinematic hero (original SVG/CSS spherical-flame illustration), editorial metrics computed live from the knowledge base, one highlight per investigation program, source-linked insights, scenario × safety-domain **coverage matrix**, distributions, knowledge gaps, and an honest “no activity log” state (the data has no timestamps). |
| **Research Explorer** | Debounced BM25 search (backend), six data-derived filters (fuel, research domain, safety domain, mission scenario, hardware, gravity) with removable chips, list/grid views, BM25 score per hit, and a selection tray (up to 4) that feeds Compare and Reports. |
| **Experiment detail** | Findings with per-finding source links, conditions (unknown values shown as *Not available in source data*), curated mission relevance (labelled *contextual assumption*), limitations, every source with its link type, related records, prev/next, and actions (select, compare, report, ask, show in graph). |
| **Compare Experiments** | 2–4 investigations side by side (backend `/api/compare`), same/different/missing status per parameter, “differences only”, sticky parameter column, shareable URLs, **CSV and Markdown export**. No unit conversion is performed because no numerical values are stored — the UI says so. |
| **AI Assistant** | Conversation thread, multiline composer (Enter / Shift+Enter), suggested questions, **numbered interactive citations** that highlight the exact supporting excerpt and its source in a “Sources supporting this answer” panel, epistemic labels (*Source record*, *Template summary* / *AI-generated*, *Contextual assumption*, *Missing evidence*), and a status badge that reflects the backend (*Live AI*, *Demo*, *Offline*). Minimal safe Markdown renderer (no `innerHTML`). |
| **Fire Safety Intelligence** | The existing 0–100 **research relevance score** (unchanged formula), shown as a radial gauge with per-component contribution bars (`value × weight = points`), a ranking, a stacked composition chart, the methodology table, and a panel separating *measurements* (none stored), *derived metrics*, *contextual assumptions* and *unknown parameters*. Never labelled as a probability. |
| **Evidence Graph** *(new)* | Interactive SVG graph built by `/api/graph` **only from stored fields** (`related`, `source_ids`, findings’ `source_id`, `research_domain`, `fire_safety_domain`, `fuel_type`, `relevance`). Zoom/pan, hover highlighting, node-type filters, search, details panel, and an accessible list view. No SUPPORTS/CONTRADICTS edges — the data does not record them. Custom deterministic force layout, no graph library. |
| **Mission Scenarios** *(new)* | Research mapping (not a simulation) for ISS, lunar habitat, lunar rover and Mars transit via `/api/scenarios`: relevant records, safety-domain coverage, missing domains, scenario knowledge gaps, limitations, sources, and the curator’s relevance notes. |
| **Reports** *(new)* | Structured research report from 1–4 selected records: branding, title, generation timestamp, records with conditions/findings/limitations, comparison table, optional assistant analysis, methodology, limitations and numbered references with URLs and link type. **Print / Save as PDF** via the browser’s print dialog (dedicated print stylesheet) and **Markdown download**. |
| **Navigation groups** | **Research:** Research Explorer, Experiment Comparison · **Intelligence:** AI Research Assistant, Fire Safety Intelligence, Evidence Graph, Mission Scenario Analysis · **Resources:** Research Reports, Data Sources, API documentation (the backend’s `/docs`), About FLAMEWISE (dialog). Experiment detail pages live under Research Explorer; no separate “Experiments” page exists, so none is listed. |
| **Data Sources** | Every source with publisher, type, URL, note, citation count and an honest **link type**: *Direct document*, *Catalog search* or *Portal*. |

**Application shell:** no sidebar — a sticky, full-width **horizontal top navigation** (logo · Overview · Research ▾ · Intelligence ▾ · Resources ▾ · search · status · EN/RU · theme). Dropdowns open on click, close on outside click or Esc, only one is open at a time, support arrow keys, and highlight the active route; the bar gains opacity and blur once the page scrolls. Below 1024 px it collapses to a compact bar with a full-width menu of expandable categories. Plus a **global search palette** (Ctrl/⌘+K or `/`: records via BM25, pages, “ask the assistant”), EN/RU switch, dark/light theme, about & system-status dialog, skip link, focus management, toasts, skeletons, reduced-motion support, route-level code splitting.

## 🔬 Scientific honesty

- The knowledge base is a **curated starter set** (15 records, 9 sources) — not a PSI export. It was **not expanded** in this upgrade: no additional records could be verified against primary sources in this environment, and nothing was added to “fill” the UI.
- **No numerical experimental results are stored.** Unknown values are `null` and displayed as *Not available in source data*.
- Source URLs are NASA portals and **NTRS catalog searches**, not specific papers. The API now exposes `link_kind` (`search` / `portal` / `direct`) and the UI shows it next to every link.
- Mission-relevance tags and score weights are **contextual assumptions** and are labelled as such.
- The relevance score is **not** a probability of fire, ignition or failure.
- The hero image is an **original illustration**, captioned “not data”. A suggested stock video was evaluated and rejected (unrelated content, unknown licence).
- No activity feed, telemetry or historical statistics are shown, because the data contains none.

## 🏗️ Architecture

```
React 18 + Vite (TypeScript strict, Tailwind, Recharts, lucide-react)
   │  hash routing · lazy routes · I18nProvider · ThemeProvider · ToastProvider · selection store
   │  fetch /api/*?lang=en|ru   (Vite dev proxy → :8000)
   ▼
FastAPI + Pydantic
   ├─ data_loader  → data/investigations.json, data/sources.json (English, canonical)
   ├─ i18n_data    → Russian overlay (data/i18n_ru_*.json), verified at startup
   ├─ retrieval    → BM25 + synonyms (+ Russian stem → English term mapping)
   ├─ assistant    → select → aggregate evidence → optional LLM → validate citations
   ├─ compare      → per-parameter same / different / missing (language-independent), 2–4 ids
   ├─ scoring      → transparent relevance score (5 weighted dimensions)
   ├─ graph        → evidence graph from stored fields only            (new)
   └─ scenarios    → scenario research mapping (coverage, gaps, limits) (new)
```

### Frontend structure

```
frontend/src/
├── components/
│   ├── layout/      AppShell (frame), TopNav (desktop dropdowns + mobile menu + status), CommandSearch, navItems (IA)
│   ├── research/    ResearchCard, SourceLink (+ LinkKindBadge)
│   ├── assistant/   Markdown (safe renderer with citation hook)
│   ├── ui.tsx       Page, Panel, Chip, Segmented, SearchInput, Empty, Field, NotAvailable, EpistemicTag, skeletons, errors
│   ├── charts.tsx   Meter, Stat, RadialScore, tooltip style
│   ├── HeroAtmosphere.tsx, Logo.tsx, Dialog.tsx, Toast.tsx, Switchers.tsx
├── views/           Overview, Explorer(+Detail, Filters), Comparator(+CompareTable), Assistant(+AnswerView),
│                    Intelligence(+IntelResults), EvidenceGraph, Scenarios, Reports, Sources
├── i18n/            en.ts (source of truth), ru*.ts (ru_v2.ts holds v2 strings), provider
├── selection.ts     cross-page selection (sessionStorage)
├── api.ts nav.ts theme.tsx index.css
```

### Design system

Tokens live in `frontend/src/index.css` as RGB triplets (dark is the primary theme; a full light theme is defined separately, not inverted). Inter (300–900) for UI, IBM Plex Mono for identifiers and technical labels. Radius tokens: 8 px controls, 10 px buttons, 14 px cards, 20 px large surfaces/dialogs. Reusable `.btn-cut`, `.btn-cut-border`, `.btn-cut-sm` octagonal buttons are used only for hero CTAs and primary research actions. Motion: `fadeUp` / `fadeIn` with `cubic-bezier(0.16, 1, 0.3, 1)`, transform/opacity only, disabled under `prefers-reduced-motion`.

## 🧰 Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 5, TypeScript 5, Tailwind CSS 3, Recharts 2, lucide-react |
| Backend | Python 3, FastAPI, Pydantic 2, Uvicorn, httpx |
| Retrieval | In-process BM25 (no external services). Semantic search is **not** implemented. |
| LLM (optional) | OpenAI Chat Completions or Anthropic Messages via environment variables |
| Tests | pytest (API + data integrity); TypeScript strict type-check |

No new runtime dependencies were added in v2 (graph, Markdown, PDF/print and exports are implemented in-house).

## 🚀 Getting started

**Requirements:** Python 3.10+ and Node.js 18+.

```bash
# backend (terminal 1)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# frontend (terminal 2)
cd frontend
npm install
npm run dev          # http://localhost:5173  (proxies /api and /docs → :8000)
```

Interactive API docs: <http://localhost:8000/docs>.

## ⚙️ Configuration

The app runs without configuration. Optionally enable live LLM synthesis by exporting variables **before** starting uvicorn (see [`.env.example`](.env.example)):

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | Enables OpenAI synthesis (takes priority) | unset |
| `OPENAI_MODEL` | OpenAI model | `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | Enables Anthropic synthesis | unset |
| `ANTHROPIC_MODEL` | Anthropic model | `claude-3-5-haiku-latest` |

If a key is set but the call fails, the assistant falls back to the local answer and reports the failure — it never pretends an LLM answered. The backend does not load `.env` files itself.

## 🔌 API

All GET endpoints and POST bodies accept `lang` (`en` | `ru`, default `en`); other values return `422`.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/health` | Status, dataset version, LLM mode |
| GET | `/api/overview` | KPIs, distributions, coverage matrix, gaps |
| GET | `/api/investigations` | All investigations |
| GET | `/api/investigations/{id}` | One investigation (`404` if unknown) |
| GET | `/api/sources` | Sources, now including computed `link_kind` (`search` · `portal` · `direct`) |
| GET | `/api/insights` | Evidence-linked insights |
| GET | `/api/graph` | **New.** `{nodes, edges}`; each edge has `type` and the stored field it derives from (`basis`) |
| GET | `/api/scenarios` | **New.** Per-scenario records, domain coverage, missing domains, gaps, limitations, sources |
| POST | `/api/search` | BM25 search `{query, limit}` |
| POST | `/api/assistant` | Structured answer `{question}` |
| POST | `/api/compare` | Compare `{ids: [2–4 ids]}` (was 2–3; additive change) |
| POST | `/api/risk-analysis` | Relevance ranking `{scenario, domain}` |

All changes are additive; existing request/response shapes are unchanged.

## 🛠️ Development & testing

```bash
# backend (from /backend)
pip install -r requirements-dev.txt
python -m pytest -q          # 24 tests: API, data integrity, graph provenance, scenario mapping, 4-way compare

# frontend (from /frontend)
npm run typecheck            # strict TypeScript — also verifies every Russian key exists
npm run build
```

- **Add a UI string:** add it to `frontend/src/i18n/en.ts` and to a `ru_*.ts` file (the compiler rejects a missing Russian key).
- **Add an investigation:** add it to `investigations.json`, Russian text to `data/i18n_ru_records_*.json`, sources to `sources.json`. The backend refuses to start if a reference or translation is missing. Keep provenance: prefer direct document URLs and never invent numbers.

There is no ESLint configuration and no frontend unit-test suite yet.

## 🚢 Deployment

`npm run build` produces static files in `frontend/dist/`. Serve them from any static host and route `/api/*` (and optionally `/docs`, `/openapi.json`) to the FastAPI app (`uvicorn app.main:app`). The backend’s CORS allow-list contains only the Vite dev origins; when serving the frontend from another origin, either reverse-proxy `/api` on the same origin (recommended) or extend `allow_origins` in `backend/app/main.py`.

## ⚠️ Known limitations

- Small curated dataset (15 records); no numerical measurements; sources are catalog searches/portals rather than specific documents.
- PDF export uses the browser’s print dialog (“Save as PDF”), not server-side rendering.
- The evidence graph reflects curated cross-references; it does not encode scientific support or contradiction.
- No timestamps in the data → no research activity feed.
- Screenshots in `docs/screenshots/` show the **v1 interface** and have not been re-captured after the redesign.
- No authentication (none is needed for this read-only tool).

## 🗺️ Roadmap

- [ ] Extract quantitative conditions (O₂, pressure, flow) from cited NTRS / PSI documents, with per-value provenance and retrieval dates
- [ ] Replace NTRS search links with verified direct document links
- [ ] Partial-gravity (lunar / Martian) coverage once sources are available
- [ ] Optional semantic retrieval alongside BM25
- [ ] Frontend component tests, ESLint and CI; re-capture screenshots

## 📄 License

**No license file is present**, so no open-source licence is granted yet. Recommendation for the maintainers: choose a permissive licence such as **MIT** or **Apache-2.0** for the code (Apache-2.0 adds an explicit patent grant), and keep NASA-derived text as references to public sources. Add a `LICENSE` file before redistributing or accepting outside contributions.

## 🙏 Acknowledgements

Research context comes from publicly described NASA investigations and the NASA PSI and NTRS portals. FLAMEWISE is an independent project and is **not affiliated with or endorsed by NASA**. The interface’s visual language was inspired by public design references; no third-party branding is used.

<div align="center"><sub>Not an operational or firefighting tool.</sub></div>
