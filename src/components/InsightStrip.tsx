"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

export type InsightTone = "good" | "info" | "warn" | "critical";

export interface Insight {
  id: string;
  tone: InsightTone;
  icon: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  /** External link (opens new tab) or in-app click handler. */
  href?: string;
  onClick?: () => void;
  cta?: string;
}

const TONE: Record<InsightTone, { bar: string; icon: string; tag: string }> = {
  good: { bar: "bg-primary-container", icon: "text-primary-fixed-dim", tag: "text-primary-fixed-dim" },
  info: { bar: "bg-surface-bright", icon: "text-on-surface-variant", tag: "text-on-surface-variant" },
  warn: { bar: "bg-secondary-container", icon: "text-secondary", tag: "text-secondary" },
  critical: { bar: "bg-error/70", icon: "text-error", tag: "text-error" },
};

/**
 * Proactive "what to do" row. The product's signature surface: actions, not
 * charts. Horizontally scrollable on mobile, auto-fit grid on wider screens.
 */
export function InsightStrip({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;

  return (
    <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3 xl:grid-cols-4">
      {insights.map((it) => {
        const tone = TONE[it.tone];
        const interactive = Boolean(it.href || it.onClick);
        const inner = (
          <>
            <div className={cn("h-full w-0.5 shrink-0 self-stretch rounded-full", tone.bar)} />
            <div className="min-w-0 flex-1">
              <div className={cn("flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em]", tone.tag)}>
                <span className={tone.icon}>{it.icon}</span>
                {it.cta && interactive && (
                  <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {it.cta} <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                )}
              </div>
              <div className="mt-1.5 text-[13px] leading-snug text-on-surface">{it.title}</div>
              {it.detail && (
                <div className="mt-1 text-[11px] leading-snug text-on-surface-variant">{it.detail}</div>
              )}
            </div>
          </>
        );

        const base =
          "group flex min-w-[260px] shrink-0 snap-start items-start gap-3 rounded-xl bg-surface-container-low p-4 text-left sm:min-w-0";

        if (it.href) {
          return (
            <a key={it.id} href={it.href} target="_blank" rel="noreferrer" className={cn(base, "transition-colors hover:bg-surface-container")}>
              {inner}
            </a>
          );
        }
        if (it.onClick) {
          return (
            <button key={it.id} onClick={it.onClick} className={cn(base, "transition-colors hover:bg-surface-container")}>
              {inner}
            </button>
          );
        }
        return (
          <div key={it.id} className={base}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
