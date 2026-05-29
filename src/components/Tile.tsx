"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";

interface TileProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tag?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: "default" | "good" | "warn" | "muted";
  /** If provided, the tile becomes a Link that navigates on click. */
  href?: string;
  /** If provided, the tile shows a ⌕ icon and calls this on click. */
  onInspect?: () => void;
  /** Rendered in a tooltip when hovering the value — usually the formula used. */
  formula?: React.ReactNode;
  className?: string;
  loading?: boolean;
}

/**
 * Power-user tile:
 * - Hover elevates surface
 * - Click-through via `href` or `onInspect`
 * - Formula tooltip on the number (hover the number to see how it was computed)
 * - Loading state skeleton
 */
export const Tile = forwardRef<HTMLElement, TileProps>(function Tile(
  { label, value, hint, tag, icon, className, accent = "default", href, onInspect, formula, loading },
  _ref
) {
  const content = (
    <article
      className={cn(
        "group relative flex h-full flex-col justify-between rounded-lg bg-surface-container-high p-4 transition-all",
        "hover:bg-surface-bright hover:shadow-ambient",
        (href || onInspect) && "cursor-pointer",
        className
      )}
    >
      {/* header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-on-surface-variant sm:text-[10px]">
          {icon}
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {tag && (
            <span className="rounded-sm bg-surface-container px-2 py-0.5 font-mono text-[11px] text-on-surface-variant sm:text-[10px]">
              {tag}
            </span>
          )}
          {(href || onInspect) && (
            <ArrowUpRight className="h-3 w-3 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
      </div>

      {/* value */}
      <div className="mt-6">
        {loading ? (
          <div className="h-[28px] w-1/2 animate-pulse rounded bg-surface-container" />
        ) : formula ? (
          <Tooltip content={formula} side="top">
            <span
              className={cn(
                "inline-block font-mono text-[24px] font-light leading-none tracking-tight animate-count-up sm:text-[28px]",
                accent === "good" && "text-primary-fixed-dim",
                accent === "warn" && "text-secondary",
                accent === "muted" && "text-on-surface-variant",
                accent === "default" && "text-on-surface"
              )}
            >
              {value}
            </span>
          </Tooltip>
        ) : (
          <span
            className={cn(
              "inline-block font-mono text-[24px] font-light leading-none tracking-tight animate-count-up sm:text-[28px]",
              accent === "good" && "text-primary-fixed-dim",
              accent === "warn" && "text-secondary",
              accent === "muted" && "text-on-surface-variant",
              accent === "default" && "text-on-surface"
            )}
          >
            {value}
          </span>
        )}
      </div>

      {/* hint */}
      {hint && !loading && (
        <div className="mt-3 text-[12px] text-on-surface-variant sm:text-[11px]">{hint}</div>
      )}
      {loading && <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-surface-container" />}
    </article>
  );

  if (href) return <Link href={href}>{content}</Link>;
  if (onInspect)
    return (
      <button onClick={onInspect} className="block w-full text-left">
        {content}
      </button>
    );
  return content;
});
