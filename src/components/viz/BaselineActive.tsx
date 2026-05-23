"use client";

import { Donut } from "./Donut";
import { Tooltip } from "@/components/ui/Tooltip";
import { chart } from "@/lib/chartColors";

interface Props {
  /** Daily kWh observations */
  dayValues: number[];
  unit?: string;
}

/**
 * Decomposes average daily consumption into "always-on" baseline (p25 of
 * daily kWh — a proxy for fridge/router/standby load) and active/discretionary
 * use (rest of the average). A killer insight power users love.
 */
export function BaselineActive({ dayValues, unit = "kWh" }: Props) {
  const vals = dayValues.filter((v) => v > 0).sort((a, b) => a - b);
  if (vals.length < 3) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-[11px] text-on-surface-variant">
        Need at least 3 days of data to decompose baseline vs active load.
      </div>
    );
  }
  const p25 = vals[Math.floor(vals.length * 0.25)];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const baseline = p25;
  const active = Math.max(0, avg - baseline);
  const baseShare = (baseline / avg) * 100;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <Donut
        size={180}
        stroke={12}
        segments={[
          { label: "Active",   value: active,   color: chart.a },
          { label: "Baseline", value: baseline, color: chart.aSoft },
        ]}
        centerValue={<>{avg.toFixed(2)}</>}
        centerLabel={`avg ${unit}/day`}
      />
      <div className="grid w-full grid-cols-2 gap-4 text-center">
        <Tooltip content={<>Avg daily kWh used above the always-on floor.<br />Driven by AC, geyser, appliances.</>}>
          <div className="cursor-help rounded-md bg-surface-container p-3">
            <div className="text-[9px] uppercase tracking-[0.2em] text-on-surface-variant">Active load</div>
            <div className="mt-1 font-mono text-[16px] text-on-surface">
              {active.toFixed(2)}
              <span className="ml-1 text-[10px] text-on-surface-variant">{unit}</span>
            </div>
            <div className="mt-0.5 font-mono text-[9px] text-on-surface-variant/70">
              {(100 - baseShare).toFixed(0)}% of daily avg
            </div>
          </div>
        </Tooltip>
        <Tooltip content={<>25th-percentile daily kWh.<br />Proxy for fridge / router / standby — the load that runs even when you&apos;re away.</>}>
          <div className="cursor-help rounded-md bg-surface-container p-3">
            <div className="text-[9px] uppercase tracking-[0.2em] text-on-surface-variant">Baseline (p25)</div>
            <div className="mt-1 font-mono text-[16px] text-primary-fixed-dim">
              {baseline.toFixed(2)}
              <span className="ml-1 text-[10px] text-on-surface-variant">{unit}</span>
            </div>
            <div className="mt-0.5 font-mono text-[9px] text-on-surface-variant/70">
              {baseShare.toFixed(0)}% of daily avg
            </div>
          </div>
        </Tooltip>
      </div>
    </div>
  );
}
