"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function AnomalyBanner({
  visible,
  message,
  onInvestigate,
  className,
}: {
  visible: boolean;
  message: React.ReactNode;
  onInvestigate?: () => void;
  className?: string;
}) {
  if (!visible) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg bg-[rgba(255,185,81,0.08)] px-4 py-3",
        className
      )}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary">
        <AlertTriangle className="h-4 w-4 text-on-secondary-fixed" strokeWidth={2} />
      </div>
      <div className="flex-1 text-[13px] text-on-surface">{message}</div>
      {onInvestigate && (
        <button
          onClick={onInvestigate}
          className="rounded-md bg-secondary-container px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-on-secondary-fixed transition hover:brightness-110"
        >
          Investigate
        </button>
      )}
    </div>
  );
}
