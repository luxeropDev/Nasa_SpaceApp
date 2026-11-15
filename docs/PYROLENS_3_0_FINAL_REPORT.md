# PyroLens 3.0 final report

Date: 2026-11-15  
Working copy: `D:\QASH\Works\Nasa_SpaceApp`  
Baseline: `main` at `9c50b9b` (`origin/main`)  
Disposition: changes left locally; no commit, push, deployment, or pull request.

## Outcome

The available GitHub checkout contains a substantial, working PyroLens 3.0 scientific backend. Documentation, core visible branding, configuration naming, and final verification have been completed. The deterministic Lunar Habitat workflow works against the real FastAPI backend.

The prior handoff also reported a larger redesigned frontend, seven component tests, and 18 Playwright tests. Those files were not present in `origin/main`, no newer local checkout or handoff note was found under `D:\QASH\Works`, and the available `frontend/package.json` has no component-test or Playwright scripts/dependencies. This report does not claim that missing work or those unrepeatable results.

## Completed in this continuation

- Replaced the English and Russian READMEs with PyroLens 3.0 identity, exact Windows/`uv` startup commands, API/configuration documentation, verification commands, and scientific limitations.
- Added `SCIENTIFIC_METHODS.md` covering observation eligibility, ambiguous composition, diluent and flow semantics, matching tolerances, coverage thresholds, uncertainty propagation, passports, assistant boundaries, and collection limits.
- Added an external-expert review package tied to all machine-readable reference cases, exact locations, acceptance criteria, nine required reviewer decisions, and a reviewer record.
- Generated `VALIDATION_REPORT.md` through the existing validation runner.
- Updated FastAPI metadata to version 3.0.0 and standardized environment variables as `PYROLENS_*`, with documented `FLAMEWISE_*` compatibility aliases.
- Updated core visible frontend branding, export filenames, English/Russian strings, package name, browser title, logo label, and homepage description without rewriting working screens.

## Scientific scope verified

- 24 PSI datasets produce 1,610 observations; 1,330 are combustion-eligible.
- Exclusions: 161 rows without condition values, 43 duplicates, 2 non-combustion rows, and 117 smoke-aerosol rows.
- PSI-47 is excluded as non-combustion. PSI-101 and PSI-102 are excluded as smoke-aerosol; that decision is explicitly provisional because PSI-102 metadata uses “combustion events.”
- PSI-69 has 123 composition rows marked ambiguous because `CO initial ambient composition` does not establish CO versus CO2.
- A concurrent-flow-over-solid, 20 cm/s, microgravity `flow_gravity` query excludes 410 incompatible flow observations and supports PSI-98/PSI-99. The count is query-specific.
- Missing uncertainty is `uncertainty_not_reported`. pO2 uncertainty is propagated only when both input standard uncertainties are numeric and the independent-input assumption is applicable.
- Diluent composition affects matching; missing diluent is never air/N2; incompatible flow families are never silently treated as equivalent.
- Passports distinguish evidence classes and retain source references; assistant scenario evidence is produced by deterministic validation/matching/gap logic before optional synthesis.

## Verification record

| Check | Result | Evidence |
|---|---|---|
| Backend pytest | PASS | 233 passed; one Starlette deprecation warning |
| Reference validation | PASS | 35/35 values; every extraction/unit/gas/flow/eligibility/matching/coverage/gap/adversarial metric passed |
| Frontend typecheck | PASS | `npm run typecheck` |
| Frontend production build | PASS | Vite transformed 2,220 modules and produced `frontend/dist` |
| Real-backend Lunar workflow | PASS | preset → match (PSI-99 top, 12 ranked) → gap summary → PSI-99 passport → evidence report → assistant scenario |
| Assistant scenario grounding | PASS, local mode | scenario name preserved; deterministic calculated pO2 19.22 kPa; `llm_used: false`; no uncertainty invented |
| EN/RU, themes, responsive layout | PASS, focused visual | Russian/light mobile, Russian/dark, English/dark mobile menu and overview inspected in the running app |
| Live LLM | NOT RUN | no provider key configured; health reported `DEMO / LOCAL KNOWLEDGE MODE` |
| Frontend component tests | NOT AVAILABLE | no configured script or framework in the available checkout |
| Playwright E2E | NOT AVAILABLE | no Playwright config, dependency, or script in the available checkout |

The real-backend workflow returned seven `NO_MATCHING_RECORDS`, one `LIMITED_COVERAGE`, one `OBSERVED`, and one `NOT_ASSESSABLE` gap for the complete Lunar Habitat demonstration scenario. That classification is collection-scoped, not a statement that the phenomena have never been studied.

## Remaining limitations

- Independent scientific status remains **PENDING INDEPENDENT DOMAIN-EXPERT REVIEW**. Passing the internal reference set is not external validation.
- Original publications, figures, and supplemental methods behind the reference values were not independently checked.
- The available frontend is the earlier FLAMEWISE screen architecture with PyroLens branding, not the unpushed Coverage Intelligence/grid-explorer redesign reported in the handoff. The PyroLens evidence API is accessible through FastAPI and tests, but dedicated UI screens for all new routes are not present.
- The npm install reported two dependency audit findings (one moderate, one high) and a deprecated Recharts 2.x branch. No forced dependency upgrade was made because it would be a scope-expanding/breaking change.
- Some scientific names/source material remain in their source language even when the interface chrome changes language.
- No live provider call was made; mocked LLM-path unit tests are not described as real-LLM verification.

## Startup commands

Backend:

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

With `uv` when `python` is not on `PATH`:

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\backend
$env:UV_CACHE_DIR = "D:\QASH\Works\Nasa_SpaceApp\.uv-cache"
uv run --with-requirements requirements.txt uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd D:\QASH\Works\Nasa_SpaceApp\frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

## Documentation handoff

- `README.md` and `README.ru.md`
- `docs/SCIENTIFIC_METHODS.md`
- `docs/EXTERNAL_EXPERT_REVIEW_PACKAGE.md`
- `docs/VALIDATION_REPORT.md`
- `backend/validation/reference_set.json`

All changes are intentionally uncommitted for owner review.
