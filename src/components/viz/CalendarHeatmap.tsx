"use client";

import { cn } from "@/lib/utils";

export interface CalendarCell {
  date: string; // ISO yyyy-mm-dd
  value: number;
}

interface Props {
  cells: CalendarCell[];
  unit?: string;
  className?: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * GitHub-style contribution calendar. Columns = ISO weeks, rows = weekdays
 * (Mon top → Sun bottom). Cell color intensity maps to value.
 */
export function CalendarHeatmap({ cells, unit = "kWh", className }: Props) {
  if (!cells.length) {
    return <div className={cn("h-24 rounded-md bg-surface-container-high/40", className)} />;
  }

  const sorted = [...cells].sort((a, b) => a.date.localeCompare(b.date));
  const max = Math.max(...sorted.map((c) => c.value), 0.001);

  // Pack into weekly columns
  const firstDate = new Date(sorted[0].date);
  const firstMon = new Date(firstDate);
  firstMon.setDate(firstMon.getDate() - ((firstMon.getDay() + 6) % 7)); // to Monday

  const cellByDate = new Map(sorted.map((c) => [c.date, c]));
  const lastDate = new Date(sorted[sorted.length - 1].date);
  const weeks: (CalendarCell | null)[][] = [];

  for (let d = new Date(firstMon); d <= lastDate; d.setDate(d.getDate() + 7)) {
    const col: (CalendarCell | null)[] = [];
    for (let w = 0; w < 7; w++) {
      const day = new Date(d);
      day.setDate(d.getDate() + w);
      const iso = day.toISOString().slice(0, 10);
      col.push(cellByDate.get(iso) ?? null);
    }
    weeks.push(col);
  }

  // Month labels above columns (first time a month appears)
  const monthLabels: { idx: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((col, i) => {
    const first = col.find(Boolean);
    if (!first) return;
    const m = new Date(first.date).getMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      monthLabels.push({
        idx: i,
        label: new Date(first.date).toLocaleDateString("en-IN", { month: "short" }),
      });
    }
  });

  return (
    <div className={cn("relative overflow-x-auto", className)}>
      <div className="flex gap-2">
        {/* Weekday labels */}
        <div className="mt-[14px] flex flex-col gap-[3px] pr-1 text-[9px] text-on-surface-variant/70">
          {WEEKDAYS.map((w, i) => (
            <span key={w} className={cn("h-[14px] leading-[14px]", i % 2 === 1 && "invisible")}>
              {w}
            </span>
          ))}
        </div>

        {/* Grid */}
        <div className="relative">
          <div className="mb-1 flex h-3 text-[9px] text-on-surface-variant/70">
            {weeks.map((_, i) => {
              const label = monthLabels.find((m) => m.idx === i);
              return (
                <div key={i} style={{ width: 17 }}>
                  {label?.label}
                </div>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((col, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {col.map((cell, j) => (
                  <CellSquare key={j} cell={cell} max={max} unit={unit} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-2 text-[10px] text-on-surface-variant">
        <span>less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <span
            key={p}
            className="h-[14px] w-[14px] rounded-[2px]"
            style={{ background: intensityToBg(p) }}
          />
        ))}
        <span>more</span>
      </div>
    </div>
  );
}

function CellSquare({
  cell,
  max,
  unit,
}: {
  cell: CalendarCell | null;
  max: number;
  unit: string;
}) {
  const empty = !cell || cell.value === 0;
  const intensity = empty ? 0 : cell!.value / max;
  return (
    <div
      className="group relative h-[14px] w-[14px] rounded-[2px] transition-transform hover:scale-125"
      style={{ background: empty ? "var(--color-surface-container-low)" : intensityToBg(intensity) }}
      title={cell ? `${cell.date}: ${cell.value.toFixed(2)} ${unit}` : ""}
    />
  );
}

/** 0..1 → chart-a intensity. Theme-switchable via --color-chart-a-rgb. */
function intensityToBg(i: number): string {
  if (i <= 0) return "var(--color-surface-container-low)";
  const alpha = (0.15 + i * 0.85).toFixed(3);
  return `rgb(var(--color-chart-a-rgb) / ${alpha})`;
}
