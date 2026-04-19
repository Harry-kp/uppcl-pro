"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { rupees } from "@/lib/utils";

export interface StackSegment {
  label: string;
  value: number;
  color: string;
  /** Negative values get a dashed overlay (e.g. rebate, subsidy). */
  sign?: "pos" | "neg";
}

/** Horizontal stacked-bar with inline legend. Hovering a segment shows exact ₹. */
export function StackedBar({
  segments,
  total,
  height = 28,
}: {
  segments: StackSegment[];
  total: number;
  height?: number;
}) {
  const absTotal = Math.max(
    1,
    segments.reduce((a, s) => a + Math.abs(s.value), 0)
  );
  return (
    <div>
      <div
        className="relative flex w-full overflow-hidden rounded-md bg-surface-container"
        style={{ height }}
      >
        {segments.map((s, i) => {
          const pct = (Math.abs(s.value) / absTotal) * 100;
          if (pct < 0.5) return null;
          return (
            <Tooltip
              key={`${s.label}-${i}`}
              asChild
              content={
                <div>
                  <div className="font-mono text-on-surface">{s.label}</div>
                  <div className="mt-0.5 text-on-surface-variant">
                    ₹{rupees(s.value)} ({pct.toFixed(1)}%)
                  </div>
                </div>
              }
            >
              <div
                className="h-full cursor-default transition-[filter] hover:brightness-125"
                style={{
                  width: `${pct}%`,
                  background: s.color,
                  backgroundImage:
                    s.sign === "neg"
                      ? "repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0 4px, transparent 4px 8px)"
                      : undefined,
                }}
              />
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px] text-on-surface-variant">
        {segments.map((s, i) => (
          <span key={`${s.label}-${i}`} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
            <span className="font-mono text-on-surface">₹{rupees(s.value)}</span>
          </span>
        ))}
        <span className="ml-auto font-mono text-[11px] text-on-surface">
          total ₹{rupees(total)}
        </span>
      </div>
    </div>
  );
}
