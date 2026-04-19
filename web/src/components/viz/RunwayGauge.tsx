"use client";

import { cn } from "@/lib/utils";

interface RunwayGaugeProps {
  days: number | null;
  avgDailySpend: number;
  max?: number;
  className?: string;
}

/**
 * Fitness-ring style gauge. 12px thick stroke, rounded cap, glow on leading edge.
 */
export function RunwayGauge({ days, avgDailySpend, max = 60, className }: RunwayGaugeProps) {
  const size = 260;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const safe = Math.max(0, Math.min(days ?? 0, max));
  const pct = safe / max;
  const dash = c * pct;

  return (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-container-high)" strokeWidth={stroke} />
        {/* progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#runwayGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
          style={{ filter: "drop-shadow(0 0 12px rgb(var(--color-chart-a-rgb) / 0.45))" }}
        />
        <defs>
          <linearGradient id="runwayGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-a)" />
            <stop offset="100%" stopColor="var(--color-chart-a-soft)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono text-[48px] font-light tracking-tight text-on-surface">
          {days === null || !Number.isFinite(days) ? "—" : days.toFixed(1)}
        </div>
        <div className="-mt-1 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          Days Runway
        </div>
        <div className="mt-2 text-[11px] text-on-surface-variant/80">
          at ₹{avgDailySpend.toFixed(2)}/day
        </div>
      </div>
    </div>
  );
}
