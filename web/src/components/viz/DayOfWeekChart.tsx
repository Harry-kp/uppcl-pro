"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { mean } from "@/lib/stats";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Averages day-level kWh into Mon-Sun buckets so you can see "weekend vs weekday"
 * patterns even without hour-of-day data.
 */
export function DayOfWeekChart({
  dayValues,
  unit = "kWh",
  height = 180,
}: {
  dayValues: { date: string; value: number }[];
  unit?: string;
  height?: number;
}) {
  const buckets: number[][] = [[], [], [], [], [], [], []];
  for (const d of dayValues) {
    const js = new Date(d.date).getDay(); // Sun=0..Sat=6
    const idx = (js + 6) % 7;             // Mon=0..Sun=6
    buckets[idx].push(d.value);
  }
  const avgs = buckets.map((b) => (b.length ? mean(b) : 0));
  const counts = buckets.map((b) => b.length);
  const gAvg = mean(avgs.filter((v) => v > 0));
  const max = Math.max(...avgs, 0.001);
  const peakIdx = avgs.indexOf(Math.max(...avgs));

  if (!dayValues.length || max === 0) {
    return (
      <div className="flex items-center justify-center text-[11px] text-on-surface-variant" style={{ height }}>
        need at least a few days of bills
      </div>
    );
  }

  return (
    <div className="flex gap-3" style={{ height }}>
      {DAYS.map((d, i) => {
        const v = avgs[i];
        const pct = v > 0 ? Math.max(4, (v / max) * 100) : 0;
        const delta = gAvg > 0 ? ((v - gAvg) / gAvg) * 100 : 0;
        const isWeekend = i >= 5;
        const peak = i === peakIdx;
        return (
          <Tooltip
            asChild
            key={d}
            content={
              <div>
                <div className="font-mono text-on-surface">
                  {d} avg · {v.toFixed(2)} {unit}
                </div>
                <div className="text-on-surface-variant">
                  based on {counts[i]} day{counts[i] === 1 ? "" : "s"} of data
                </div>
                <div className="text-on-surface-variant">
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(0)}% vs weekday average
                </div>
              </div>
            }
          >
            <div className="group flex h-full flex-1 cursor-default flex-col">
              {/* bar column — grows to fill remaining space */}
              <div className="flex flex-1 flex-col justify-end">
                <div
                  className={
                    "w-full rounded-t-[3px] transition-[height,filter] duration-500 group-hover:brightness-125 " +
                    (peak
                      ? "bg-secondary"
                      : isWeekend
                      ? "bg-primary-container"
                      : "bg-primary-fixed-dim")
                  }
                  style={{ height: `${pct}%` }}
                />
              </div>
              {/* labels under the bar */}
              <div className={"mt-2 text-center font-mono text-[10px] " + (peak ? "text-secondary" : "text-on-surface-variant")}>
                {d}
              </div>
              <div className="text-center font-mono text-[9px] text-on-surface-variant/70">
                {v > 0 ? v.toFixed(1) : "—"}
              </div>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}
