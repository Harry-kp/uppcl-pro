"use client";

import { cn } from "@/lib/utils";

export interface Slab {
  /** Upper bound of this slab in units (kWh). Use Infinity for the top slab. */
  upTo: number;
  rate: number;
  label: string;
}

/** UP domestic LMV-1 telescopic slabs (indicative — the authoritative ₹/kWh
 *  shown elsewhere is derived from the user's own bills). */
export const UP_DOMESTIC_SLABS: Slab[] = [
  { upTo: 150, rate: 5.5, label: "0–150" },
  { upTo: 300, rate: 6.0, label: "151–300" },
  { upTo: 500, rate: 6.5, label: "301–500" },
  { upTo: Infinity, rate: 7.0, label: "500+" },
];

interface SlabBarProps {
  /** Units consumed in the billing month. */
  units: number;
  slabs?: Slab[];
  className?: string;
}

/**
 * Horizontal tariff-slab ladder with a marker at the user's current monthly
 * units and a "distance to next slab" read-out.
 */
export function SlabBar({ units, slabs = UP_DOMESTIC_SLABS, className }: SlabBarProps) {
  // Render up to a sensible ceiling (top finite bound + headroom, or current usage).
  const finiteTop = slabs.filter((s) => Number.isFinite(s.upTo)).at(-1)?.upTo ?? 500;
  const ceiling = Math.max(finiteTop * 1.1, units * 1.1, 100);

  const bounds = slabs.map((s) => (Number.isFinite(s.upTo) ? s.upTo : ceiling));
  const segments = slabs.map((s, i) => ({
    from: i === 0 ? 0 : bounds[i - 1],
    to: bounds[i],
    rate: s.rate,
    label: s.label,
  }));

  const currentIdx = segments.findIndex((s) => units < s.to);
  const current = segments[currentIdx === -1 ? segments.length - 1 : currentIdx];
  const nextEdge = current && Number.isFinite(current.to) && currentIdx !== segments.length - 1 ? current.to : null;
  const toNext = nextEdge !== null ? Math.max(0, Math.round(nextEdge - units)) : null;
  const markerPct = Math.max(0, Math.min(units / ceiling, 1)) * 100;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative">
        <div className="flex h-8 overflow-hidden rounded-md">
          {segments.map((s, i) => {
            const w = ((s.to - s.from) / ceiling) * 100;
            const isCurrent = s === current;
            return (
              <div
                key={i}
                style={{ width: `${w}%` }}
                className={cn(
                  "flex items-center justify-center text-[9px] font-medium transition-colors",
                  isCurrent ? "bg-primary-container text-on-primary-fixed" : i % 2 === 0 ? "bg-surface-container-high text-on-surface-variant" : "bg-surface-container text-on-surface-variant"
                )}
                title={`${s.label} units · ₹${s.rate}/kWh`}
              >
                ₹{s.rate}
              </div>
            );
          })}
        </div>
        {/* current-usage marker */}
        <div
          className="absolute -top-1 bottom-[-4px] w-0.5 bg-on-surface"
          style={{ left: `calc(${markerPct}% - 1px)` }}
        >
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] text-on-surface">
            {Math.round(units)}u
          </div>
        </div>
      </div>
      <div className="text-[11px] text-on-surface-variant">
        {toNext !== null ? (
          <>You&apos;re in the <span className="text-on-surface">{current.label}</span> slab —{" "}
            <span className="font-mono text-secondary">{toNext} units</span> until the next rate tier.</>
        ) : (
          <>You&apos;re in the top <span className="text-on-surface">{current?.label}</span> slab.</>
        )}
      </div>
    </div>
  );
}
