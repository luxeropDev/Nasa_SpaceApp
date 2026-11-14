# FLAMEWISE 2.0 — Changelog

## Data and ingestion
* **New** `backend/ingest/psi_ingest.py` — NASA PSI connector (search → investigation JSON → experiment-table CSV →
  `data/psi_records.json`, `data/psi/tables/*.csv`, `data/psi/manifest.json`). 24 Combustion Science investigations.
* **New** `backend/ingest/documents.py` + `document_registry.json` — page-by-page PDF extraction (pdftotext) and
  marker-bounded HTML extraction → `data/documents/*.json` (8 documents, 63 pages, 267 passages).
* **New** `data/context_records.json` — Apollo 1, Apollo 13, Mir 1997, three Spinoffs; EN/RU facts with verbatim excerpts.
* `investigations.json`: every record gains `psi_accessions` (18 accessions linked). `numeric_data_status` is now computed.
* `sources.json`: 10 challenge resources added (category, evidence class, verification, dates, authors, report number).
* `.gitignore`: `backend/data/raw/` (raw downloads are reproducible and not committed).

## Backend API (additive; existing contracts preserved)
* `GET /api/resources` — computed coverage of the ten challenge resources.
* `GET /api/datasets`, `GET /api/datasets/{PSI-ID}` — PSI records with published conditions.
* `GET /api/documents`, `GET /api/documents/{id}?page=n` — extracted documents.
* `POST /api/search/documents` — passage search with document/page/section.
* `GET /api/context` — historical incidents / technology transfer (separate class).
* `POST /api/search` — adds `why` (per-field matched terms, exact identifier); PSI fields indexed; PSI-ID/DOI exact match.
* `GET /api/investigations[/id]` — adds `psi_accessions`, `datasets`, `document_mentions`.
* `POST /api/assistant` — adds `evidence_items`, `claims`, `context`, `safety_note`; LLM claims validated.
* `POST /api/compare` — adds `psi_*` rows with `reference` / `same_basis` / `not_comparable` statuses.
* `GET /api/graph` — adds dataset / document / context nodes, DOCUMENTED / PSI_RELATED / MENTIONED_IN / CONTEXT_FOR edges,
  and `origin` on every edge.
* `GET /api/overview` — adds `provenance` and `resource_coverage`. `GET /api/scenarios` — adds `datasets`, computed
  `numeric_measurements`.
* Hardening: `X-Request-ID` on every response, structured request logging, `FLAMEWISE_CORS_ORIGINS`,
  `FLAMEWISE_AI_RATE_PER_MIN` (429 with `Retry-After`), error responses include the request id.

## Frontend
* **New** Experiments (PSI datasets) view `#/datasets`; listed under Research.
* **New** `components/research/Evidence.tsx` — EvidenceClassTag, ClaimTag, VerificationBadge, StatusBadge, CitationBlock,
  ConditionsTable, DatasetMeta.
* Overview: photo-led hero (supplied image, WebP/JPEG 960/1600/2400 w, preloaded), backend-computed KPIs, dataset status
  from provenance, challenge-resource panel, ingestion record. Flame schematic removed.
* Explorer: "why it matched", PSI IDs, document passage hits. Dossier: PSI dataset, conditions, publications, document
  mentions, safety context, source dates/verification.
* Assistant: typed statements linked to evidence ids; evidence panel with verbatim/curated badges, page, DOI.
* Compare: new statuses and monospace PSI rows. Graph: new node types (default filter shows research entities).
* Sources: coverage matrix, evidence-class library, document reader, context cards. Reports: PSI datasets + DOIs.
* Typography: Inter (headings), Public Sans (body), DM Mono (identifiers, numbers). Decorative grid CSS removed.
* Completeness: counts PSI-table oxygen/flow; new flag "PSI experiment table".
* i18n: `en_v4.ts` / `ru_v4.ts` (219 keys each, RU completeness enforced by the compiler); corrected outdated statements ("no numerical data").

## Tests
* 13 new backend tests (37 total): PSI integrity, exact table ranges, dataset endpoints, page-addressed documents,
  verbatim context excerpts, computed coverage, explained search, assistant evidence, LLM claim downgrade, unit-safe
  comparison, request id and graph provenance, overview counts.
