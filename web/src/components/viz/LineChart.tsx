"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface LineSeries {
  label: string;
  color: string;
  points: { x: number; y: number; label?: string }[];
  glow?: boolean;
  dashed?: boolean;
}

interface Props {
  series: LineSeries[];
  height?: number;
  yMin?: number;
  yMax?: number;
  format?: (y: number) => string;
  xFormat?: (x: number) => string;
  showGrid?: boolean;
  className?: string;
}

/**
 * Multi-series SVG line chart with crosshair + hover-to-inspect.
 * No external chart lib — just d3-style math inlined so it's tiny.
 */
export function LineChart({ series, height = 200, yMin, yMax, format, xFormat, showGrid = true, className }: Props) {
  const [hover, setHover] = useState<{ x: number; idx: number } | null>(null);
  const allPoints = series.flatMap((s) => s.points);
  if (!allPoints.length) {
    return <div className="flex h-[200px] items-center justify-center text-[11px] text-on-surface-variant">no data</div>;
  }
  const minX = Math.min(...allPoints.map((p) => p.x));
  const maxX = Math.max(...allPoints.map((p) => p.x));
  const allY = allPoints.map((p) => p.y);
  const lo = yMin ?? Math.min(...allY);
  const hi = yMax ?? Math.max(...allY);
  const pad = 22;
  const w = 800;
  const h = height;

  const xScale = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (w - 2 * pad);
  const yScale = (y: number) => h - pad - ((y - lo) / (hi - lo || 1)) * (h - 2 * pad);

  const fmt = format ?? ((y: number) => y.toFixed(2));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    // Find nearest x across the union of all points
    let best = { dist: Infinity, x: 0, idx: 0 };
    allPoints.forEach((p, i) => {
      const d = Math.abs(xScale(p.x) - px);
      if (d < best.dist) best = { dist: d, x: xScale(p.x), idx: i };
    });
    setHover({ x: best.x, idx: best.idx });
  };

  const hoverPoint = hover ? allPoints[hover.idx] : null;

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid rows */}
        {showGrid && [0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = h - pad - t * (h - 2 * pad);
          return (
            <g key={i}>
              <line x1={pad} x2={w - pad} y1={y} y2={y} stroke="var(--color-chart-grid)" strokeDasharray="2 4" />
              <text x={pad - 6} y={y + 3} textAnchor="end" fontSize={9} fill="var(--color-chart-muted)" fontFamily="monospace">
                {fmt(lo + t * (hi - lo))}
              </text>
            </g>
          );
        })}

        {series.map((s, si) => {
          const d = s.points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x).toFixed(1)} ${yScale(p.y).toFixed(1)}`)
            .join(" ");
          return (
            <g key={si}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? "4 3" : undefined}
                style={s.glow ? { filter: `drop-shadow(0 0 6px rgb(var(--color-chart-a-rgb) / 0.5))` } : undefined}
              />
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  cx={xScale(p.x)}
                  cy={yScale(p.y)}
                  r={2.5}
                  fill={s.color}
                  opacity={0.6}
                />
              ))}
            </g>
          );
        })}

        {/* Crosshair */}
        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={pad} y2={h - pad} stroke="var(--color-chart-a)" strokeWidth={0.75} strokeDasharray="2 2" />
            <circle cx={hover.x} cy={yScale(hoverPoint!.y)} r={4} fill="var(--color-chart-a-soft)" stroke="var(--color-void)" strokeWidth={1} />
          </g>
        )}
      </svg>

      {hover && hoverPoint && (
        <div
          className="pointer-events-none absolute rounded-md bg-surface-container-highest px-2.5 py-1.5 text-[11px] shadow-ambient"
          style={{ left: `calc(${(hover.x / w) * 100}% + 8px)`, top: 4 }}
        >
          {hoverPoint.label && (
            <div className="font-mono text-[10px] text-on-surface-variant">{hoverPoint.label}</div>
          )}
          <div className="font-mono text-on-surface">
            {xFormat ? xFormat(hoverPoint.x) : hoverPoint.x} → {fmt(hoverPoint.y)}
          </div>
        </div>
      )}
    </div>
  );
}
