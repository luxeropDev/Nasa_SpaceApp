# PyroLens

PyroLens is a research tool for exploring microgravity combustion experiments and their relevance to spacecraft fire safety.

It brings together records from NASA combustion research programs, publications and supporting documents in one searchable interface. Researchers can find related experiments, compare their conditions and findings, trace claims back to their sources, and identify gaps in the available evidence.

Built for the NASA Space Apps Challenge 2026.

> PyroLens is an independent research project. It is not affiliated with or endorsed by NASA, and it is not an operational fire-safety system.

## What PyroLens does

- Searches curated microgravity combustion investigations using BM25 retrieval
- Filters research by fuel, hardware, gravity, mission context and safety domain
- Compares two to four investigations side by side
- Connects findings to their publications and source records
- Maps relationships between experiments, topics and sources
- Shows how existing evidence relates to ISS, lunar and Mars mission scenarios
- Generates source-linked research summaries and reports
- Supports English and Russian interfaces

PyroLens separates source data, curated interpretation and missing information. Its relevance scores are transparent research heuristics, not fire-risk probabilities or physical simulations.

## Data

The current dataset includes:

- 15 curated investigation records
- 24 NASA PSI Combustion Science investigations
- 352 listed publications, including 284 with DOI identifiers
- 20 experiment tables containing 1,735 rows
- NASA documents and web resources indexed for search

Published values are preserved with their original units and column names. PyroLens does not silently convert incompatible measurements or fill missing values.

For details about source handling and dataset coverage, see:

- [`docs/SCIENTIFIC_DATA_PROVENANCE.md`](docs/SCIENTIFIC_DATA_PROVENANCE.md)
- [`docs/RESOURCE_COVERAGE_AUDIT.md`](docs/RESOURCE_COVERAGE_AUDIT.md)

## Technology

| Layer | Stack |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | Python, FastAPI, Pydantic |
| Search | In-process BM25 retrieval |
| Optional AI | OpenAI or Anthropic API |
| Tests | pytest and TypeScript type checking |

The application works without an AI provider. If no API key is configured, research search, comparison, evidence mapping and local source-based answers remain available.

## Running locally

Requirements:

- Python 3.10 or newer
- Node.js 18 or newer

Start the backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

In a second terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. API documentation is available at <http://localhost:8000/docs>.

## Optional AI configuration

PyroLens can use OpenAI or Anthropic to synthesize answers from retrieved evidence. Set the variables before starting the backend:

```bash
export OPENAI_API_KEY="your-key"
export OPENAI_MODEL="gpt-4o-mini"
```

or:

```bash
export ANTHROPIC_API_KEY="your-key"
export ANTHROPIC_MODEL="claude-3-5-haiku-latest"
```

See [`.env.example`](.env.example) for the available settings. Do not commit API keys to the repository.

## Project structure

```text
frontend/   React application and interface translations
backend/    FastAPI application, retrieval and analysis logic
data/       Curated investigations, sources and translations
docs/       Methodology, provenance and coverage documentation
```

## Updating the dataset

From the `backend` directory:

```bash
python -m ingest.psi_ingest
python -m ingest.documents
```

Document extraction requires `poppler-utils`.

## Testing

Backend:

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest -q
```

Frontend:

```bash
cd frontend
npm run typecheck
npm run build
```

## Current limitations

- The curated dataset is still small and does not contain complete numerical measurements for every investigation.
- Some records link to NASA portals or catalogue searches rather than directly to a document.
- Mission scenarios are evidence mappings, not simulations.
- PDF reports are produced through the browser print dialog.
- The application currently has no authentication and is intended as a read-only research tool.

## License

No open-source license has been added yet. Until a `LICENSE` file is included, the repository should not be treated as open-source software.
