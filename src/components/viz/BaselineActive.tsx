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
  const alwaysOn = p25;
  const active = Math.max(0, avg - alwaysOn);
  const baseShare = (alwaysOn / avg) * 100;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <Donut
        size={172}
        stroke={12}
        segments={[
          { label: "Active",    value: active,    color: chart.a },
          { label: "Always-on", value: alwaysOn,  color: chart.aSoft },
        ]}
        centerValue={<>{avg.toFixed(1)}</>}
        centerLabel={`avg ${unit}/day`}
      />
      <div className="grid w-full grid-cols-2 gap-3 text-center">
        <Tooltip content={<>The roughly-constant load that runs 24×7 — fridge, router, set-top box, standby. You pay for it even when nobody&apos;s home. (Estimated as your lowest-quarter daily use.)</>}>
          <div className="cursor-help rounded-lg bg-surface-container p-3">
            <div className="text-[9px] uppercase tracking-[0.2em] text-on-surface-variant">Always-on</div>
            <div className="mt-1 font-mono text-[16px] text-primary-fixed-dim">
              {alwaysOn.toFixed(1)}<span className="ml-1 text-[10px] text-on-surface-variant">{unit}/day</span>
            </div>
            <div className="mt-0.5 text-[9px] text-on-surface-variant/70">≈ {Math.round(alwaysOn * 30)} {unit}/mo · runs 24×7</div>
          </div>
        </Tooltip>
        <Tooltip content={<>What you actively switch on above the always-on floor — AC, geyser, lights, appliances. This is the part you can cut to lower the bill.</>}>
          <div className="cursor-help rounded-lg bg-surface-container p-3">
            <div className="text-[9px] uppercase tracking-[0.2em] text-on-surface-variant">Active use</div>
            <div className="mt-1 font-mono text-[16px] text-on-surface">
              {active.toFixed(1)}<span className="ml-1 text-[10px] text-on-surface-variant">{unit}/day</span>
            </div>
            <div className="mt-0.5 text-[9px] text-on-surface-variant/70">{(100 - baseShare).toFixed(0)}% of your usage</div>
          </div>
        </Tooltip>
      </div>
    </div>
  );
}
