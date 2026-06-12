"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type GaugeAccent = "good" | "warn" | "critical" | "default";

interface RadialGaugeProps {
  /** Current value mapped onto 0…max. */
  value: number;
  max: number;
  accent?: GaugeAccent;
  centerValue: ReactNode;
  centerLabel?: string;
  sub?: ReactNode;
  size?: number;
  className?: string;
}

const STROKE: Record<GaugeAccent, { color: string; glow: string }> = {
  good: { color: "var(--color-chart-a)", glow: "var(--color-chart-a-rgb)" },
  warn: { color: "var(--color-chart-b)", glow: "var(--color-chart-b-rgb)" },
  critical: { color: "var(--color-error)", glow: "255 180 171" },
  default: { color: "var(--color-chart-a-soft)", glow: "var(--color-chart-a-rgb)" },
};

/**
 * Generic fitness-ring gauge (shares RunwayGauge's vocabulary). Used for power
 * factor (0–1) and peak-demand-vs-sanctioned (0–100%). Colour reflects health.
 */
export function RadialGauge({
  value, max, accent = "default", centerValue, centerLabel, sub, size = 200, className,
}: RadialGaugeProps) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(value / max, 1)) : 0;
  const dash = c * pct;
  const { color, glow } = STROKE[accent];

  return (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-container-high)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
          style={{ filter: `drop-shadow(0 0 12px rgb(${glow} / 0.45))` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <div className="font-mono text-[36px] font-light leading-none tracking-tight text-on-surface animate-count-up">
          {centerValue}
        </div>
        {centerLabel && (
          <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">{centerLabel}</div>
        )}
        {sub && <div className="mt-2 text-[11px] text-on-surface-variant/80">{sub}</div>}
      </div>
    </div>
  );
}
