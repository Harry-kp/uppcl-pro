"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";

export type EventKind = "bill" | "invoice" | "payment" | "alert";

export interface TimelineEvent {
  id: string;
  date: string;
  kind: EventKind;
  title: string;
  amount?: number;
  subtitle?: string;
  raw?: Record<string, unknown>;
}

const KIND_STYLES: Record<EventKind, { cls: string; shape: "dot" | "square" | "diamond" | "triangle" }> = {
  bill:     { cls: "text-primary-fixed-dim", shape: "dot" },
  invoice:  { cls: "text-on-surface-variant", shape: "square" },
  payment:  { cls: "text-secondary", shape: "diamond" },
  alert:    { cls: "text-error", shape: "triangle" },
};

interface Props {
  events: TimelineEvent[];
  onSelect?: (e: TimelineEvent) => void;
  className?: string;
}

export function EventTimeline({ events, onSelect, className }: Props) {
  const [filter, setFilter] = useState<Set<EventKind>>(new Set(["bill", "invoice", "payment", "alert"]));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!events.length) {
    return <div className="text-[11px] text-on-surface-variant">no events</div>;
  }

  const shown = events.filter((e) => filter.has(e.kind)).sort((a, b) => a.date.localeCompare(b.date));
  const tMin = new Date(shown[0]?.date ?? events[0].date).getTime();
  const tMax = new Date(shown[shown.length - 1]?.date ?? events[events.length - 1].date).getTime();
  const span = Math.max(1, tMax - tMin);

  const toggle = (k: EventKind) => {
    const next = new Set(filter);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    if (next.size === 0) return;
    setFilter(next);
  };

  const ticks = 6;
  const tickPositions = Array.from({ length: ticks }, (_, i) => tMin + (span * i) / (ticks - 1));

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
        {(["bill", "invoice", "payment", "alert"] as EventKind[]).map((k) => {
          const active = filter.has(k);
          const { cls } = KIND_STYLES[k];
          return (
            <button
              key={k}
              onClick={() => toggle(k)}
              className={cn(
                "rounded-full px-3 py-1 transition-colors",
                active ? "bg-surface-container-high text-on-surface" : "bg-surface-container text-on-surface-variant/60"
              )}
            >
              <span className={cn("mr-1.5 inline-block", cls)}>
                <Marker kind={k} />
              </span>
              {k}s
              <span className="ml-1.5 font-mono text-on-surface-variant/70">
                {events.filter((e) => e.kind === k).length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative h-[100px] rounded-lg bg-surface-container">
        {tickPositions.map((t, i) => {
          const pct = ((t - tMin) / span) * 100;
          return (
            <div key={i} className="absolute inset-y-2" style={{ left: `${pct}%` }}>
              <div className="h-full w-px bg-white/5" />
              <div className="absolute -bottom-1 left-0 -translate-x-1/2 font-mono text-[9px] text-on-surface-variant/70">
                {new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </div>
            </div>
          );
        })}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/5" />

        {shown.map((e) => {
          const t = new Date(e.date).getTime();
          const pct = ((t - tMin) / span) * 100;
          const selected = e.id === selectedId;
          const vOffset = { bill: "50%", invoice: "30%", payment: "70%", alert: "15%" }[e.kind];
          return (
            <Tooltip
              key={e.id}
              asChild
              content={
                <div>
                  <div className="font-mono text-on-surface">{e.title}</div>
                  <div className="mt-0.5 text-on-surface-variant">
                    {new Date(e.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                  {e.subtitle && <div className="text-on-surface-variant">{e.subtitle}</div>}
                </div>
              }
            >
              <button
                onClick={() => { setSelectedId(e.id); onSelect?.(e); }}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-150",
                  KIND_STYLES[e.kind].cls,
                  selected && "scale-150"
                )}
                style={{ left: `${pct}%`, top: vOffset }}
                aria-label={e.title}
              >
                <Marker kind={e.kind} />
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-1.5 text-[10px] text-on-surface-variant">
        <span>Tip:</span> <span>click a pin to drill-in</span>
      </div>
    </div>
  );
}

function Marker({ kind }: { kind: EventKind }) {
  const shape = KIND_STYLES[kind].shape;
  if (shape === "dot") return <span className="inline-block h-2.5 w-2.5 rounded-full bg-current" />;
  if (shape === "square") return <span className="inline-block h-2.5 w-2.5 bg-current" />;
  if (shape === "diamond") return <span className="inline-block h-2.5 w-2.5 rotate-45 bg-current" />;
  return (
    <svg viewBox="0 0 10 10" className="inline-block h-2.5 w-2.5">
      <polygon points="5,0 10,10 0,10" fill="currentColor" />
    </svg>
  );
}
