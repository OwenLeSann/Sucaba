"""
Loads raw transaction xlsx data into a 3NF relational database. 
Constructs database, augments data, and pre-computes policy violations.

Database schema:
    departments             — Department names
    department_budgets      — Budget per (department, quarter)
    employees               — Identity
    employee_departments    — SCD2 assignment history (valid_from/valid_to)
    mcc_codes               — MCC -> label/category lookup
    pre_approvals           — Employee-initiated pre-authorization requests
    transactions            — Lean fact table, raw values only
    violations              — Policy violations
    violation_transactions  — Junction: Which charges each policy violation covers
    v_transactions (VIEW)   — Denormalized query surface: Computes amount_cad,
                              looks up mcc_label, looks up category, and computes historically
                              correct department via a temporal join
"""
import sys, sqlite3, random, hashlib, os, anthropic, json
from datetime import datetime
import pandas as pd

DB_PATH = "expense.db"

# MCC lookup codes --
"""
Returns the MCC category of a given MCC.
Always runs and is used if LLM categorization fails or is unavailable, providing a deterministic default categorization based on ISO-defined MCC ranges.
"""
def category_for(mcc: int) -> str:
    if 1 <= mcc <= 1499: return "Agricultural Services"
    if 1500 <= mcc <= 2990: return "Contracted Services"
    if 3000 <= mcc <= 3299: return "Airlines"
    if 3300 <= mcc <= 3499: return "Car Rental"
    if 3500 <= mcc <= 3999: return "Lodging"
    if 4000 <= mcc <= 4999: return "Utility Services"
    if 5000 <= mcc <= 5599: return "Retail Outlet Services"
    if 5600 <= mcc <= 5699: return "Clothing Stores"
    if 5700 <= mcc <= 7299: return "Miscellaneous Services"
    if 7300 <= mcc <= 7999: return "Business Services"
    if 8000 <= mcc <= 8999: return "Professional Services and Membership Organizations"
    if 9000 <= mcc <= 9999: return "Government Services"
    return "Other (review)"

_mcc_csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../data/mcc_codes.csv")
_mcc_df = pd.read_csv(_mcc_csv_path)
MCC_LABELS = dict(zip(_mcc_df["mcc"].astype(int), _mcc_df["edited_description"]))
MCC_ROWS = [(c, MCC_LABELS[c], category_for(c)) for c in sorted(MCC_LABELS)]

# Caches LLM defined categories to avoid repeated API calls on same data
CATEGORY_CACHE = "llm_categories.json"

"""
Refines mcc_codes.category using one LLM call over the MCCs actually present in the data, weighted by spend. 
Safe no-op on any failure.
"""
def llm_categorize(conn):
    # Distinct codes in the data with labels and spend, categorize by total spend to prioritize the most important ones in the prompt
    rows = conn.execute("""
        SELECT t.mcc, m.label, ROUND(SUM(t.amount_orig * CASE WHEN t.conversion_rate > 0 THEN t.conversion_rate ELSE 1 END), 0) AS cad, COUNT(*) AS n
        FROM transactions t JOIN mcc_codes m ON m.mcc = t.mcc
        WHERE t.debit_credit = 'Debit' AND t.mcc IS NOT NULL
        GROUP BY t.mcc ORDER BY cad DESC""").fetchall()
    if not rows:
        return # No MCCs to categorize, skip LLM call

    cache_path = os.path.join(os.path.dirname(DB_PATH), CATEGORY_CACHE)
    mapping = None
    if os.path.exists(cache_path):
        mapping = {int(k): v for k, v in json.load(open(cache_path)).items()}
    else:
        try:
            client = anthropic.Anthropic()
            listing = "\n".join(f"{mcc}: {label} (${cad:,.0f}, {n} txns)" for mcc, label, cad, n in rows)
            resp = client.messages.create(
                model="claude-sonnet-4-6", max_tokens=4000,
                messages=[{"role": "user", "content":
                    "Below are the merchant category codes present in one "
                    "company's card transactions, with official descriptions "
                    "and total spend. Infer the business type, then propose "
                    "8-12 budget categories a finance manager at this company "
                    "would want, and assign EVERY code to exactly one. "
                    "Categories must be short (1-3 words). Respond with ONLY "
                    "a JSON object mapping code to category, no markdown "
                    "fences, e.g. {\"5541\": \"Fuel\"}.\n\n" + listing}])
            text = "".join(b.text for b in resp.content if b.type == "text")
            mapping = {int(k): str(v) for k, v in
                       json.loads(text.strip().removeprefix("```json")
                                  .removesuffix("```")).items()}
            json.dump(mapping, open(cache_path, "w"), indent=1)
        except Exception as e:
            print(f"LLM categorization skipped ({type(e).__name__}: {e}); "
                  f"keeping ISO range categories.")
            return

    # Reject degenerate mappings with too few or too many categories
    cats = set(mapping.values())
    if not (3 <= len(cats) <= 20):
        print(f"LLM mapping rejected ({len(cats)} categories); keeping ISO ranges.")
        return
    conn.executemany("UPDATE mcc_codes SET category=? WHERE mcc=?", [(c, m) for m, c in mapping.items()])
    conn.commit()
    print(f"LLM categories applied: {len(mapping)} codes -> {len(cats)} buckets")
