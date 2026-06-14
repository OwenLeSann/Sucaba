"""
The agent loop file allows the user to continuously interact with the assistant, which can call tools (e.g. query_db) to answer the user's questions.
The agent loop works as follows:

  1. Send the conversation + tool schemas to the API.
  2. If stop_reason == "tool_use", execute each requested tool locally,
     append the results as tool_result blocks in a NEW user message,
     and call the API again.
  3. Repeat until stop_reason == "end_turn", then return the text.
  
Conversation state is just the `messages` list — keep appending to it and
follow-up questions ("how does that compare to engineering?") work for free.
"""
import json
import anthropic
from tools import TOOLS, EXECUTORS, DB_SCHEMA_DOC

MODEL = "claude-sonnet-4-6"   # Good speed, lower token usage than larger models
MAX_TOOL_ROUNDS = 12          # Circuit breaker to prevent agent from spinning forever

# For demo: Unique to the dummy database and policy, change if SMB transaction dataset or policies change
SYSTEM_PROMPT = f"""You are the expense intelligence assistant for a ~50-person
logistics SMB. You answer the finance team's questions about company card
spending, check transactions against the expense policy, and prepare
approval recommendations.

{DB_SCHEMA_DOC}

Key policy rules (from the company expense policy):
- All expenses over $50.00 require manager pre-authorization.
- Receipts with listed customer names and purpose are required for reimbursement; submit within the month.
- Alcohol is only expensable when dining with a customer.
- Meal tips reimbursed up to 20%; service tips up to 15%.
- Corporate cards must never be used for personal expenses.
- No reimbursement for traffic/parking tickets, personal car rentals, or for damaged personal or rental vehicles.
- Rental cars should be shared between employees when possible, for example three employees attending the same business trip should only require one car rental.
- Nonstandard car rentals (e.g. luxury vehicles) require CFO approval regardless of amount.
- Kilometers driven for work can be reimbursed in CAD at $0.73 per km for the first 5,000 kilometres and $0.67 per km thereafter

Guidelines:
- Use query_db for anything quantitative. Query the v_transactions view
  for spend questions — it has amount_cad, category, and historically
  correct department built in. Write tight aggregations, not row dumps.
  If a query errors, read the error and fix the SQL.
- Call render_chart when a trend, comparison, or breakdown is involved.
- Amounts: always total amount_cad (pre-normalized to CAD in the view).
- Be concise and concrete: a finance manager is reading this.
- When you flag issues, rank by severity and name the employee and amounts.
"""

client = anthropic.Anthropic()

"""
Run one user turn to completion. `messages` is mutated in place so the
caller can keep it as session state. `on_chart` receives chart specs.
"""
def run_agent(messages: list, on_chart=None) -> str:
    for _ in range(MAX_TOOL_ROUNDS):
        response = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )
        # Always append the assistant turn (it may contain text + tool calls)
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            return "".join(b.text for b in response.content if b.type == "text")

        # Execute every tool call in this turn and build tool_result blocks
        results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            if block.name == "render_chart" and on_chart:
                on_chart(block.input)          # push spec to the frontend
            executor = EXECUTORS.get(block.name)
            output = executor(block.input) if executor else json.dumps(
                {"error": f"Unknown tool {block.name}"})
            results.append({
                "type": "tool_result",
                "tool_use_id": block.id,       # must match the tool_use block
                "content": output,
            })
        messages.append({"role": "user", "content": results})

    return "I hit the tool-call limit for this question — try narrowing it."

"""
One-shot pre-approval recommendation. 
Returns a structured dict the caller can act on immediately.
Does not persist the decision, call EXECUTORS['record_approval_decision'] after.
"""
def recommend_approval(
    employee_id: int,
    amount: float,
    merchant: str,
    purpose: str,
) -> dict:
    context = EXECUTORS["get_employee_context"]({"employee_id": employee_id})
    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": (
                f"An approval request needs a recommendation.\n"
                f"Merchant: {merchant}\n"
                f"Amount: ${amount:,.2f} CAD\n"
                f"Purpose: {purpose}\n"
                f"Employee context (JSON): {context}\n\n"
                "Respond with ONLY a JSON object, no markdown fences:\n"
                '{"recommendation": "approve"|"deny"|"escalate",\n'
                ' "confidence": "high"|"medium"|"low",\n'
                ' "reasoning": "2-3 sentences citing spend history, budget '
                'status, and policy",\n'
                ' "conditions": ["any conditions, e.g. receipt required"]}'
            ),
        }],
    )
    text = "".join(b.text for b in response.content if b.type == "text")
    try:
        result = json.loads(text.strip().removeprefix("```json").removesuffix("```"))
    except json.JSONDecodeError:
        result = {"recommendation": "escalate", "confidence": "low",
                  "reasoning": f"Could not parse model output: {text[:200]}",
                  "conditions": []}
    result["merchant"] = merchant
    result["amount_cad"] = amount
    result["employee_id"] = employee_id
    return result

# Minimal test
if __name__ == "__main__":
    history = []
    print("Expense agent ready (ctrl-c to exit). Try: "
          "'What did Fleet spend on fuel in October?'")
    while True:
        q = input("\nyou> ").strip()
        if not q:
            continue
        history.append({"role": "user", "content": q})
        answer = run_agent(history, on_chart=lambda s: print(
            f"[chart] {s.get('type')}: {s.get('title')}"))
        print(f"\nagent> {answer}")
