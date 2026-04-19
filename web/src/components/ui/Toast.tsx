"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type ToastKind = "info" | "success" | "warn" | "error";

interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  ttl: number;
}

interface ToastContext {
  push: (message: string, opts?: { kind?: ToastKind; ttl?: number }) => void;
}

const Ctx = createContext<ToastContext | null>(null);

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be inside <ToastProvider>");
  return v;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  // `crypto.randomUUID()` is gated to secure contexts (HTTPS/localhost),
  // so it's undefined on plain http://<lan-host>:1912 deployments. A
  // monotonic counter is plenty for ephemeral toast IDs.
  const seq = useRef(0);

  useEffect(() => setMounted(true), []);

  const push = useCallback((message: string, opts?: { kind?: ToastKind; ttl?: number }) => {
    seq.current += 1;
    const id = `t${seq.current}`;
    setToasts((ts) => [...ts, { id, kind: opts?.kind ?? "info", message, ttl: opts?.ttl ?? 3200 }]);
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((t) =>
      setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), t.ttl)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed bottom-6 right-6 z-[90] flex flex-col gap-2">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={cn(
                  "pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 text-[12px] shadow-ambient animate-count-up",
                  t.kind === "success" && "bg-surface-container-high text-primary-fixed-dim",
                  t.kind === "warn" && "bg-surface-container-high text-secondary",
                  t.kind === "error" && "bg-surface-container-high text-error",
                  t.kind === "info" && "bg-surface-container-high text-on-surface"
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                <span>{t.message}</span>
              </div>
            ))}
          </div>,
          document.body
        )}
    </Ctx.Provider>
  );
}
