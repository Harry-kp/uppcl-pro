"use client";

import { useEffect, useRef, useState, cloneElement, isValidElement, ReactElement } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
  className?: string;
  /**
   * When true, Tooltip clones listeners + ref onto its single child instead
   * of wrapping it in a <span>. Use this whenever the child participates in
   * flex / absolute layout (stacked-bar segments, sparkline bars, timeline pins).
   */
  asChild?: boolean;
}

type ChildWithHandlers = {
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  ref?: React.Ref<HTMLElement>;
};

/**
 * Portal-based hover/focus tooltip. Default mode wraps children in a span;
 * `asChild` mode clones listeners onto a single child element without wrapping.
 */
export function Tooltip({ content, children, side = "top", delay = 120, className, asChild = false }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setOpen(true);
      requestAnimationFrame(() => {
        const tip = tipRef.current;
        const tipW = tip?.offsetWidth ?? 160;
        const tipH = tip?.offsetHeight ?? 28;
        const mid = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        const p = {
          top: side === "top" ? r.top - tipH - 8 : side === "bottom" ? r.bottom + 8 : mid.y - tipH / 2,
          left: side === "left" ? r.left - tipW - 8 : side === "right" ? r.right + 8 : mid.x - tipW / 2,
        };
        const maxLeft = window.innerWidth - tipW - 8;
        const maxTop = window.innerHeight - tipH - 8;
        setPos({
          top: Math.max(8, Math.min(p.top, maxTop)),
          left: Math.max(8, Math.min(p.left, maxLeft)),
        });
      });
    }, delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  const portal = mounted && open
    ? createPortal(
        <div
          ref={tipRef}
          role="tooltip"
          className={cn(
            "pointer-events-none fixed z-[100] max-w-[340px] rounded-md bg-surface-container-highest px-2.5 py-1.5 text-[11px] leading-snug text-on-surface shadow-ambient animate-count-up",
            className
          )}
          style={{ top: pos.top, left: pos.left }}
        >
          {content}
        </div>,
        document.body
      )
    : null;

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<ChildWithHandlers>;
    const setRef = (el: HTMLElement | null) => {
      triggerRef.current = el;
      const childRef = (child.props as ChildWithHandlers).ref ?? (child as unknown as { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof childRef === "function") (childRef as (el: HTMLElement | null) => void)(el);
      else if (childRef && "current" in (childRef as object)) (childRef as React.MutableRefObject<HTMLElement | null>).current = el;
    };
    const existing = child.props as ChildWithHandlers;
    const compose = <E,>(a?: (e: E) => void, b?: () => void) => (e: E) => { a?.(e); b?.(); };
    return (
      <>
        {cloneElement(child, {
          ref: setRef,
          onMouseEnter: compose<React.MouseEvent>(existing.onMouseEnter, show),
          onMouseLeave: compose<React.MouseEvent>(existing.onMouseLeave, hide),
          onFocus: compose<React.FocusEvent>(existing.onFocus, show),
          onBlur: compose<React.FocusEvent>(existing.onBlur, hide),
        } as Partial<ChildWithHandlers>)}
        {portal}
      </>
    );
  }

  return (
    <>
      <span
        ref={triggerRef as React.Ref<HTMLSpanElement>}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-flex"
      >
        {children}
      </span>
      {portal}
    </>
  );
}
