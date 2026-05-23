"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  className?: string;
}

/**
 * Right-docked drill-in panel. Dismiss on Escape or backdrop click.
 * Designed for inspecting a single entity (a bill, a payment, a tile's formula).
 */
export function SidePanel({ open, onClose, title, subtitle, children, width = 480, className }: SidePanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-40 flex" aria-modal role="dialog">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside
        className={cn(
          "relative flex flex-col bg-surface-container-low shadow-ambient",
          "animate-count-up",
          className
        )}
        style={{ width }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/5 px-6 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Drill-in</div>
            <div className="mt-1 text-[16px] font-medium text-on-surface">{title}</div>
            {subtitle && (
              <div className="mt-0.5 text-[11px] text-on-surface-variant">{subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>,
    document.body
  );
}
