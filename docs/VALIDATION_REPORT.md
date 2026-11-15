# PyroLens validation report

Generated 2026-11-15T07:53:07+00:00 by `python -m validation.run_validation` (backend/).

**Independent validation status: PENDING INDEPENDENT DOMAIN-EXPERT REVIEW.** No external combustion specialist has reviewed this reference set; the cases were prepared by the PyroLens developers (AI-assisted). Passing them shows internal consistency with the expected interpretations, not independent scientific validation.

Verified against: psi_csv_tables, psi_metadata; NOT verified against: original_publications, figures.

> Reference values and expected interpretations. Cell values were read directly from the published PSI CSV text and expected normalized values were computed by hand from the stated factor. Semantic, matching, coverage and adversarial cases state the expected interpretation, the exact source location and the acceptance criterion. Verification source: PSI experiment tables and PSI investigation metadata only; the underlying publications, figures and PDFs were NOT consulted. Prepared by the PyroLens developers (AI-assisted); no external combustion specialist has reviewed it. Reviewer status for every case: PENDING INDEPENDENT DOMAIN-EXPERT REVIEW.

## Metrics

| Metric | Pass | Total |
|---|---|---|
| extraction accuracy | 13 | 13 |
| unit normalization accuracy | 15 | 15 |
| gas classification accuracy | 14 | 14 |
| flow semantics accuracy | 4 | 4 |
| eligibility and linkage | 5 | 5 |
| matching correctness | 10 | 10 |
| coverage correctness | 6 | 6 |
| gap classification correctness | 4 | 4 |
| adversarial negative | 9 | 9 |

## Reference-set results (cell level)

| Category | Pass | Total |
|---|---|---|
| Unit conversion accuracy | 14 | 14 |
| O2/CO2/CO classification | 7 | 7 |
| Missing/invalid classification | 6 | 6 |
| Extraction accuracy | 7 | 7 |
| calculation | 1 | 1 |
| **Overall** | **35** | **35** |

| Id | Result | Detail |
|---|---|---|
| V01 | pass | ok |
| V02 | pass | ok |
| V03 | pass | ok |
| V04 | pass | ok |
| V05 | pass | ok |
| V06 | pass | ok |
| V07 | pass | absent as expected |
| V08 | pass | ok |
| V09 | pass | ok |
| V10 | pass | ok |
| V11 | pass | ok |
| V12 | pass | ok |
| V13 | pass | ok |
| V14 | pass | ok |
| V15 | pass | ok |
| V16 | pass | ok |
| V17 | pass | ok |
| V18 | pass | ok |
| V19 | pass | ok |
| V20 | pass | ok |
| V21 | pass | ok |
| V22 | pass | ok |
| V23 | pass | ok |
| V24 | pass | ok |
| V25 | pass | ok |
| V26 | pass | ok |
| V27 | pass | ok |
| V28 | pass | ok |
| V29 | pass | ok |
| V30 | pass | ok |
| V31 | pass | ok |
| V32 | pass | ok |
| V33 | pass | ok |
| V34 | pass | ok |
| V35 | pass | ok |

Provenance coverage (all table-derived measurements with file/row/column): 13668 / 13668.

## Gap-detection consistency (known-answer and repeatability checks)

| Case | Expected | Got | Result |
|---|---|---|---|
| air at 1 atm is OBSERVED | OBSERVED | OBSERVED | pass |
| lunar gravity has no records | NO_MATCHING_RECORDS | NO_MATCHING_RECORDS | pass |
| microgravity is OBSERVED | OBSERVED | OBSERVED | pass |
| O2 x P undefined -> NOT_ASSESSABLE | NOT_ASSESSABLE | NOT_ASSESSABLE | pass |

## Matching sanity checks

| Case | Expected in top | Top | Result |
|---|---|---|---|
| FLEX-like target ranks PSI-69 first or second | PSI-69 | PSI-69, PSI-39 | pass |
| SAFFIRE-like target ranks a SAFFIRE table in top 3 | PSI-98|PSI-99|PSI-100 | PSI-98, PSI-99, PSI-25 | pass |

