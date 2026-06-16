"""
Gives tool definitions (JSON schemas sent to the Claude API) and the
matching executor functions for the provided schema.
"""
import datetime, json, re, sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "expense.db"

DB_SCHEMA_DOC = """
PRIMARY QUERY SURFACE — use this view for almost everything:
  v_transactions(id, txn_date TEXT 'YYYY-MM-DD', posting_date, description,
      merchant, amount_orig, currency, conversion_rate, debit_credit
      ('Debit'|'Credit'), mcc INT, city, state, country, employee_id,
      amount_cad REAL,   -- normalized CAD, ALWAYS use this for totals
      mcc_label TEXT, category TEXT,
      department TEXT)   -- historically correct (dept at charge time)

Base tables (query directly only when needed):
  departments(name PK)
  department_budgets(department, quarter '2025-Q4', budget_cad)
  employees(id PK, name)
  employee_departments(employee_id, valid_from, valid_to, department)
      -- assignment history; current dept = row WHERE valid_to IS NULL
  mcc_codes(mcc PK, label, category)
  violations(id PK, employee_id, rule, detail, severity 1-5,
             status TEXT 'open'|'resolved'|'dismissed', resolution_note TEXT)
  violation_transactions(violation_id, txn_id)
      -- join violations to v_transactions through this junction
  pre_approvals(id PK, employee_id, requested_at ISO-datetime,
                merchant, amount_cad REAL, mcc INT,
                decision TEXT 'pending'|'approved'|'denied',
                reason TEXT, decided_at ISO-datetime)

Notes: filter debit_credit='Debit' for spend (credits are refunds).
Quarter expression: (strftime('%Y',txn_date)||'-Q'||(((CAST(strftime('%m',txn_date) AS INT)-1)/3)+1))
Data covers 2025-08-06 to 2026-03-27 (quarters 2025-Q3 .. 2026-Q1).
"""

# Tool schemas --
TOOLS = [
    {
        "name": "query_db",
        "description": (
            "Run a read-only SQL query against the company expense database "
            "and get rows back as JSON. Use this for any question about "
            "spending, merchants, employees, departments, budgets, or "
            "violations.\n" + DB_SCHEMA_DOC +
            "\nOnly SELECT statements are allowed. Always LIMIT results "
            "(max 200 rows). Prefer aggregations over raw row dumps. "
            "Example — dollar exposure per violation rule:\n"
            "  SELECT v.rule, ROUND(SUM(t.amount_cad),2) FROM violations v "
            "JOIN violation_transactions vt ON vt.violation_id=v.id "
            "JOIN v_transactions t ON t.id=vt.txn_id GROUP BY v.rule"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sql": {"type": "string", "description": "A single SELECT statement."},
            },
            "required": ["sql"],
        },
    },
    {
        "name": "get_employee_context",
        "description": (
            "Fetch a pre-assembled briefing on one employee: current "
            "department, monthly spend, top categories, violation history, "
            "and the current department's latest-quarter budget status. Use "
            "this when evaluating an approval request or investigating a "
            "person — it's faster and more complete than several query_db "
            "calls."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"employee_id": {"type": "integer"}},
            "required": ["employee_id"],
        },
    },
    {
        "name": "resolve_violation",
        "description": (
            "Mark a policy violation as 'resolved' or 'dismissed' and record an "
            "optional note. Use after a finance manager reviews a flag. "
            "Get violation IDs from query_db or get_employee_context first."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "violation_id":    {"type": "integer"},
                "status":          {"type": "string", "enum": ["resolved", "dismissed"]},
                "resolution_note": {"type": "string"},
            },
            "required": ["violation_id", "status"],
        },
    },
    {
        "name": "record_approval_decision",
        "description": (
            "Persist an approval decision (approved / denied / pending) to the "
            "pre_approvals table. Always call check_preapproval context via "
            "get_employee_context first, then record the outcome here."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "employee_id": {"type": "integer"},
                "amount_cad":  {"type": "number"},
                "merchant":    {"type": "string"},
                "decision":    {"type": "string", "enum": ["approved", "denied", "pending"]},
                "reason":      {"type": "string", "description": "Explanation for the decision"},
                "mcc":         {"type": "integer"},
            },
            "required": ["employee_id", "amount_cad", "merchant", "decision"],
        },
    },
    {
        "name": "render_chart",
        "description": (
            "Display a chart to the user in the UI. Call this whenever a "
            "visualization would communicate better than prose — trends, "
            "comparisons, breakdowns. You supply the already-computed data "
            "(get it from query_db first); the frontend renders it. After "
            "calling this, summarize the key takeaway in one or two "
            "sentences — don't repeat the data."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": ["bar", "line", "pie", "table"]},
                "title": {"type": "string"},
                "x_label": {"type": "string"},
                "y_label": {"type": "string"},
                "series": {
                    "type": "array",
                    "description": "One or more named series. For pie/table, use one series.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "points": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "x": {"type": "string"},
                                        "y": {"type": "number"},
                                    },
                                    "required": ["x", "y"],
                                },
                            },
                        },
                        "required": ["name", "points"],
                    },
                },
            },
            "required": ["type", "title", "series"],
        },
    },
]
# --

