# PyroLens 3.0 scientific methods

Status: implementation description, 2026-11-15. The rules below are deterministic and test-covered, but the scientific interpretation and engineering thresholds remain **PENDING INDEPENDENT DOMAIN-EXPERT REVIEW**.

## Scope and evidence boundary

PyroLens operates on the PSI investigation metadata and experiment tables stored in `backend/data/psi`. It does not infer that the collection is exhaustive. A result of `NO_MATCHING_RECORDS` means only that no eligible ingested record matched the defined scenario under the documented rules; it does not mean that the phenomenon has never been studied.

The pipeline retains raw cell text, source header, unit, row and column location, source-file hash, normalized value, conversion, extraction status, and ambiguity flags. Values are classified as measured/reported, derived from a source, calculated by PyroLens, estimated, assumed, ambiguous, or missing. Raw data is not overwritten by normalization.

## Observation construction and eligibility

An observation corresponds to one source-table row when that row contains a usable condition or material value. Duplicate rows are retained for provenance but excluded from coverage. Each observation is assigned a dataset-level observation class from `backend/data/psi_physical_profiles.json` and a row-level eligibility result.

Only combustion-eligible observations contribute to flame coverage. Rows are excluded when they are:

- `non_combustion` (including PSI-47 dust/instrument-feasibility sessions);
- `smoke_aerosol` (PSI-101 and PSI-102 are provisionally classified as smoke-generation rather than flame observations);
- `no_observations` or contain no condition values (for example, a material-only log);
- duplicates.

The PSI-101/PSI-102 decision is intentionally provisional: PSI-102 metadata describes “combustion events.” External expert review must decide whether any rows can support a carefully scoped combustion question. Until then, they cannot inflate flame coverage.

In the verified dataset there are 1,610 constructed observations, of which 1,330 are eligible. Exclusions are 161 without condition values, 43 duplicates, 2 non-combustion rows, and 117 smoke-aerosol rows.

## Gas composition and diluent semantics

Missing diluent is never replaced by air or nitrogen. Composition may come from numeric columns, row text, campaign-level alternatives, a source term such as “Air,” or investigation-level metadata; the evidence class records which basis was used.

For numeric compositions:

- a component below 0.02 mole fraction is a minor species, not the primary diluent;
- two or more components at or above 0.05 make a mixture;
- O2 plus listed species must close to `1 ± 0.03` to count as complete;
- matching a supplied gas composition uses an absolute per-component tolerance of 0.05 for `MATCH` and 0.10 for `PARTIAL_MATCH`.

An “Air” source term can match air, but N2 is only a partial match because composition was not tabulated. Campaign alternatives such as “O2/N2 or O2/He” cannot establish which gas applied to an individual row.

PSI-69 contains a column headed `CO initial ambient composition; mole fraction`. Neither the header nor the table proves whether it means CO or CO2. PyroLens preserves the raw values as `unresolved_species`, records candidates `CO` and `CO2`, and marks all 123 affected composition rows ambiguous. It does not silently resolve the column from circumstantial publication titles or objectives.

## Flow configuration compatibility

Velocity is meaningful only within its physical configuration. Profiles distinguish, among others, concurrent or opposed flow over a solid, forced flow over a specimen with direction unstated, co-flow around a jet burner, and inlet flow.

Equal configurations match. Direction-unspecified forced flow over a solid is at most a partial match to concurrent/opposed solid flow. Other cross-family comparisons are incompatible; their numeric velocities are not compared and they are listed as exclusions. Negative flow values are preserved and flagged but are never used in matching or coverage.

The reported count of 410 incompatible observations belongs to one specific query: concurrent flow over a solid at 20 cm/s in microgravity, evaluated for the `flow_gravity` coverage combination. It is not a collection-wide constant. That query supports PSI-98 and PSI-99 and excludes incompatible co-flow/inlet records.

## Scenario validation and deterministic matching

Scenario fields are explicit targets with units and optional origin/uncertainty. Undefined values stay undefined. Values are normalized before matching, and oxygen partial pressure is calculated as `pO2 = xO2 × Ptotal` only when both inputs exist.

Every eligible observation is compared jointly with the scenario; the best single row supplies a dataset's dimension states so marginal values from different rows are never combined. States are `MATCH`, `PARTIAL_MATCH`, `MISMATCH`, `MISSING_IN_EXPERIMENT`, `MISSING_IN_SCENARIO`, or `NOT_COMPARABLE`.

Continuous comparison tolerances are provisional engineering choices:

