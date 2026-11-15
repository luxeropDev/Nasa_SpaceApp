# PyroLens 3.0 external expert review package

Reviewer status: **PENDING INDEPENDENT DOMAIN-EXPERT REVIEW**  
Prepared: 2026-11-15  
Scope: scientific interpretation and deterministic rule review; not a software security audit or operational fire-safety certification.

No independent combustion specialist has approved this package. The reference set was prepared by the developers with AI assistance. PSI CSV tables and PSI investigation metadata were checked; original publications, figures, and PDFs were **not** independently checked.

## Package contents

This document and the following repository files form one review package:

- `backend/validation/reference_set.json` — authoritative machine-readable cases, including exact source locations, raw/normalized expected values, interpretations, acceptance criteria, unresolved ambiguity, and reviewer status.
- `backend/validation/run_validation.py` — executable evaluator.
- `backend/data/psi/tables/*.csv` — preserved PSI table text referenced by accession, data row, and column.
- `backend/data/psi_dataset_profiles.json` — table granularity and related-but-unmerged investigation decisions.
- `backend/data/psi_physical_profiles.json` — curated observation, gas, flow, geometry, ignition, and uncertainty semantics with stated bases.
- `docs/SCIENTIFIC_METHODS.md` — complete implemented method and provisional thresholds.

The JSON is part of this package rather than an appendix copied into Markdown: copying 74 cases would create two competing sources of truth. Each of its 35 value references includes `source_location`, `expected`, `explanation`, `acceptance`, `remaining_ambiguity`, and `reviewer_status`. Its additional 16 semantic, 8 matching, 6 coverage, and 9 adversarial cases carry the corresponding expected interpretation and acceptance rule.

## Sources and exact-location convention

Locations use paths relative to `backend/`. A location such as `data/psi/tables/PSI-69.csv, data row 1 (1-based after header), column 'Ambient pressure; mmHg'` means the first record after the header, not physical file line 1. Measurement identifiers use `ACCESSION:rROW:cCOLUMN`, with one-based data rows and zero-based column indices in code.

The 35 value references cover PSI-10, 20, 25, 39, 69, 98, 99, 101, 107, and 159. They test unit identity/conversion, oxygen partial-pressure calculation, missing/censored/ambiguous cells, species semantics, inferred units, approximate values, and preservation of signed velocity. Run the evaluator to see every case and result:

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\backend
python -m validation.run_validation
```

Expected software result as of 2026-11-15: 35/35 value references pass, and all published metric groups pass. This confirms implementation agreement with the prepared reference set; it is not independent scientific validation.

## Interpretation case inventory

| IDs | Source locations | Expected interpretation | Acceptance |
|---|---|---|---|
| S01–S03 | PSI-39 numeric O2/N2/He rows; PSI-69 positive `CO initial ambient composition` rows | numeric N2/He mixtures are distinct environments; PSI-69 species remains CO/CO2 ambiguous | exact fields; every qualifying PSI-69 row ambiguous |
| S04–S07 | PSI-23 `Atmosphere*`, PSI-68 `Ambient Gas Mixture`, PSI-10 lacking ambient diluent | text gas is retained; `N3` is not corrected; alternatives stay alternatives; missing is not N2/air | exact fields |
| S08–S11 | PSI-98 flow direction/velocity; PSI-107 air rate including negative value | concurrent/opposed solid flow differs from jet-burner co-flow; negative velocity preserved but unused | exact fields |
| S12–S14 | PSI-47 dust session, PSI-26 material-only log, PSI-101 smoke run | not eligible for flame-condition coverage | exact eligibility reason |
| S15–S16 | profile linkages PSI-117→69/142 and PSI-47→102 | related records stay linked but unmerged | exact fields |
| MC01–MC04 | scenarios in `matching_cases` versus PSI-39/25/10/98 | diluent identity/composition changes match state; air vs N2 is partial | expected state/list |
| MC05–MC08 | scenarios versus PSI-107/98/99/101 | incompatible flow families do not receive numeric matches; ineligible smoke rows do not match as fire evidence | expected state/list |
| CC01–CC06 | gravity, atmosphere, diluent, and flow scenarios in `coverage_cases` | eligibility/context constraints alter supporting records and coverage class | class and allowed/forbidden accessions |
| A01–A09 | malformed, missing, ambiguous, extreme, injection-like, and uncertainty inputs | reject or preserve safely; never invent uncertainty; propagate only two stated input uncertainties | exact validation/status or numeric tolerance in JSON |

For exact scenario bodies, source rows, expected states, forbidden accessions, and numeric tolerances, review the corresponding object by ID in `reference_set.json`.

## Required reviewer decisions

Please record `accept`, `accept with change`, or `reject`, plus rationale and citation, for each item:

1. **PSI-98 geometry:** source lists length 40.6 cm and width 94 cm while PSI-100 in the same SAFFIRE hardware family reverses them. PyroLens keeps PSI-98 as published. Decide whether this is a source error and whether correction metadata is justified.
2. **PSI-69 species:** `CO initial ambient composition` may mean CO or CO2. FLEX objectives/publication titles provide only circumstantial CO2 context. Identify an authoritative table definition or require continued ambiguity.
3. **PSI-107 negative air rate:** values −0.28 and −5.92 cm/s are preserved but unused. Determine whether sign denotes direction, sensor offset, or invalid data.
4. **PSI-25 final O2 extremes:** values span 0.6–40.4%. Confirm their physical/test context and whether any rows require qualification.
5. **PSI-101/102 eligibility:** PyroLens provisionally excludes both smoke-generation collections from flame coverage, while PSI-102 metadata calls runs “combustion events.” Define which questions, if any, these rows can support.
6. **Air source term:** PSI-98/99/100/102/107 use “Air” without numeric composition. Confirm that N2 matching should remain capped at partial.
7. **Rules:** review every comparison tolerance, 0.05/0.10 diluent-composition tolerance, flow compatibility mapping, and coverage thresholds (3 observations from 2 investigations). These are provisional engineering choices, not literature-derived standards.
8. **Uncertainty:** confirm the independent-input first-order product formula and require that both standard uncertainties be explicitly available before propagating pO2 uncertainty.
9. **Gravity:** confirm that the current categories and the Lunar scenario's `NO_MATCHING_RECORDS` statement are scoped to this ingested collection.

## Acceptance criteria

A case may be marked accepted only when the reviewer has:

- opened the cited source location and confirmed raw text and row/column convention;
- confirmed or corrected the expected physical interpretation without filling missing information by assumption;
- checked normalized units and calculation tolerance where applicable;
- confirmed that measured, source-derived, calculated, assumed, ambiguous, and missing values remain distinguishable;
- supplied a citation to the original publication/method section when the PSI table or metadata is insufficient;
- documented any change required in profiles, algorithms, tests, or user-facing limitations.

Package-level acceptance additionally requires all seven unresolved issues above to be resolved or explicitly accepted as limitations, all provisional thresholds to receive a rationale, and rerunning both `python -m validation.run_validation` and `python -m pytest -q` after approved changes.

## Reviewer record

Copy this block into a dated review note; do not change the project status merely because the automated suite passes.

```text
Reviewer name and affiliation:
Relevant expertise:
Review date:
Repository commit:
Cases reviewed:
Original publications/sections consulted:
Decisions and rationale:
Required changes:
Residual limitations:
Overall disposition: ACCEPT / ACCEPT WITH CHANGES / REJECT
Signature or verifiable approval reference:
```

Until a completed reviewer record exists and approved changes are incorporated, the only valid status is **PENDING INDEPENDENT DOMAIN-EXPERT REVIEW**.
