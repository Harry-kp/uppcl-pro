"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";
import { OutageReporter } from "./OutageReporter";
import { LoginGate } from "./LoginGate";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import { useHealth } from "@/lib/api";
import { Loader2 } from "lucide-react";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ShellInner>{children}</ShellInner>
    </ToastProvider>
  );
}

type Theme = "dark" | "light";

function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && (localStorage.getItem("theme") as Theme | null)) || "dark";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: one-time client-side theme init from localStorage
    setThemeState(stored);
    document.documentElement.classList.toggle("dark", stored === "dark");
    document.documentElement.classList.toggle("light", stored === "light");
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.classList.toggle("light", t === "light");
  };
  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const router = useRouter();
  const { push } = useToast();
  const { theme, toggle } = useTheme();
  const { data: health, error: healthError, isLoading: healthLoading } = useHealth();

  const bindings = useMemo(
    () => [
      { keys: "g h", action: () => { router.push("/"); push("→ Home", { kind: "info" }); } },
      { keys: "g u", action: () => { router.push("/analytics"); push("→ Usage", { kind: "info" }); } },
      { keys: "g b", action: () => { router.push("/ledger"); push("→ Bills", { kind: "info" }); } },
      { keys: "g r", action: () => { router.push("/recharges"); push("→ Recharges", { kind: "info" }); } },
      { keys: "g m", action: () => { router.push("/grid-nodes"); push("→ Meter", { kind: "info" }); } },
      { keys: "g c", action: () => { router.push("/complaints"); push("→ Complaints", { kind: "info" }); } },
      { keys: "g s", action: () => { router.push("/settings"); push("→ Settings", { kind: "info" }); } },
      { keys: "t",   action: () => { toggle(); push(`Theme: ${theme === "dark" ? "light" : "dark"}`, { kind: "info" }); } },
      { keys: "?",   action: () => push("⌘K palette · g + [h/u/b/r/m/c/s] navigate · t toggle theme", { kind: "info", ttl: 5000 }) },
    ],
    [router, push, toggle, theme]
  );
  useKeyboardShortcuts(bindings);

  // ── Auth gate ───────────────────────────────────────────────────────
  // While we're still fetching /health, hold a minimal splash instead of
  // flashing the login form. Once we know: unreachable → gate shows a
  // "proxy down" panel; unauthenticated → login form; authenticated → app.
  if (healthLoading && !health && !healthError) {
    return (
      <div className="grid h-dvh place-items-center bg-(--color-void) text-on-surface-variant">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (healthError) {
    return <LoginGate proxyUnreachable={(healthError as Error).message} />;
  }
  if (health && !health.authenticated) {
    return <LoginGate />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-(--color-void)">
      <Sidebar onOpenPalette={() => setPaletteOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenPalette={() => setPaletteOpen(true)} theme={theme} onToggleTheme={toggle} />
        <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      {/* Global outage-report panel — any page fires `uppcl:open-outage` to open it. */}
      <OutageReporter />
    </div>
  );
}
