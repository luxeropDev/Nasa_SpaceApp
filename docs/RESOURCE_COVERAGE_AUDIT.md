# Resource Coverage Audit — "Flame in Freefall" (NASA Space Apps Challenge 2026)

Authoritative list: <https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/?tab=resources>
Verified: **2026-11-14** (challenge page rendered in a browser; automated HTTP fetch of spaceappschallenge.org failed with a TLS
certificate-chain error from the sandbox, so the page was read through the in-app browser instead — no unofficial mirror was used).

The page lists **ten** resources under "NASA DATA & RESOURCES". All ten URLs below are copied from the page's `href`s.
Coverage is **computed at runtime** by `backend/app/resources.py` (`GET /api/resources`) from what is actually loaded —
listing a URL in `sources.json` does not count as integration.

## Stage definitions

| Stage | Meaning (as implemented) |
|---|---|
| discovered | listed on the official resources tab |
| accessible | URL opened and content checked on 2026-11-14 (`verification = verified_accessible`) |
| metadata_imported | title / publisher (and date where stated) stored in `sources.json` |
| content_extracted | text or structured data extracted (`data/documents/*.json`, `data/psi_records.json`) |
| indexed | extracted text split into passages / fields of the BM25 indexes |
| searchable | reachable through `/api/search` or `/api/search/documents` |
| connected | linked to at least one investigation record (PSI accession link, acronym found on a page, or curated context link) |
| citable | can be returned as a citation with page/section or DOI |

Status rules: **FULLY_INTEGRATED** = all eight stages and no stated scope exclusion; **PARTIALLY_INTEGRATED** = content
extracted but a later stage is missing or a scope exclusion applies; **LINK_ONLY** = metadata only.

## Summary

| Status | Count | Resources |
|---|---|---|
| FULLY_INTEGRATED | 4 | 02, 05, 07, 09 |
| PARTIALLY_INTEGRATED | 5 | 01, 04, 06, 08, 10 |
| LINK_ONLY | 1 | 03 |
| NOT_INTEGRATED / UNAVAILABLE | 0 | — |

Coverage is **not 100 %**, and the page in the app says so.

## Matrix

| # | Resource | URL | Org. | Category | Date | Status | Missing / exclusion |
|---|---|---|---|---|---|---|---|
| 01 | PSI Data Repository: Combustion Science | https://psi.nasa.gov/physci/repo/search?q=combustion | NASA PSI | data repository | — | PARTIALLY | raw data files/images/videos not downloaded |
| 02 | NASA Combustion Science | https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/ | NASA GRC | program overview | not stated | FULLY | — |
| 03 | NASA ScienceCasts: The Power of Studying Combustion on the ISS | https://www.youtube.com/watch?v=W1oXykoz9zg | NASA Science (YouTube) | educational video | 2018-03-13, 219 s | LINK_ONLY | no transcript extracted |
| 04 | A Researcher's Guide to ISS Combustion Science | https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/ | NASA ISS Program Science Office | review publication (PDF 56 pp.) | Oct 2015 | PARTIALLY | figures and image-only page 4 not extracted (no OCR) |
| 05 | Apollo 1 | https://sma.nasa.gov/sma-disciplines/accllp/apollo-1 | NASA OSMA | historical incident | 1967 event | FULLY | — |
| 06 | Apollo 13 | https://sma.nasa.gov/sma-disciplines/accllp/apollo-13 | NASA OSMA | historical incident | 1970 event | PARTIALLY | not connected to an experiment (no topical overlap claimed) |
| 07 | 25 Years Ago: Fire Aboard Space Station Mir | https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/ | NASA JSC History (J. Uri) | historical incident | 2022-02-23 | FULLY | — |
| 08 | Fireman's Air Tanks | https://spinoff.nasa.gov/node/9582 | NASA Spinoff | technology transfer | 1976 | PARTIALLY | not connected to an experiment |
| 09 | Fire Detector | https://spinoff.nasa.gov/node/9407 | NASA Spinoff | technology transfer | 1978 | FULLY | — |
| 10 | New Technology for the Fire Attire | https://spinoff.nasa.gov/node/9918 | NASA Spinoff | technology transfer | 1982 | PARTIALLY | not connected to an experiment |

## Per-resource notes

**01 PSI Data Repository** — Search for "combustion" returns 26 investigations; 24 have Research Area *Combustion Science*
(PSI-108 STDCE-1 fluid physics and PSI-181 solder study were excluded as out of scope). Access: public JSON endpoints used by
the PSI web app (`/geode-py/ws/repo/search`, `/geode-py/ws/repo/investigations/<ID>`, signed S3 links for experiment tables).
No login, no API key; the endpoints are undocumented, so the connector records URL + SHA-256 and fails on schema drift.
Metadata fields captured: accession, title, acronym, DOI, project type, flight platform, NASA center, sub-area, dates,
release/version, license (CC0-1.0 on records checked), hardware, objective, approach, hypothesis, impacts, contacts
(name/affiliation/role only — e-mails deliberately not copied), publications (352, of which 284 with DOI), related
investigations, file categories, experiment table (20 of 24 investigations; 1,735 rows). 18 accessions are linked to the
15 FLAMEWISE records; 6 are not linked (DAFT PSI-47 and ground studies PSI-60, 62, 115, 117, 142) and appear in the
*Experiments* catalog. Attribution: PSI asks users to cite each investigation by its DOI.

**02 NASA Combustion Science** — Program overview (buoyancy removal, ~8× density change across a flame, CIR and MDCA
facilities). Article body extracted between fixed markers, 16 passages indexed; names BASS, FLEX, SAME, ACME, SLICE, SPICE,
Saffire. Background class — never labelled experimental evidence.

**03 ScienceCasts** — Verified title, channel, publish date (2018-03-13) and duration (219 s ≈ 3.6 min, matching the
challenge page). A video is not a dataset; no transcript was obtained, so it is not searchable or citable. Recommended:
add a transcript with timestamps if NASA publishes captions.

**04 Researcher's Guide (2015)** — Authors Gokoglu, Dietrich, Stocker, Ferkul, Olson, Hicks; report NP-2015-10-034-JSC;
PDF 1,500,825 bytes, SHA-256 `5fe046ef…6b6`. Extracted page-by-page with poppler `pdftotext -layout`; 56 pages, page 4 empty
(image-only, reported); table of contents parsed into 50 section headings with page numbers; 196 passages indexed; 24 pages
name a FLAMEWISE investigation. PDF page numbers equal printed page numbers (checked against the TOC).

**05–07 Historical incidents** — Article bodies extracted; facts stored in `data/context_records.json` with a verbatim
excerpt each (a test asserts every excerpt occurs in the extracted text). Kept in class `historical_incident` and never
mixed with experiment results. Apollo 13 is an oxygen-tank/pressure-vessel failure; FLAMEWISE does not link it to any
combustion experiment, which is why it is PARTIALLY_INTEGRATED.

**08–10 Technology transfer** — Spinoff abstracts (1976, 1978, 1982) extracted and stored as `technology_transfer`
context. Only the Fire Detector (smoke/dust discrimination) is linked, to SAME/SAME-R; the other two have no honest
experimental counterpart in the knowledge base.

## Licensing / attribution

* PSI records: CC0-1.0 stated on investigation pages; cite by DOI.
* NASA web pages and the Researcher's Guide: NASA content; attributed by title, publisher and URL. Extracted text is used
  for search and short excerpts; the original PDF is not redistributed (kept under `backend/data/raw/`, git-ignored).
* The challenge page states that NASA does not endorse non-U.S. Government entities. FLAMEWISE is independent and does not
  claim NASA endorsement.
