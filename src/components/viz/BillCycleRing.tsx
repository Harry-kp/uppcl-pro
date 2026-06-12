"use client";

import { cn, rupees } from "@/lib/utils";

interface BillCycleRingProps {
  /** Projected bill for the current cycle, in rupees (center value). */
  projectedInr: number | null;
  /** Days until the bill due date (negative = overdue). */
  daysToDue: number | null;
  /** Fraction of the billing cycle elapsed, 0–1 (drives the ring fill). */
  cycleProgress: number;
  /** Projected bill vs last month, as a percentage (e.g. +37). Null hides it. */
  vsLastPct?: number | null;
  className?: string;
}

/**
 * Postpaid counterpart to RunwayGauge. Same fitness-ring vocabulary, but the
 * ring tracks billing-cycle progress and the colour reflects due-date urgency.
 */
export function BillCycleRing({ projectedInr, daysToDue, cycleProgress, vsLastPct, className }: BillCycleRingProps) {
  const size = 260;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const pct = Math.max(0, Math.min(cycleProgress, 1));
  const dash = c * pct;

  // Urgency colour: ample time → primary (blue), due soon → secondary (amber), overdue → error (red).
  const overdue = daysToDue !== null && daysToDue < 0;
  const dueSoon = daysToDue !== null && daysToDue >= 0 && daysToDue <= 5;
  const rgb = overdue
    ? "var(--color-error)"
    : dueSoon
    ? "var(--color-chart-b)"
    : "var(--color-chart-a)";
  const glowRgb = overdue
    ? "255 180 171"
    : dueSoon
    ? "var(--color-chart-b-rgb)"
    : "var(--color-chart-a-rgb)";

  const dueLabel =
    daysToDue === null
      ? "no due date"
      : overdue
      ? `overdue by ${Math.abs(daysToDue)} d`
      : daysToDue === 0
      ? "due today"
      : `due in ${daysToDue} d`;

  return (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-container-high)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={rgb}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
          style={{ filter: `drop-shadow(0 0 12px rgb(${glowRgb} / 0.45))` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Projected bill</div>
        <div className="mt-1 flex items-baseline gap-1 font-mono text-on-surface">
          <span className="text-[18px] text-primary-fixed-dim">₹</span>
          <span className="text-[44px] font-light leading-none tracking-tight">
            {projectedInr === null || !Number.isFinite(projectedInr) ? "—" : rupees(projectedInr, { decimals: 0 })}
          </span>
        </div>
        {vsLastPct !== null && vsLastPct !== undefined && Number.isFinite(vsLastPct) && (
          <div className={cn(
            "mt-1.5 font-mono text-[11px]",
            vsLastPct > 5 ? "text-secondary" : vsLastPct < -5 ? "text-primary-fixed-dim" : "text-on-surface-variant"
          )}>
            {vsLastPct > 0 ? "▲" : vsLastPct < 0 ? "▼" : ""} {Math.abs(vsLastPct)}% vs last month
          </div>
        )}
        <div
          className={cn(
            "mt-2 text-[11px] font-medium",
            overdue ? "text-error" : dueSoon ? "text-secondary" : "text-on-surface-variant/80"
          )}
        >
          {dueLabel}
        </div>
      </div>
    </div>
  );
}
