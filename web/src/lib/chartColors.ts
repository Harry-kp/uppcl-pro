/**
 * Chart colour tokens. These resolve to CSS variables so they auto-switch
 * between dark and light themes. Use anywhere an SVG attribute / style prop
 * needs a concrete colour string.
 */
export const chart = {
  a:      "var(--color-chart-a)",       // primary — lines, bars, bright heatmap cells
  aSoft:  "var(--color-chart-a-soft)",  // secondary line, donut accent
  b:      "var(--color-chart-b)",       // attention / peak highlight
  bSoft:  "var(--color-chart-b-soft)",  // accent deep
  muted:  "var(--color-chart-muted)",   // reference lines, axis labels
  grid:   "var(--color-chart-grid)",    // grid rules
  /** rgba-modulated: `rgb(${chart.aRgb} / 0.35)` */
  aRgb:   "var(--color-chart-a-rgb)",
  bRgb:   "var(--color-chart-b-rgb)",
} as const;

/** Shorthand for inline filter drop-shadow glows that theme-switch. */
export const glow = (color: keyof typeof chart = "a", alpha = 0.45) =>
  `drop-shadow(0 0 6px rgb(var(--color-chart-${color}-rgb) / ${alpha}))`;
