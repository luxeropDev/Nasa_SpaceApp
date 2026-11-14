# FLAMEWISE 2.0 — Repository Audit (2026-11-14)

Audit of the repository as found at the start of the 2.0 work (branch `main`, last commit `1eecac6 redesingn web`,
plus a large uncommitted redesign in the working tree: top navigation, hybrid light/dark zones, completeness flags).

## Architecture

```
frontend (React 18 + Vite 5 + TS strict + Tailwind 3 + Recharts + lucide-react)
  hash router (src/nav.ts) · lazy routes · I18nProvider (EN/RU) · ThemeProvider (localStorage "flamewise.theme")
  /api/* via Vite proxy -> :8000
backend (FastAPI + Pydantic 2, no database)
  data_loader -> data/investigations.json (15) + data/sources.json (9), RU overlay data/i18n_ru_*.json
  retrieval (BM25 + synonyms + RU stem map) · assistant (rule templates, optional OpenAI/Anthropic) · compare · scoring
  graph · scenarios · analysis (overview, gaps, insights)
```

**Routes** (`#/<view>/<id>?params`): overview, explorer (+ `/explorer/<id>` dossier), compare, assistant, intel, graph,
scenarios, reports, sources. *2.0 adds `datasets`; no existing path changed.*

**API (before 2.0):** `GET /api/health, /overview, /investigations, /investigations/{id}, /sources, /insights, /graph,
/scenarios`; `POST /api/search, /assistant, /compare, /risk-analysis`. All GETs accept `?lang=en|ru`.

**Data models:** `Investigation` (curated fields, `oxygen_concentration`/`airflow_speed` always null, findings with
`source_id`), `Source` (id/title/publisher/type/url/note + computed `link_kind`). No document, dataset or measurement
model.

**Sources (before):** PSI portal root, NASA root, seven NTRS *search* URLs. None pointed at a specific document; none of the
challenge's resources 02–10 were represented.

**Assets:** `docs/screenshots/*.png` (app screenshots, not NASA references), `frontend/public/favicon.svg`. Untracked:
`main_photo.jpg` (2560×1442) and `nasa_materials/` (3 screenshots: nasa.gov home hero, the challenge page header, and the
challenge resources list).

**Design tokens:** RGB-triplet CSS variables in `index.css` (`:root` light, `.dark`/`.zone-dark` dark, `.paper` print)
mapped in `tailwind.config.js` — already matching the requested palette. Fonts were Inter / IBM Plex Sans Condensed /
IBM Plex Mono.

**Theme persistence:** pre-paint script in `index.html` reads `flamewise.theme` (default light); `ThemeProvider` toggles
`.dark`. **Localization:** typed dictionaries; `ru: Record<Key,string>` makes missing Russian keys a compile error;
backend texts and data overlay verified at startup.

**Tests:** 24 pytest API/data-integrity tests (all passing at start). Frontend: `tsc --noEmit` only; no linter configured.

## Problems found

| Area | Finding |
|---|---|
| Data | No numerical data at all; all source links were catalog searches or portals; record_status admitted "not a full PSI export". |
| Resources | Challenge resources 02–10 absent; 01 represented only by the PSI site root. |
| Search | Single concatenated document per record; no identifiers beyond record id; no explanation of matches; no document search. |
| Assistant | Citations validated only by tag id; no evidence classes; no excerpts with page references. |
| Overview | Decorative "flame schematic" in the hero; supplied photograph unused. |
| Backend | CORS hard-coded to localhost; no request ids, no logging, no rate limit on the LLM endpoint. |
| Docs | README claimed "no photographs" and "no numeric data" — true then, false after 2.0. |

## Technical debt / risks

* PSI endpoints are undocumented (used by PSI's own web app) — mitigated by schema checks, manifest and hashes.
* The sandbox's TLS store could not verify spaceappschallenge.org; the page was read via the in-app browser.
* Recharts chunk is ~527 kB (lazy, only Overview/Intelligence).
* `oxygen_concentration`/`airflow_speed` fields remain for API compatibility but stay null by design.

## Priorities chosen

1. Real data: PSI ingestion (metadata, DOIs, publications, experiment tables) linked to existing records.
2. Real documents: Researcher's Guide + NASA pages with page-addressed passages.
3. Computed resource coverage; evidence classes; historical/tech-transfer separation.
4. Evidence-first assistant, explained search, comparison of published conditions without normalisation.
5. Overview with the supplied photo; source library; PSI experiments catalog; typography.
6. Backend hardening, tests, docs.