Matching checks are sanity checks on a handful of constructed targets, not a measure of scientific matching quality; no expert-labelled relevance set exists.

## Semantic cases (diluent, flow, eligibility, linkage)

| Id | Category | Result | Detail |
|---|---|---|---|
| S01 | diluent | pass | ok |
| S02 | diluent | pass | ok |
| S03 | diluent | pass | ok |
| S04 | diluent | pass | ok |
| S05 | diluent | pass | ok |
| S06 | diluent | pass | ok |
| S07 | diluent | pass | ok |
| S08 | flow | pass | ok |
| S09 | flow | pass | ok |
| S10 | flow | pass | ok |
| S11 | flow | pass | ok |
| S12 | eligibility | pass | ok |
| S13 | eligibility | pass | ok |
| S14 | eligibility | pass | ok |
| S15 | linkage | pass | ok |
| S16 | linkage | pass | ok |

## Matching cases (diluent-aware, flow incompatibility)

| Id | Category | Result | Detail |
|---|---|---|---|
| MC01 | diluent_matching | pass | PSI-39 diluent = PARTIAL_MATCH |
| MC02 | diluent_matching | pass | PSI-25 diluent = MISMATCH |
| MC03 | diluent_matching | pass | PSI-10 diluent = MISSING_IN_EXPERIMENT |
| MC04 | diluent_matching | pass | PSI-98 diluent = PARTIAL_MATCH |
| MC05 | flow_incompatibility | pass | PSI-107 flow_velocity = NOT_COMPARABLE |
| MC06 | flow_incompatibility | pass | PSI-99 flow_velocity = MATCH |
| MC07 | flow_incompatibility | pass | PSI-99 flow_velocity = PARTIAL_MATCH |
| MC08 | flow_incompatibility | pass | PSI-101 flow_velocity = MISSING_IN_EXPERIMENT |

## Coverage cases

| Id | Result | Detail |
|---|---|---|
| CC01 | pass | OBSERVED (1322 matches) |
| CC02 | pass | OBSERVED (179 matches) |
| CC03 | pass | NO_MATCHING_RECORDS (0 matches) |
| CC04 | pass | NOT_ASSESSABLE (0 matches) |
| CC05 | pass | LIMITED_COVERAGE (7 matches) |
| CC06 | pass | SPARSE_COVERAGE (1 matches) |

## Adversarial / negative cases

| Id | Result | Detail |
|---|---|---|
| A01 | pass | ok |
| A02 | pass | ok |
| A03 | pass | ok |
| A04 | pass | ok |
| A05 | pass | ok |
| A06 | pass | ok |
| A07 | pass | ok |
| A08 | pass | ok |
| A09 | pass | ok |

## Items requiring expert review

- **PSI-98** — Sample Length (cm)=40.6 and Sample Width (cm)=94 while PSI-100 (same SAFFIRE hardware family) lists length 94 cm and width 40.6 cm: columns may be swapped in the source. Kept as published.
- **PSI-69** — 'CO initial ambient composition' — FLEX objective mentions CO2 as a tested suppressant and a FLEX publication title mentions 'carbon dioxide enriched environments'; this is circumstantial and the column is left ambiguous.
- **PSI-107** — Air Rate values -0.28 and -5.92 cm/s: physical meaning (direction, sensor offset) not stated.
- **PSI-25** — Calibrated final O2 values as low as 0.6 % and as high as 40.4 % are kept as published; their test context was not verified.
- **PSI-101/PSI-102** — Classified as smoke-generation (not flame) rows and excluded from combustion coverage; PSI-102 metadata calls runs 'combustion events'. Provisional; requires expert review.
- **PSI-98/99/100/102/107** — Diluent recorded from the source term 'Air' (column header); composition not tabulated. Matching against N2 is capped at partial.
- **all** — Comparison tolerances, diluent tolerance (0.05/0.10 mole fraction), coverage thresholds and flow-configuration compatibility rules are provisional engineering choices.
