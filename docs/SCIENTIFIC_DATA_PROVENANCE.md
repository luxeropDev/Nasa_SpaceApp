# Scientific Data Provenance

FLAMEWISE separates seven kinds of content. Each item in the UI and API carries its class.

| Class | Where it lives | How it is produced | Shown as |
|---|---|---|---|
| Experimental data | `data/psi_records.json`, `data/psi/tables/*.csv` | `ingest/psi_ingest.py` from NASA PSI | PSI dataset cards, conditions tables |
| Scientific publication | `data/documents/DOC_GUIDE_2015.json`; PSI publication lists | `ingest/documents.py`; PSI metadata | verbatim passages with page; DOI list |
| Background | `data/documents/DOC_NASA_COMBUSTION.json` | `ingest/documents.py` | passages |
| Historical incident | `data/context_records.json` + documents | curated facts + verbatim excerpt | separate "context" cards, warning banner |
| Technology transfer | same | same | same |
| Curated record (FLAMEWISE) | `data/investigations.json` | hand-curated summaries | labelled "curated summary" |
| Interpretation / heuristic | computed (`assistant.py`, `scoring.py`) | rule templates or optional LLM | INTERPRETATION / relevance score, never "evidence" |

## Ingestion pipeline

```
discovery (PSI search API, document registry)
  -> download (raw cache, SHA-256)          backend/data/raw/   (git-ignored, reproducible)
  -> extraction (JSON fields / pdftotext per page / HTML body between markers)
  -> normalization (psi_records.json, documents/<id>.json)
  -> validation (schema checks, marker checks, empty-page report, tests)
  -> indexing (BM25 over records+PSI fields; BM25 over document passages)
  -> search / assistant / graph / compare
```

Run from `backend/`:

```bash
python -m ingest.psi_ingest            # add --refresh to bypass the raw cache
python -m ingest.documents             # requires poppler-utils (pdftotext)
```

* **Stable identifiers.** PSI accession (`PSI-26`), document id (`DOC_GUIDE_2015`), passage id `DOC:page:n`.
* **No repeated downloads.** Raw files are cached by id; `--refresh` forces re-download.
* **Hashes.** Raw PSI JSON SHA-256 per record; experiment-table SHA-256; document SHA-256; manifest
  `data/psi/manifest.json` with timestamps, search terms and errors.
* **Failures are recorded, not hidden.** A missing HTML marker sets `extraction.status = "failed"`; image-only PDF pages are
  listed in `extraction.empty_pages`; no OCR is performed, so `ocr` is `false` everywhere.
* **Encodings.** PSI tables are decoded as UTF-8, falling back to Windows-1252 strictly (one table, PSI-69, is cp1252); the
  encoding is stored with the table.

## Experimental conditions

`app/psi.py` classifies experiment-table columns as oxygen, pressure, flow, diluent, fuel/sample or reported quantity by
header pattern and reports **min/max of the published cells with the original header**. It does not convert units
(mole fraction vs. % by volume; atm vs. mmHg vs. bar), average, or filter placeholder zeros. The comparison view therefore
marks ranges from different columns as **not comparable** and never normalises them. `oxygen_concentration` and
`airflow_speed` on curated records stay `null`: a single value would misrepresent per-test conditions.

Known table quirks kept as published: PSI-69 header "O initial ambient composition; mole fraction" (no subscript), PSI-69
"Burning rate; mm" (unit superscript lost), pressure minimum 0 in PSI-69 (placeholder), PSI-98 and PSI-102 list identical
investigation date ranges in PSI metadata (shown as stated by PSI).

## Citations and claims (assistant)

Every answer returns `evidence_items` with `verification`:

* `verbatim_extracted_text` — passage copied from an extracted document, with document, page and section;
* `verbatim_psi_metadata` — sentence copied from a PSI objective/approach, with DOI and landing URL;
* `curated_summary` — FLAMEWISE paraphrase (never presented as a quotation).

`claims` are typed EVIDENCE / INTERPRETATION / HYPOTHESIS / SAFETY. In local mode EVIDENCE claims are verbatim excerpts.
With an LLM key, the model must return claims with evidence ids; each EVIDENCE claim is checked lexically against its cited
excerpts (≥3 shared content words and ≥30 % of the claim's words). Unsupported EVIDENCE claims are downgraded to
INTERPRETATION and tagged "not supported by retrieved evidence". This is a lexical check, not semantic entailment.
FLAMEWISE never fabricates page numbers: pages come only from the PDF extraction.

## Evidence graph edges

`origin` on every edge: `kb` (curated field), `psi` (stated by PSI: DOCUMENTED, PSI_RELATED), `text_match`
(MENTIONED_IN — acronym found on listed pages), `curated_context` (CONTEXT_FOR — editorial link from a historical or
technology-transfer case). No SUPPORTS / CONTRADICTS edges exist because no source states such relations.

## Main photograph

`main_photo.jpg` (2560×1442, JFIF, ICC profile, no EXIF/creator metadata) was supplied by the project owner. Web derivatives
(`frontend/public/media/hero-{960,1600,2400}.{webp,jpg}`) are a crop of rows 0–1180 that excludes the NASA insignia patch on
the suit (brand-guideline compliance) and are otherwise unaltered. The scene (an EVA suit worn inside a module while holding
an open flame) does not correspond to an actual ISS operation and the image appears to be a composite or generated
illustration, so the UI captions it "Illustrative image — not experimental imagery or NASA data". The original file is
kept unchanged.
