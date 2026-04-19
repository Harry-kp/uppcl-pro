"use client";

import { cn } from "@/lib/utils";

interface DonutProps {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  stroke?: number;
  centerLabel?: React.ReactNode;
  centerValue?: React.ReactNode;
  className?: string;
}

/** MD3-style donut with rounded caps, glow on the leading edge. */
export function Donut({ segments, size = 220, stroke = 14, centerLabel, centerValue, className }: DonutProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let cursor = 0;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-container-low)" strokeWidth={stroke} />
        {segments.map((seg, i) => {
          const frac = seg.value / total;
          const dash = c * frac;
          const dashArr = `${dash} ${c - dash}`;
          const offset = -c * cursor;
          cursor += frac;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={dashArr}
              strokeDashoffset={offset}
              className="transition-[stroke-dasharray] duration-700"
              style={i === 0 ? { filter: `drop-shadow(0 0 8px rgb(var(--color-chart-a-rgb) / 0.4))` } : undefined}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {centerValue && (
          <div className="font-mono text-[28px] font-light leading-none tracking-tight text-on-surface">
            {centerValue}
          </div>
        )}
        {centerLabel && (
          <div className="mt-1 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            {centerLabel}
          </div>
        )}
      </div>
    </div>
  );
}
