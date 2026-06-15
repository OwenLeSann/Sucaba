TODO:
    - Refine frontend dashboard
    - Implement additional optional features
    - Implement unit backend unit testing (if needed, works fine right now)
    - Rewrite README.md to clearly present project

# Expense Intelligence

AI-powered SMB expense intelligence platform. Ingests corporate card transactions, classifies merchants via Claude, detects policy violations, and provides an agentic chat interface for finance managers.

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.10+ |
| Node.js | 18+ |
| npm | 9+ |
| Anthropic API key | — |

## Installation

**1. Python dependencies**

```bash
pip install -r requirements.txt
```

**2. Frontend dependencies**

```bash
cd frontend
npm install
```

**3. Build the database**

Must be run from `src/` — the database and LLM cache paths are relative to CWD.

```bash
cd src
python pipeline.py ../data/dummy_data.xlsx
```

This drops and rebuilds `src/expense.db`, calls Claude once to categorize MCC codes (result cached in `src/llm_categories.json`), then writes all violations. Delete `llm_categories.json` to force re-categorization.

**4. Set your API key**

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

---

## Running

### Development

Two terminals — Vite proxies `/api` requests to FastAPI automatically.

```bash
# Terminal 1 — backend (from src/)
cd src
python server.py
# → http://localhost:8000
```

```bash
# Terminal 2 — frontend dev server
cd frontend
npm run dev
# → http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173).

### Production

Build the frontend once; FastAPI serves it alongside the API.

```bash
cd frontend
npm run build
```

```bash
cd src
python server.py
# → http://localhost:8000 (serves both API and built UI)
```

### Agent CLI (no UI)

Interactive REPL for direct agent queries, also run from `src/`:

```bash
cd src
python agent.py
```

---

## Notes

- MCC codes CSV sourced from [greggles/mcc-codes](https://github.com/greggles/mcc-codes)
- `ANTHROPIC_API_KEY` must be set before starting the server or running the agent CLI
- The pipeline is destructive — it drops and rebuilds all tables on every run