| Dimension | Match | Partial |
|---|---:|---:|
| O2 mole fraction | absolute ±0.02 | absolute ±0.05 |
| Total pressure | relative 10% | relative 35% |
| O2 partial pressure | relative 10% | relative 25% |
| Flow velocity | max(20%, 2 cm/s) | max(50%, 5 cm/s) |
| Specimen thickness | relative 25% | relative 100% |
| Ignition power | relative 25% | relative 100% |
| Ignition duration | relative 25% | relative 100% |

Ignition tolerances are explicitly marked provisional. Categorical dimensions include gravity, material, diluent, flow configuration, and specimen geometry.

At least two comparable requested dimensions are needed for ranking. Rank score is `(MATCH + 0.5 × PARTIAL) / requested`, followed by fewer mismatches and then normalized distance. `high`, `moderate`, and `low` bands are navigation aids only; they are not safety probabilities or claims of scientific equivalence.

## Coverage and gap classification

Coverage uses eligible observations only, never scenario targets, and performs no interpolation. It checks parameter combinations jointly. Campaign matrix ranges that do not publish row-level combinations may produce an envelope note but do not count as matching observations.

| Classification | Deterministic rule |
|---|---|
| `NOT_ASSESSABLE` | Scenario omits at least one required parameter |
| `INSUFFICIENT_METADATA` | No eligible observation reports the full combination |
| `NO_MATCHING_RECORDS` | Combination is reported, but zero observations match |
| `SPARSE_COVERAGE` | 1–2 matching observations |
| `LIMITED_COVERAGE` | At least 3 matches, all from one PSI investigation |
| `OBSERVED` | At least 3 matches from at least 2 PSI investigations |

The thresholds (3 observations and 2 investigations) are provisional. Eight explorer pairs are exposed: O2–pressure, pO2–pressure, diluent–O2, flow–O2, flow configuration–material, flow–gravity, material–gravity, and O2–material. Continuous axes use fixed bins. Any pair containing velocity is separated into flow-configuration layers and never pooled across configurations.

## Uncertainty

Missing uncertainty is represented as `uncertainty_not_reported`, never as zero. A reported numeric uncertainty is attached only when a source/profile explicitly supplies it. A source range is kept as reported bounds and is not automatically treated as standard uncertainty. Approximate values remain flagged.

For independent standard uncertainties on both inputs, PyroLens propagates oxygen partial-pressure uncertainty using first-order product propagation:

`u(pO2) / pO2 = sqrt((u(xO2)/xO2)^2 + (u(P)/P)^2)`

Propagation occurs only when both numeric input uncertainties exist and the inputs are non-zero. If either is absent, the derived pO2 remains available but its uncertainty is `uncertainty_not_reported`, with the missing inputs named. This assumption and formula require external scientific review before engineering use.

## Passports, reports, and assistant boundary

Experiment passports summarize gas, flow, geometry, ignition, uncertainty, observation class, evidence classes, limitations, and source references. Evidence reports separate source values, extracted values, PyroLens calculations, scenario assumptions, and missing values.

The assistant may receive the complete user-created scenario. Scenario validation, matching, coverage/gap analysis, passports, and calculated pO2 are generated by the deterministic engine before optional LLM synthesis. Numeric claims produced by an LLM are checked against assembled evidence and downgraded when ungrounded. When no provider key is configured, the structured local response is returned with `llm_used: false`; this is not a live-LLM test.

## Collection limitations

- PSI tables and PSI metadata were checked; original publications, figures, and supplemental methods were not independently checked for the validation package.
- Table columns sometimes omit units, uncertainty, measurement method, reference frame, or per-row composition.
- Several dataset profiles are curated interpretations rather than source-reported row fields.
- The collection is not a complete literature review and cannot support claims about all combustion knowledge.
- Thresholds and compatibility rules are unreviewed engineering choices.
- The complete unresolved-question list and reviewer procedure are in [EXTERNAL_EXPERT_REVIEW_PACKAGE.md](EXTERNAL_EXPERT_REVIEW_PACKAGE.md).

## Reproducibility anchors

Implementation: `backend/app/science/`. Dataset semantics: `backend/data/psi_dataset_profiles.json` and `backend/data/psi_physical_profiles.json`. Reference cases: `backend/validation/reference_set.json`. Runner: `python -m validation.run_validation`. Tests: `backend/tests/test_science_foundation.py`, `test_science_intelligence.py`, and `test_pyrolens3.py`.
