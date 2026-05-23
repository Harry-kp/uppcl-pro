"use client";

import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";

interface SparklineProps {
  values: number[];
  labels?: string[];
  highlight?: number;
  className?: string;
  barGap?: number;
  height?: number;
  format?: (v: number) => string;
  unit?: string;
}

export function Sparkline({
  values,
  labels,
  highlight,
  className,
  barGap = 3,
  height = 80,
  format = (v) => v.toFixed(2),
  unit = "kWh",
}: SparklineProps) {
  if (!values.length) return <div className={cn("h-20", className)} />;
  const max = Math.max(...values, 0.001);
  const hi = highlight ?? values.indexOf(max);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  return (
    <div className={cn("flex items-end", className)} style={{ height, gap: barGap }}>
      {values.map((v, i) => {
        const pct = Math.max(4, (v / max) * 100);
        const amber = i === hi;
        const delta = v - mean;
        const deltaPct = mean > 0 ? (delta / mean) * 100 : 0;
        return (
          <Tooltip
            key={i}
            asChild
            content={
              <div>
                {labels?.[i] && <div className="font-mono text-[10px] text-on-surface-variant">{labels[i]}</div>}
                <div className="font-mono text-on-surface">
                  {format(v)} {unit}
                </div>
                <div className="text-[10px] text-on-surface-variant">
                  {delta >= 0 ? "+" : ""}
                  {deltaPct.toFixed(0)}% vs window avg
                </div>
              </div>
            }
          >
            <div
              className={cn(
                "flex-1 cursor-default rounded-t-[2px] transition-colors hover:brightness-110",
                amber ? "bg-secondary" : "bg-surface-container-high"
              )}
              style={{ height: `${pct}%`, minWidth: 4 }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}