# --

# Simulated employee layer --
# Because no cardholder identity (employee name, department, and card number) is provided in the dummy transaction xlsx, we simulate our own to demonstrate the platforms features
# Each merchant name hashes to the same employee every run, keeping person-by-person spending patterns coherent
# Arbitary business departments (name, headcount, budget per quarter CAD)
DEPARTMENTS = [
    ("Fleet",       7, 300000),
    ("Operations",  9, 750000),
    ("Sales",       5, 250000),
    ("Marketing",   4, 250000),
    ("Engineering", 5, 250000),
    ("Finance",     3, 300000),
]
# Arbitrary employee first and last names
FIRST = ["Sarah","Marcus","Priya","Dan","Aisha","Kevin","Lena","Omar","Grace",
         "Tyler","Nina","Raj","Emily","Jordan","Sofia","Liam","Maya","Chris",
         "Hannah","Diego","Amara","Pete","Yuki","Tom","Isabelle","Noah",
         "Fatima","Eric","Chloe","Sam","Ravi","Anna","Jake"]
LAST  = ["Chen","Tremblay","Patel","Okafor","Smith","Garcia","Kim","Dubois",
         "Singh","Brown","Rossi","Nguyen","Wilson","Kaur","Lopez","Murphy",
         "Tanaka","Roy","Schmidt","Ali","Foster","Bouchard","Olsen","Reyes",
         "Novak","Cohen","Diallo","Park","Moreau","Walsh","Iyer","Hansen","Kelly"]

DATA_START = "2025-08-01" # Day 0 for assignment history
# For demo: Employee 1 transfers departments mid-period so the temporal join provably attributes their earlier spend to the old department (SCD2 property)
TRANSFER = {"employee_id": 1, "on": "2026-01-01", "to": "Sales"}

"""Builds lists of employees (unique eid, name) and their assignments (eid, valid_from, valid_to if transfered, department)."""
def build_employees():
    random.seed(22)
    total = sum(h for _, h, _ in DEPARTMENTS)
    assert total <= len(FIRST) and total <= len(LAST), (f"Need {total} names but only have {min(len(FIRST), len(LAST))}") # Departments headcount must me less than or equalt to the minimum number of names
    names = [f"{f} {l}" for f, l in zip(random.sample(FIRST, total), random.sample(LAST, 33))]
    it = iter(names)
    employees, assignments, eid = [], [], 1
    for dept, headcount, _ in DEPARTMENTS:
        for _ in range(headcount):
            employees.append((eid, next(it)))
            if eid == TRANSFER["employee_id"]:
                assignments.append((eid, DATA_START, TRANSFER["on"], dept))
                assignments.append((eid, TRANSFER["on"], None, TRANSFER["to"]))
            else:
                assignments.append((eid, DATA_START, None, dept))
            eid += 1
    return employees, assignments

"""Hash assigning merchant to eid in [1, n_employees]."""
def assign_employee(merchant: str, n_employees: int) -> int:
    h = int(hashlib.md5(merchant.strip().upper().encode()).hexdigest(), 16) # MD5 hash (hexadecimal) of normalized merchant name (string) as integer
    return (h % n_employees) + 1

"""Converts ISO dates (YYYY-MM-DD) into annual quarters (YYYY-Q[1-4])."""
def quarter_of(iso_date: str) -> str:
    y, m = int(iso_date[:4]), int(iso_date[5:7])
    return f"{y}-Q{(m - 1) // 3 + 1}"
# --

