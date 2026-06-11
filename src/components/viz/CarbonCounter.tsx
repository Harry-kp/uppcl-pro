"use client";

import { kwh } from "@/lib/utils";
import { TreePine, Car, Cloud } from "lucide-react";

interface CarbonCounterProps {
  /** kWh consumed in the period being summarised. */
  periodKwh: number;
  /** Grid emission factor (kg CO₂ per kWh). India grid ≈ 0.71. */
  factor?: number;
  periodLabel?: string;
}

/**
 * Animated CO₂ figure plus relatable equivalences. The grid factor is the
 * CEA's all-India average; carbon = kWh × factor (no endpoint — derived).
 */
export function CarbonCounter({ periodKwh, factor = 0.71, periodLabel = "this cycle" }: CarbonCounterProps) {
  const kg = periodKwh * factor;
  // 1 mature tree sequesters ~21 kg CO₂/yr ≈ 1.75 kg/month.
  const trees = kg / 1.75;
  // Petrol car ≈ 0.12 kg CO₂/km.
  const km = kg / 0.12;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <Cloud className="mb-1 h-5 w-5 text-on-surface-variant" strokeWidth={1.5} />
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[44px] font-light leading-none tracking-tight text-on-surface animate-count-up">
            {kwh(kg, 0)}
          </span>
          <span className="font-mono text-[14px] text-on-surface-variant">kg CO₂</span>
        </div>
        <span className="mb-1 text-[11px] text-on-surface-variant/80">{periodLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Equiv icon={<TreePine className="h-3.5 w-3.5" />} value={kwh(trees, 1)} unit="trees / mo to offset" />
        <Equiv icon={<Car className="h-3.5 w-3.5" />} value={kwh(km, 0)} unit="km of petrol driving" />
      </div>
      <div className="text-[10px] text-on-surface-variant/70">
        {kwh(periodKwh, 0)} kWh × {factor} kg/kWh (CEA all-India grid factor)
      </div>
    </div>
  );
}

function Equiv({ icon, value, unit }: { icon: React.ReactNode; value: string; unit: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-surface-container p-3">
      <span className="text-primary-fixed-dim">{icon}</span>
      <div className="min-w-0">
        <div className="font-mono text-[16px] leading-none text-on-surface">{value}</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">{unit}</div>
      </div>
    </div>
  );
}
