# Product

## Register

product

## Users

Finance managers and finance team members at a ~50-person logistics SMB. They work at a desk, typically with one or two monitors, and open this dashboard when they need to investigate spending, process violation flags, or act on an approval request. They are comfortable with Excel but not with raw SQL — they expect the tool to do the heavy lifting. Their primary mode is reactive: something flagged, they investigate, they resolve.

## Product Purpose

An AI-powered expense intelligence dashboard that gives finance managers real visibility into company card spending. The agent answers natural-language questions about spend ("What did Fleet spend on fuel in Q4?"), surfaces and prioritizes policy violations, and handles pre-authorization recommendations. The backend is fully built in Python + SQLite + Claude; this product is the interface that makes it usable for non-technical finance staff.

Success looks like: a finance manager opens the dashboard, sees the week's flagged violations at a glance, chats with the agent to investigate one, resolves it, and closes the tab — all in under five minutes.

## Brand Personality

Friendly, approachable, clear. Stripe and Mercury are the reference tone: clean light UI, excellent data density, soft neutrals. This is a professional tool that doesn't feel cold. Finance doesn't have to feel like a spreadsheet.

## Anti-references

- Generic SaaS purple/cream gradient combos — the saturated AI-startup aesthetic
- Excel-like enterprise grey — dense flat tables, legacy corporate visual language
- Dark / terminal aesthetic — too developer-facing for a finance audience
- Flashy animations — counting-up numbers, flying-in charts — feels toy-like, erodes trust

## Design Principles

1. **Trust through clarity** — Numbers must be unambiguous. Never decorate data or bury it in chrome. If the insight isn't immediately readable, the layout has failed.
2. **Conversation is the control surface** — The AI chat is not a sidebar feature. It's the primary way finance managers interact with the data; treat it as such.
3. **Data density without overwhelm** — Show what matters on every screen. Prioritize the most actionable item (open violations, budget status, pending approvals), not an exhaustive list of everything.
4. **Actions are one obvious click** — Resolve, dismiss, approve, deny — every consequential action should be surfaced clearly and require no hunting.
5. **Approachable, not corporate** — Readable typography, soft neutral palette, generous whitespace. Finance tools should feel like a helpful colleague, not a compliance audit.

## Accessibility & Inclusion

WCAG AA minimum. Ensure sufficient contrast for all body text (≥4.5:1), large text (≥3:1), and interactive elements. Support keyboard navigation for all actions (resolve, dismiss, approve, deny, submit chat). Respect `prefers-reduced-motion` — no motion should gate content visibility.