# Database schema --
SCHEMA = """
DROP VIEW  IF EXISTS v_transactions;
DROP TABLE IF EXISTS pre_approvals;
DROP TABLE IF EXISTS violation_transactions;
DROP TABLE IF EXISTS violations;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS employee_departments;
DROP TABLE IF EXISTS department_budgets;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS mcc_codes;
DROP TABLE IF EXISTS departments;

CREATE TABLE departments (
    name TEXT PRIMARY KEY
);
CREATE TABLE department_budgets (
    department TEXT NOT NULL REFERENCES departments(name),
    quarter    TEXT NOT NULL,
    budget_cad REAL NOT NULL,
    PRIMARY KEY (department, quarter)
);
CREATE TABLE employees (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);
CREATE TABLE employee_departments (          -- SCD Type 2 history
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    valid_from  TEXT NOT NULL,               -- inclusive
    valid_to    TEXT,                        -- exclusive; NULL = current
    department  TEXT NOT NULL REFERENCES departments(name),
    PRIMARY KEY (employee_id, valid_from)
);
CREATE TABLE mcc_codes (
    mcc      INTEGER PRIMARY KEY,
    label    TEXT NOT NULL,
    category TEXT NOT NULL
);
CREATE TABLE transactions (
    id              INTEGER PRIMARY KEY,
    txn_date        TEXT NOT NULL,           -- ISO 'YYYY-MM-DD'
    posting_date    TEXT,
    description     TEXT,
    merchant        TEXT NOT NULL,
    amount_orig     REAL NOT NULL,
    currency        TEXT NOT NULL,           -- 'CAD' | 'USD'
    conversion_rate REAL NOT NULL,           -- 0 implies $ already CAD
    debit_credit    TEXT NOT NULL,           -- 'Debit' | 'Credit'
    mcc             INTEGER REFERENCES mcc_codes(mcc),
    city TEXT, state TEXT, country TEXT,
    employee_id     INTEGER NOT NULL REFERENCES employees(id)
);
CREATE TABLE violations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id     INTEGER REFERENCES employees(id),
    rule            TEXT NOT NULL,
    detail          TEXT,
    severity        INTEGER NOT NULL,        -- 1 low .. 5 high
    status          TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'resolved' | 'dismissed'
    resolution_note TEXT
);
CREATE TABLE violation_transactions (
    violation_id INTEGER NOT NULL REFERENCES violations(id),
    txn_id       INTEGER NOT NULL REFERENCES transactions(id),
    PRIMARY KEY (violation_id, txn_id)
);
CREATE TABLE pre_approvals (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id  INTEGER NOT NULL REFERENCES employees(id),
    requested_at TEXT NOT NULL,              -- ISO datetime (UTC)
    merchant     TEXT NOT NULL,
    amount_cad   REAL NOT NULL,
    mcc          INTEGER REFERENCES mcc_codes(mcc),
    decision     TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'denied'
    reason       TEXT,
    decided_at   TEXT                        -- ISO datetime; NULL while pending
);

CREATE INDEX idx_txn_date ON transactions(txn_date);
CREATE INDEX idx_txn_emp  ON transactions(employee_id);
CREATE INDEX idx_txn_mcc  ON transactions(mcc);
CREATE INDEX idx_ed_emp   ON employee_departments(employee_id, valid_from);
CREATE INDEX idx_vt_txn   ON violation_transactions(txn_id);

-- Denormalized query surface. Pays the join cost at READ time so the
-- stored tables stay redundancy-free. Agent points here.
CREATE VIEW v_transactions AS
SELECT t.*,
       ROUND(t.amount_orig * CASE WHEN t.conversion_rate > 0
             THEN t.conversion_rate ELSE 1 END, 2) AS amount_cad,
       m.label    AS mcc_label,
       m.category AS category,
       ed.department
FROM transactions t
LEFT JOIN mcc_codes m ON m.mcc = t.mcc
LEFT JOIN employee_departments ed
       ON ed.employee_id = t.employee_id
      AND t.txn_date >= ed.valid_from
      AND (ed.valid_to IS NULL OR t.txn_date < ed.valid_to);
"""
# --

# Deterministic policy rules (to search for transaction violations)
PREAUTH_THRESHOLD = 50.00 # All expenses over $50.00 must be pre-authorized
# For optional addition, flag MCCs highly correlated with personal spending
# Expand list with more later*
PERSONAL_MCCS = (5947,) # Gift shops

