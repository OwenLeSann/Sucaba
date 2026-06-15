<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->
---
name: Expense Intelligence
description: AI-powered expense intelligence for SMB finance teams
---

# Design System: Expense Intelligence

## 1. Overview

**Creative North Star: "The Candid Ledger"**

A finance tool that behaves like a brilliant, approachable colleague rather than a compliance system. Every surface answers a question before it's asked: which violations need attention, where is budget going, what does the agent recommend? Information is dense but never crowded; the hierarchy does the work so the finance manager doesn't need to hunt for meaning.

The visual foundation is pure white with a rose-mauve brand accent that appears sparingly — on primary actions, the active navigation state, and the AI conversation interface — and a teal secondary that carries data visualization and status signals. The background never tints toward warmth. Warmth lives in the brand pair, not the surface.

Motion is choreographed, not decorative. The dashboard loads with a sequenced reveal: navigation first, then summary metrics, then the data panels, then the AI pane. Violation lists stagger on entry; charts draw in when they come into view. A finance manager in flow should feel the interface is alive and responsive, not that they're watching a presentation. All motion respects `prefers-reduced-motion` — every choreographed sequence degrades to a crossfade or instant state.

**Key Characteristics:**
- Pure white surface; warmth lives in the brand pair, never the background
- Rose-mauve primary and teal secondary — used only where they convey meaning
- One humanist sans family throughout; mono punctuates financial data
- Choreographed motion with purpose: stagger, reveal, draw-in — no decoration
- Data density as a virtue: every screen earns its information load

## 2. Colors: The Candid Palette

Restrained strategy: a rose-mauve primary on a pure white surface, with teal as the secondary for data and status. Neither color decorates; both convey meaning.

### Primary
- **Rose-Mauve** (`oklch(~0.520 0.155 330)`, finalize at implementation): Primary CTAs, active navigation states, the AI chat interface header, and keyboard focus rings. Never used for passive backgrounds or decoration. White text on all filled primary surfaces.

### Secondary
- **Data Teal** (`oklch(~0.680 0.130 195)`, finalize at implementation): Chart fills, status success indicators, and hyperlinks in prose. Distinct from the primary in both hue (195° vs 330°) and lightness; the two never compete on the same surface.

### Neutral
- **Ink** (`oklch(~0.125 0.012 330)`, finalize at implementation): All body text, headings, data labels, and icon fills. Near-black with the faintest brand hue.
- **Muted** (`oklch(~0.470 0.010 330)`, finalize at implementation): Secondary text, timestamps, metadata, placeholder text. Must clear ≥4.5:1 contrast against white.
- **Surface** (`oklch(~0.975 0.006 330)`, finalize at implementation): Panel backgrounds, sidebar fills, card surfaces — barely distinguishable from white, with a ghost of the brand hue for tonal separation.
- **White** (`oklch(1.000 0.000 0)`): The body background. Pure. No tint.

### Semantic (to define during implementation)
- **Error**: a red-spectrum color clearly distinct from the rose-mauve primary (e.g. `oklch(~0.50 0.20 25)`)
- **Warning**: amber (`oklch(~0.72 0.16 60)`)
- **Success**: teal family, consistent with the secondary
- **Disabled**: ink at 30% opacity on white

**The Restraint Rule.** The rose-mauve primary appears on ≤10% of any screen. At most one action per screen section carries a filled primary state. Its rarity is the point.

**The Warm-Surface Ban.** The body background is always pure `oklch(1.000 0.000 0)`. Never cream, sand, bone, linen, or paper. Those tones signal the generic AI aesthetic this system explicitly rejects. All warmth in this interface comes from the primary and secondary colors, not the surface.

## 3. Typography

**Body Font:** Plus Jakarta Sans (fallback: `system-ui, -apple-system, sans-serif`)
**Mono Stack:** JetBrains Mono (fallback: `ui-monospace, 'Cascadia Code', monospace`)

**Character:** A single warm humanist sans that carries headings, navigation, labels, and body copy without strain. JetBrains Mono punctuates where machine-precision matters — transaction amounts, violation IDs, dates in data tables — creating a secondary rhythm that signals "data" versus "prose." No display/body pairing, no serif experiments in UI controls.

### Hierarchy
- **Headline** (600, 1.5rem / 24px, line-height 1.3): Page titles, panel headings. `text-wrap: balance`.
- **Title** (600, 1.125rem / 18px, line-height 1.4): Section headings, card titles, modal headers.
- **Body** (400, 0.9375rem / 15px, line-height 1.6): Prose, agent response text, violation detail. Max 70ch line length.
- **Label** (500, 0.8125rem / 13px, line-height 1.4): Form labels, table column headers, navigation items, status chip text.
- **Data** (JetBrains Mono, 400, 0.875rem / 14px, line-height 1.5): Currency amounts, transaction IDs, timestamps in tabular context. Tabular nums (`font-variant-numeric: tabular-nums`).
- **Micro** (400, 0.75rem / 12px, line-height 1.4): Footnotes, helper text, badge labels.

