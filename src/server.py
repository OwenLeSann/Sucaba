"""
FastAPI server wrapping the expense agent and database.
Run from src/ directory:  python server.py
"""
import asyncio
import sqlite3
from functools import partial
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from agent import run_agent

app = FastAPI(title="Expense Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "expense.db"

# In-memory session store: session_id -> messages list
sessions: dict[str, list] = {}


def _db_ro(sql: str, params: tuple = ()) -> list[dict]:
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute(sql, params).fetchall()]
    conn.close()
    return rows


def _db_rw(sql: str, params: tuple = ()) -> int:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(sql, params)
    conn.commit()
    conn.close()
    return cur.rowcount


# ---------- Pydantic models ----------

class ResolveRequest(BaseModel):
    status: str   # "resolved" | "dismissed"
    note: str | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str


# ---------- Endpoints ----------

@app.get("/api/summary")
def get_summary():
    monthly_spend = _db_ro("""
        SELECT substr(txn_date, 1, 7) AS month,
               ROUND(SUM(amount_cad), 2) AS total
        FROM v_transactions
        WHERE debit_credit = 'Debit'
        GROUP BY 1 ORDER BY 1
    """)

    budgets = _db_ro("""
        SELECT b.department, b.quarter, b.budget_cad,
               ROUND(COALESCE(s.spent, 0), 2) AS spent,
               ROUND(b.budget_cad - COALESCE(s.spent, 0), 2) AS remaining
        FROM department_budgets b
        LEFT JOIN (
            SELECT department, ROUND(SUM(amount_cad), 2) AS spent
            FROM v_transactions WHERE debit_credit = 'Debit'
            GROUP BY department
        ) s ON s.department = b.department
        WHERE b.quarter = (SELECT MAX(quarter) FROM department_budgets)
        ORDER BY b.department
    """)

    return {"monthly_spend": monthly_spend, "budgets": budgets}


@app.get("/api/violations")
def get_violations():
    rows = _db_ro("""
        SELECT v.id, v.employee_id, e.name AS employee_name,
               v.rule, v.detail, v.severity, v.status,
               ROUND(COALESCE(SUM(
                   CASE WHEN t.debit_credit = 'Debit' THEN t.amount_cad ELSE 0 END
               ), 0), 2) AS amount,
               MAX(t.txn_date) AS latest_txn_date
        FROM violations v
        JOIN employees e ON e.id = v.employee_id
        LEFT JOIN violation_transactions vt ON vt.violation_id = v.id
        LEFT JOIN v_transactions t ON t.id = vt.txn_id
        WHERE v.status = 'open'
        GROUP BY v.id, v.employee_id, e.name, v.rule, v.detail, v.severity, v.status
        ORDER BY v.severity DESC, amount DESC
    """)
    return {"violations": rows}


@app.post("/api/violations/{violation_id}/resolve")
def resolve_violation(violation_id: int, req: ResolveRequest):
    if req.status not in ("resolved", "dismissed"):
        raise HTTPException(400, "status must be 'resolved' or 'dismissed'")
    rows_affected = _db_rw(
        "UPDATE violations SET status=?, resolution_note=? WHERE id=?",
        (req.status, req.note, violation_id),
    )
    if rows_affected == 0:
        raise HTTPException(404, f"Violation {violation_id} not found")
    return {"ok": True, "violation_id": violation_id, "status": req.status}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    messages = sessions.setdefault(req.session_id, [])
    messages.append({"role": "user", "content": req.message})

    chart_specs: list = []

    def on_chart(spec: dict) -> None:
        chart_specs.append(spec)

    loop = asyncio.get_event_loop()
    try:
        text = await loop.run_in_executor(
            None, partial(run_agent, messages, on_chart)
        )
    except Exception as exc:
        # Remove the user message we just appended so the session stays coherent
        if messages and messages[-1].get("role") == "user":
            messages.pop()
        raise HTTPException(500, f"Agent error: {exc}") from exc

    return {"text": text, "chart": chart_specs[0] if chart_specs else None}


@app.delete("/api/chat/{session_id}")
def clear_session(session_id: str):
    sessions.pop(session_id, None)
    return {"ok": True}


# Serve the built frontend in production (when frontend/dist exists)
_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _DIST.exists():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="static")


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