"""
Detects and writes policy violations with severity into violations table.
Violations are precomputed and stored to avoid recomputing by agent for each violating transaction.
"""
def detect_violations(conn):
    cur = conn.cursor()

    """Inserts a policy violation entry into violations table."""
    def add(eid, rule, detail, severity, txn_ids):
        cur.execute(
            "INSERT INTO violations (employee_id, rule, detail, severity) "
            "VALUES (?,?,?,?)", (eid, rule, detail, severity))
        vid = cur.lastrowid
        cur.executemany("INSERT OR IGNORE INTO violation_transactions VALUES (?,?)", [(vid, int(t)) for t in txn_ids])

    # Rule 1: Transaction over pre-authorized threshold
    for tid, eid, merch, amt in cur.execute(
            "SELECT id, employee_id, merchant, amount_cad FROM v_transactions "
            "WHERE debit_credit='Debit' AND amount_cad > ?",
            (PREAUTH_THRESHOLD,)).fetchall():
        if tid % 7 == 0: # For demo: A deterministic subset lacks approval
            sev = 2 if amt < 200 else (3 if amt < 500 else 4)
            add(eid, "missing_preauthorization",
                f"${amt:,.2f} at {merch} exceeds the $50 pre-authorization "
                f"threshold with no approval on file.", sev, [tid])

    # Rule 2: Split purchases => same employee + merchant + day, sum > 500
    for ids, eid, merch, day, n, total in cur.execute("""
            SELECT GROUP_CONCAT(id), employee_id, merchant, txn_date, COUNT(*), SUM(amount_cad)
            FROM v_transactions WHERE debit_credit='Debit'
            GROUP BY employee_id, merchant, txn_date
            HAVING COUNT(*) >= 2 AND SUM(amount_cad) > 500""").fetchall():
        add(eid, "possible_split_purchase",
            f"{n} charges at {merch} on {day} totaling ${total:,.2f} — "
            f"may be split to stay under approval thresholds.", 4,
            ids.split(","))

    # Rule 3: Personal-use merchant categories on a corporate card
    for tid, eid, merch, amt in cur.execute(
            "SELECT id, employee_id, merchant, amount_cad FROM v_transactions "
            "WHERE mcc IN (%s) AND debit_credit='Debit'"
            % ",".join(map(str, PERSONAL_MCCS))).fetchall():
        add(eid, "personal_expense_suspected",
            f"${amt:,.2f} at {merch} (gift/novelty merchant) — corporate "
            f"cards may not be used for personal expenses.", 5, [tid])

    # Rule 4: Exact duplicate charges (same merchant, amount, date)
    for ids, eid, merch, day, amt, n in cur.execute("""
            SELECT GROUP_CONCAT(id), employee_id, merchant, txn_date, amount_cad, COUNT(*)
            FROM v_transactions WHERE debit_credit='Debit' AND amount_cad >= 20
            GROUP BY merchant, txn_date, amount_cad
            HAVING COUNT(*) >= 2""").fetchall():
        add(eid, "duplicate_charge",
            f"{n} identical ${amt:,.2f} charges at {merch} on {day} — "
            f"possible duplicate billing.", 3, ids.split(","))
    conn.commit()
# --

# Main --
"""Opens the transaction data, builds all tables of database according to schema, augments and inserts transactions data, and detects and populates policy violations."""
def main(xlsx_path):
    df = pd.read_excel(xlsx_path, engine="openpyxl", header=0) # Parse .xlsx file and skip header
    df = df.astype(object).where(df.notna(), None) # Convert NaN/NaT to None
    rows = df.itertuples(index=False, name=None)
    employees, assignments = build_employees()
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    conn.executemany("INSERT INTO departments VALUES (?)", [(d,) for d, _, _ in DEPARTMENTS])
    conn.executemany("INSERT INTO employees VALUES (?,?)", employees)
    conn.executemany("INSERT INTO employee_departments VALUES (?,?,?,?)", assignments)
    conn.executemany("INSERT INTO mcc_codes VALUES (?,?,?)", MCC_ROWS)

    inserted, dates_seen = 0, set()
    for r in rows:
        (code, desc, cat, post_dt, txn_dt, merchant, amount, dc, mcc, city, country, postal, state, conv) = r[:14]
        if amount is None or merchant is None: 
            continue
        conv = float(conv or 0)
        d = (txn_dt or post_dt)
        iso = d.date().isoformat() if isinstance(d, datetime) else str(d)
        dates_seen.add(iso)
        # Unknown MCCs must exist in the lookup or the FK (and view label), if comes back NULL then insert a stub row on first sight
        if mcc is not None:
            conn.execute("INSERT OR IGNORE INTO mcc_codes VALUES (?,?,?)", (int(mcc), f"MCC {int(mcc)}", category_for(int(mcc))))
        conn.execute(
            """INSERT INTO transactions
               (txn_date, posting_date, description, merchant, amount_orig,
                currency, conversion_rate, debit_credit, mcc,
                city, state, country, employee_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (iso,
             post_dt.date().isoformat() if isinstance(post_dt, datetime) else str(post_dt),
             str(desc), str(merchant).strip(), float(amount),
             "USD" if conv > 0 else "CAD", conv, str(dc),
             int(mcc) if mcc is not None else None,
             city, state, country,
             assign_employee(str(merchant), len(employees))))
        inserted += 1

    # Budgets: One row per department per quarter present in the data
    quarters = sorted({quarter_of(d) for d in dates_seen})
    conn.executemany("INSERT INTO department_budgets VALUES (?,?,?)", [(d, q, b) for d, _, b in DEPARTMENTS for q in quarters])
    conn.commit()
    llm_categorize(conn)
    detect_violations(conn)
    n_v = conn.execute("SELECT COUNT(*) FROM violations").fetchone()[0]
    print(f"Loaded {inserted} transactions, {len(employees)} employees, " f"{len(quarters)} quarters of budgets, {n_v} violations -> {DB_PATH}")
    conn.close()

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "dummy_data.xlsx") # Take any xlsx as input, default to dummy_data.xlsx
# --