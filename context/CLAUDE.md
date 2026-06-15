# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered SMB expense intelligence platform. Ingests corporate card transaction data (Excel), builds a normalized SQLite database, uses Claude to classify merchant categories, detects policy violations, and exposes an agentic query interface for finance managers.

## Setup

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY="your-key"
```

## Running

**Pipeline** — must run from `src/` because `DB_PATH = "expense.db"` and the LLM cache path are both relative to CWD:

```bash
cd src
python pipeline.py ../data/dummy_data.xlsx
```

Drops and rebuilds the entire database on each run, calls Claude once to categorize MCC codes (result cached in `llm_categories.json`), then writes all violations.

**Agent (CLI)** — also run from `src/`:

```bash
cd src
python agent.py
```

Opens an interactive REPL. The agent loop runs until `stop_reason == "end_turn"` or the 12-round circuit breaker trips.

## Architecture

### Data Flow

```
dummy_data.xlsx
      │
  pipeline.py
      ├── build_employees()          # Simulated identity layer (no real cardholder data in xlsx)
      ├── executescript(SCHEMA)      # Drops + rebuilds all tables
      ├── INSERT transactions        # Assigns merchants → employees via MD5 hash (deterministic)
      ├── llm_categorize()           # One Claude call → mcc_codes.category; cached in llm_categories.json
      └── detect_violations()        # Precomputes policy violations into violations + violation_transactions
```

### Database Schema (3NF, SQLite at `src/expense.db`)

- `departments` / `department_budgets` — org structure and quarterly budgets
- `employees` / `employee_departments` — SCD Type 2 history (one demo transfer baked in to exercise temporal join)
- `mcc_codes` — MCC integer → label + category; categories start as ISO range defaults, then overwritten by LLM
- `transactions` — lean fact table, raw values only (no derived columns)
- `violations` / `violation_transactions` — precomputed policy violations with severity (1–5), `status` (`open`/`resolved`/`dismissed`), `resolution_note`, and junction to relevant txns
- `pre_approvals` — persisted approval decisions (`pending`/`approved`/`denied`) with employee, merchant, amount, reason, and timestamps
- `v_transactions` (VIEW) — the primary query surface for the agent; computes `amount_cad`, resolves `mcc_label`/`category`, and performs the temporal department join

### Employee Simulation

No real cardholder data exists in the source Excel. `pipeline.py` creates 33 synthetic employees across 6 departments and assigns each transaction to an employee by MD5-hashing the merchant name — same merchant always maps to the same employee, making per-person spending patterns coherent across runs. Employee 1 has a mid-period department transfer (2026-01-01) to demonstrate SCD2 attribution.

### LLM Categorization

`llm_categorize()` sends all distinct MCCs (with spend totals) in one prompt to `claude-sonnet-4-6` (hardcoded in `pipeline.py`) and requests 8–12 business-relevant categories. The result is validated (3–20 categories required) and cached in `src/llm_categories.json`. Delete that file to force re-categorization. On any failure the ISO range fallback in `category_for()` is kept.

### Policy Violation Rules (`detect_violations`)

| Rule | Trigger | Severity |
|------|---------|----------|
| `missing_preauthorization` | Debit > $50 CAD with no approval (deterministic subset: `txn_id % 7 == 0`) | 2–4 |
| `possible_split_purchase` | ≥2 charges, same employee+merchant+day, total > $500 | 4 |
| `personal_expense_suspected` | MCC in `PERSONAL_MCCS` (currently only 5947 gift shops) | 5 |
| `duplicate_charge` | ≥2 identical amount+merchant+date combos, each ≥ $20 | 3 |

### Agent Layer (`src/agent.py` + `src/tools.py`)

**`tools.py`** exports three things consumed by `agent.py`:
- `TOOLS` — list of 5 Anthropic tool-use schemas
- `EXECUTORS` — dict mapping tool name → executor function
- `DB_SCHEMA_DOC` — schema string embedded in the system prompt and `query_db` description

**The 5 tools:**

| Tool | Type | Purpose |
|------|------|---------|
| `query_db` | read | Free-form SELECT against the DB; errors returned as JSON so the agent can self-correct |
| `get_employee_context` | read | Pre-assembled employee briefing (spend history, open violations, prior approvals, budget) — used before any approval recommendation |
| `render_chart` | side-effect | Agent passes pre-computed data; frontend renders the chart |
| `resolve_violation` | write | Marks a violation `resolved` or `dismissed` with an optional note |
| `record_approval_decision` | write | Persists an `approved`/`denied`/`pending` decision to `pre_approvals` |

**`agent.py`** provides two entry points:
- `run_agent(messages, on_chart=None) -> str` — full agentic loop for open-ended queries; `messages` is mutated in place for session continuity; `on_chart` callback receives chart specs for the frontend
- `recommend_approval(employee_id, amount, merchant, purpose) -> dict` — one-shot pre-approval recommendation; returns `{recommendation, confidence, reasoning, conditions, merchant, amount_cad, employee_id}` ready to pass directly to `record_approval_decision`

Both must be called from `src/` (same CWD requirement as the pipeline).

## Key Constants to Know

- `PREAUTH_THRESHOLD = 50.00` — dollar threshold requiring pre-authorization
- `DATA_START = "2025-08-01"` — start date for SCD2 assignment history
- `TRANSFER` dict — the single demo department transfer used to exercise temporal joins
- `PERSONAL_MCCS = (5947,)` — extend this tuple to flag more personal-use categories
