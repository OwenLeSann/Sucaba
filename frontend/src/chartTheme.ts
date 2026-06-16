// SVG fill/stroke attributes cannot reference CSS custom properties — literal strings required.
// These values mirror the corresponding design tokens in tokens.css.
export const CHART_COLORS = [
  'oklch(0.620 0.130 195)',  // teal   — var(--color-accent)
  'oklch(0.480 0.155 330)',  // mauve  — var(--color-primary)
  'oklch(0.650 0.160  60)',  // amber  — var(--color-warning)
  'oklch(0.540 0.130 270)',  // purple
  'oklch(0.570 0.130 145)',  // green  — var(--color-success)
] as const

export const CHART_ACCENT = CHART_COLORS[0]