# Executors --
# Database is read-only, but to be safe we enforce this with regex and in the SQL layer
_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|attach|pragma|vacuum|replace)\b",
    re.IGNORECASE,
)

"""Connects to the database in read-only mode."""
def _connect():
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn

"""Connects to the database in read-write mode."""
def _connect_rw():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

"""Executes a SQL query from the model, enforcing read-only and returning top 200 results or errors as JSON."""
def exec_query_db(sql: str) -> str:
    sql = sql.strip().rstrip(";")
    if not sql.lower().startswith(("select", "with")):
        return json.dumps({"error": "Only SELECT queries are allowed."})
    if _FORBIDDEN.search(sql) or ";" in sql:
        return json.dumps({"error": "Query rejected: write keywords or multiple statements."})
    try:
        conn = _connect()
        rows = [dict(r) for r in
                conn.execute(f"SELECT * FROM ({sql}) LIMIT 200").fetchall()]
        conn.close()
        return json.dumps({"row_count": len(rows), "rows": rows}, default=str)
    except sqlite3.Error as e:
        return json.dumps({"error": str(e)}) # Return the error TO THE MODEL, it iteratively reads it and fixes its SQL.

"""
Executes a get_employee_context tool call, returning the assembled context as JSON.
The context includes the employee's current department, department history, monthly spend, top categories, violation history, and current department budget status.
"""
def exec_get_employee_context(employee_id: int) -> str:
    conn = _connect()
    try:
        emp = conn.execute("SELECT * FROM employees WHERE id=?", (employee_id,)).fetchone()
        if not emp:
            return json.dumps({"error": f"No employee with id {employee_id}"})
        ctx = {"employee": dict(emp)}

        cur_dept = conn.execute(
            "SELECT department FROM employee_departments "
            "WHERE employee_id=? AND valid_to IS NULL", (employee_id,)).fetchone()
        ctx["current_department"] = cur_dept["department"] if cur_dept else None
        ctx["department_history"] = [dict(r) for r in conn.execute(
            "SELECT department, valid_from, valid_to FROM employee_departments "
            "WHERE employee_id=? ORDER BY valid_from", (employee_id,))]
        ctx["monthly_spend"] = [dict(r) for r in conn.execute(
            """SELECT substr(txn_date,1,7) AS month,
                      ROUND(SUM(amount_cad),2) AS cad
               FROM v_transactions WHERE employee_id=? AND debit_credit='Debit'
               GROUP BY 1 ORDER BY 1""", (employee_id,))]
        ctx["top_categories"] = [dict(r) for r in conn.execute(
            """SELECT category, COUNT(*) AS n, ROUND(SUM(amount_cad),2) AS cad
               FROM v_transactions WHERE employee_id=? AND debit_credit='Debit'
               GROUP BY 1 ORDER BY cad DESC LIMIT 5""", (employee_id,))]
        # Only open violations — resolved/dismissed ones should not weigh against the employee.
        ctx["open_violations"] = [dict(r) for r in conn.execute(
            "SELECT rule, detail, severity, status FROM violations "
            "WHERE employee_id=? AND status='open' "
            "ORDER BY severity DESC LIMIT 10", (employee_id,))]
        ctx["prior_approvals"] = [dict(r) for r in conn.execute(
            "SELECT merchant, amount_cad, decision, reason, requested_at "
            "FROM pre_approvals WHERE employee_id=? "
            "ORDER BY requested_at DESC LIMIT 10", (employee_id,))]

        # Budget status for current department, latest quarter in the data.
        if cur_dept:
            ctx["department_budget"] = (lambda r: dict(r) if r else None)(
                conn.execute("""
                    WITH latest AS (
                      SELECT MAX(quarter) AS q FROM department_budgets
                    ), spend AS (
                      SELECT ROUND(SUM(t.amount_cad),2) AS spent
                      FROM v_transactions t, latest
                      WHERE t.department=? AND t.debit_credit='Debit'
                        AND (CAST(substr(t.txn_date,1,4) AS TEXT) || '-Q' ||
                             CAST((CAST(substr(t.txn_date,6,2) AS INT)-1)/3+1 AS TEXT))
                            = latest.q
                    )
                    SELECT b.department, b.quarter, b.budget_cad, s.spent,
                           ROUND(b.budget_cad - COALESCE(s.spent,0),2) AS remaining
                    FROM department_budgets b, latest, spend s
                    WHERE b.department=? AND b.quarter=latest.q""",
                    (cur_dept["department"], cur_dept["department"])).fetchone())
    finally:
        conn.close()
    return json.dumps(ctx, default=str)

