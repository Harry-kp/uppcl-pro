"use client";

import { useEffect, useRef } from "react";

type Action = () => void;
type Binding = { keys: string; action: Action; description?: string };

/**
 * Register keyboard shortcuts. Supports single keys (`/`) and chords (`g h`).
 * Chord window: 1.2 s. No action fires while focus is in an input/textarea.
 */
export function useKeyboardShortcuts(bindings: Binding[]) {
  const buffer = useRef<string[]>([]);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      buffer.current.push(key);
      if (reset.current) clearTimeout(reset.current);
      reset.current = setTimeout(() => (buffer.current = []), 1200);

      const joined = buffer.current.join(" ");
      for (const b of bindings) {
        if (b.keys === joined) {
          e.preventDefault();
          buffer.current = [];
          b.action();
          return;
        }
      }
      // If buffer no longer matches any prefix, drop it
      const stillPossible = bindings.some((b) => b.keys === joined || b.keys.startsWith(joined + " "));
      if (!stillPossible) buffer.current = [];
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bindings]);
}
