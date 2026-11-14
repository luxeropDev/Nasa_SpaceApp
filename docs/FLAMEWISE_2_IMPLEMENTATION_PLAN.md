# FLAMEWISE 2.0 — Implementation Plan and Status

| Stage | Scope | Status |
|---|---|---|
| 1 Repository audit | `docs/FLAMEWISE_2_AUDIT.md` | done |
| 2 Challenge resource audit | all 10 resources opened and read; `docs/RESOURCE_COVERAGE_AUDIT.md`; `/api/resources` | done |
| 3 Data architecture | `ingest/psi_ingest.py`, `ingest/documents.py`, `app/psi.py`, `app/documents.py`, `app/resources.py`, `context_records.json`; `Investigation.psi_accessions`; extended `Source` | done |
| 4 Tokens & typography | Inter / Public Sans / DM Mono; existing CSS-variable palette kept; decorative grid CSS removed | done |
| 5 Navigation | existing horizontal top nav kept (keyboard, Esc, active route, mobile menu); *Experiments (PSI datasets)* added under Research | done |
| 6 Overview | photo-led hero with supplied image; provenance-driven status; challenge-resource panel; ingestion record | done |
| 7 Explorer | per-field "why it matched", exact PSI-ID/DOI match, PSI IDs on rows, document passage hits | done |
| 8 Dossier | PSI dataset identity, published conditions, publications (DOI), document mentions with pages, safety context, source dates | done |
| 9 Assistant | evidence items (verbatim / curated), typed claims, LLM claim validation, safety note | done |
| 10 Compare & Intelligence | PSI condition rows with *not comparable* status; evidence dimension uses PSI tables; methodology unchanged | done |
| 11 Graph & Scenarios | dataset/document/context nodes, edge `origin`; scenario dataset list and computed numeric-coverage count | done |
| 12 Reports & Sources | PSI datasets and DOIs in reports (print + Markdown); source library, document reader, context cards | done |
| 13 Localization & responsive | all new strings EN + RU (compile-time checked); mobile overflow checked on 7 routes | done |
| 14 Testing | 37 backend tests, `tsc`, production build, in-browser route checks | done |

## Not done / deferred (deliberately)

* **Semantic / vector search** — not added: 267 passages + 15 records do not justify a vector store; BM25 with field
  weights and explanations is used instead.
* **OCR** — the only image-only page is the Guide's page 4; no OCR was run, and this is reported.
* **ScienceCasts transcript** — no caption track was retrieved; the video stays LINK_ONLY.
* **New curated records** for the six unlinked PSI investigations (DAFT, ground studies) — they appear in the
  Experiments catalog but not as curated records (curation and Russian translation would be required).
* **Raw PSI data files** (images, video, raw sensor data, up to ~150 GB per investigation) — not downloaded.
* **Persistent claim-level entailment** — claim support is a lexical check, not semantic entailment.