"""
Executes a render_chart tool call. 
The backend forwards the chart spec to the frontend for rendering and returns an acknowledgment JSON.
"""
def exec_render_chart(spec: dict) -> str:
    return json.dumps({"status": "rendered", "title": spec.get("title")})

"""
Executes a resolve_violation tool call, updating the violation status and resolution note in the database. 
Returns a JSON acknowledgment or error message.
"""
def exec_resolve_violation(violation_id: int, status: str, resolution_note: str | None = None) -> str:
    if status not in ("resolved", "dismissed"):
        return json.dumps({"error": "status must be 'resolved' or 'dismissed'"})
    conn = _connect_rw()
    cur = conn.execute(
        "UPDATE violations SET status=?, resolution_note=? WHERE id=?",
        (status, resolution_note, violation_id))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return json.dumps({"error": f"Violation {violation_id} not found"})
    return json.dumps({"ok": True, "violation_id": violation_id, "status": status})

"""
Executes a record_approval_decision tool call, inserting a new pre-approval record into the database with the provided decision and details.
Returns a JSON acknowledgment with the new pre-approval ID and decision details, or an error message"""
def exec_record_approval_decision(
    employee_id: int, amount_cad: float, merchant: str, decision: str,
    reason: str | None = None, mcc: int | None = None,
) -> str:
    if decision not in ("approved", "denied", "pending"):
        return json.dumps({"error": "decision must be 'approved', 'denied', or 'pending'"})
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    decided_at = now if decision != "pending" else None
    conn = _connect_rw()
    cur = conn.execute(
        "INSERT INTO pre_approvals "
        "(employee_id, requested_at, merchant, amount_cad, mcc, decision, reason, decided_at) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (employee_id, now, merchant, amount_cad, mcc, decision, reason, decided_at))
    conn.commit()
    conn.close()
    return json.dumps({"ok": True, "pre_approval_id": cur.lastrowid,
                       "decision": decision, "decided_at": decided_at})

EXECUTORS = {
    "query_db":                 lambda inp: exec_query_db(inp["sql"]),
    "get_employee_context":     lambda inp: exec_get_employee_context(inp["employee_id"]),
    "render_chart":             lambda inp: exec_render_chart(inp),
    "resolve_violation":        lambda inp: exec_resolve_violation(**inp),
    "record_approval_decision": lambda inp: exec_record_approval_decision(**inp),
}
# --