**The Mono-Data Rule.** Currency amounts (CAD values, budget figures), transaction IDs, and date-time strings in data tables always render in the mono stack. Running prose — agent summaries, violation explanations, approval reasoning — renders in the sans. Never swap them.

**The No-Display Rule.** No serif or decorative font in any UI control: buttons, labels, nav items, table headers, chips, modals. Plus Jakarta Sans at appropriate weight does the job.

## 4. Elevation

Mostly flat. Depth is expressed through surface differentiation — white body vs. the faint surface panels — not shadow stacks. One ambient shadow (`0 1px 4px oklch(0.125 0.012 330 / 0.08), 0 4px 16px oklch(0.125 0.012 330 / 0.05)`, finalize at implementation) is reserved for elements that genuinely float: dropdowns, tooltips, the AI chat panel when overlaid on smaller viewports.

No stacked shadow systems. If an element needs two shadows to feel elevated, the layout is wrong.

**The Flat-By-Default Rule.** All surfaces are flat at rest. Elevation — via the lone ambient shadow — appears only on elements that truly float above the document: dropdowns, modals, the AI overlay pane. Cards and panels use background-color differentiation (`--color-surface` vs `--color-white`), never shadows.

## 5. Components

*SEED — document once the React + Vite build begins. Core components to specify on first scan:*
- **Primary Button** (rose-mauve fill, white text, 6px radius)
- **Ghost Button** (ink border, transparent fill, ink text)
- **Data Table** (zebra-striped via surface color, mono amounts, sticky header)
- **Violation Badge** (severity 1–5 mapped to semantic colors, compact pill)
- **Status Chip** (open / resolved / dismissed — teal, muted, and ink respectively)
- **Chat Input** (full-width, rose-mauve focus ring, send action as primary button)
- **Skeleton Loader** (surface-color shimmer, never a centered spinner in content)
- **Approval Decision Card** (employee context at a glance, recommend/approve/deny actions)
- **Inline Chart** (bar / line / pie rendered in the chat panel alongside agent text)

## 6. Do's and Don'ts

### Do:
- **Do** use Plus Jakarta Sans for all UI text and JetBrains Mono for financial amounts, IDs, and dates in data contexts.
- **Do** keep the body background pure `oklch(1.000 0.000 0)` — no tint, no warmth.
- **Do** reserve the rose-mauve primary for ≤10% of any screen: one primary CTA, the active nav state, the AI header. Not for passive backgrounds.
- **Do** use teal for chart fills, success states, and hyperlinks in prose — not for primary interactive controls.
- **Do** choreograph motion with semantic purpose: dashboard reveal on load, list staggering for violations, chart draw-ins on view entry. Every animation encodes meaning.
- **Do** degrade all choreography to instant state or crossfade under `prefers-reduced-motion`.
- **Do** use `font-variant-numeric: tabular-nums` on all monetary and numeric data so columns align.
- **Do** target WCAG AA minimum: ≥4.5:1 for body and label text, ≥3:1 for large bold text. Muted text must also clear 4.5:1.
- **Do** use skeleton loaders (surface-shimmer) for async data, not spinners centered in content.

### Don't:
- **Don't** use a warm, cream, sand, beige, or paper-tinted background. This is the saturated AI aesthetic this system explicitly rejects.
- **Don't** use the generic SaaS purple/cream gradient language — no gradient fills, no warm neutrals, no `background-clip: text` gradients.
- **Don't** make the interface feel like Excel or a legacy enterprise tool: no flat grey surfaces devoid of hierarchy, no table-only layouts without navigation or context.
- **Don't** reach for a dark mode with neon or terminal aesthetics — this is a tool for finance managers, not developers.
- **Don't** add decorative animations: counting-up metric numbers, chart entrance explosions, hover sparkles, staggered section entrances on every page load. Choreography is reserved for content that earns it.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored stripe on violation items, cards, or callouts. Use full borders, background tints, or status chips instead.
- **Don't** use serif or display fonts in any UI control: buttons, navigation, table headers, form labels, status chips.
- **Don't** fill more than one button per screen section with the rose-mauve primary. If everything is primary, nothing is.
- **Don't** reach for a modal as the first solution for resolve/dismiss/approve flows. Inline actions and slide-over panels are preferred; modals are a last resort.
