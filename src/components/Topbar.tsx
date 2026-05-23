"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Command, Moon, Search, Sun, LogOut, User } from "lucide-react";
import { mutate as swrMutate } from "swr";
import { useHealth, logout } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";

const PAGE_LABELS: Record<string, { title: string; crumb: string }> = {
  "/":            { title: "Home",      crumb: "glance view" },
  "/analytics":   { title: "Usage",     crumb: "consumption patterns" },
  "/ledger":      { title: "Bills",     crumb: "cost & timeline" },
  "/recharges":   { title: "Recharges", crumb: "sweet spot" },
  "/grid-nodes":  { title: "Meter",      crumb: "health & integrity" },
  "/complaints":  { title: "Complaints", crumb: "1912 history" },
  "/settings":    { title: "Settings",   crumb: "preferences" },
};

export function Topbar({
  onOpenPalette,
  theme,
  onToggleTheme,
}: {
  onOpenPalette: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}) {
  const { data: h, error } = useHealth();
  const { push } = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const page = PAGE_LABELS[pathname] ?? { title: "UPPCL Pro", crumb: "" };
  const proxyOk = !error && h?.ok;
  const authed = h?.authenticated;

  const doLogout = async () => {
    setProfileOpen(false);
    try {
      await logout();
      swrMutate(() => true);
      push("Signed out", { kind: "success" });
    } catch (e) {
      push((e as Error).message ?? "Logout failed", { kind: "error" });
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/[0.03] px-8">
      {/* Left: breadcrumb */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[13px] tracking-[0.02em] text-on-surface">
          UPPCL Pro
        </span>
        <span className="text-on-surface-variant/40">/</span>
        <span className="text-[13px] text-on-surface">{page.title}</span>
        {page.crumb && (
          <span className="text-[11px] text-on-surface-variant/70">· {page.crumb}</span>
        )}
      </div>

      {/* Right: search + icons + profile */}
      <div className="flex items-center gap-2">
        {/* Search-palette trigger */}
        <button
          onClick={onOpenPalette}
          className="group flex items-center gap-2 rounded-md bg-surface-container-low px-3 py-1.5 text-[12px] text-on-surface-variant transition hover:bg-surface-container hover:text-on-surface"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span>Search…</span>
          <span className="ml-6 flex items-center gap-0.5 font-mono text-[10px] text-on-surface-variant/80">
            <Command className="h-3 w-3" strokeWidth={2.5} /> K
          </span>
        </button>

        {/* Theme toggle */}
        <Tooltip content={<><div className="font-mono text-on-surface">Theme: {theme}</div><div className="text-on-surface-variant">shortcut: t</div></>}>
          <button
            onClick={onToggleTheme}
            className="rounded-md p-2 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </Tooltip>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => { setNotifOpen((v) => !v); setProfileOpen(false); }}
            className="relative rounded-md p-2 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" strokeWidth={1.75} />
            {!authed && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-secondary" />
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-10 z-50 w-[320px] rounded-xl bg-surface-container-low p-2 shadow-ambient">
              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
                Notifications
              </div>
              {!authed && (
                <NotifRow
                  tone="warn"
                  title="Not logged in"
                  body="The proxy has no cached JWT. Run POST /auth/login."
                />
              )}
              {h && h.jwt_expires_in_days !== null && h.jwt_expires_in_days < 5 && (
                <NotifRow
                  tone="warn"
                  title="JWT expiring soon"
                  body={`Re-login before ${h.jwt_expires_in_days?.toFixed(0)}d`}
                />
              )}
              <NotifRow
                tone="info"
                title="System nominal"
                body={`Proxy ${proxyOk ? "reachable" : "unreachable"} · OAEP ${h?.oaep_hash_in_use ?? "—"}`}
              />
            </div>
          )}
        </div>

        {/* Profile */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => { setProfileOpen((v) => !v); setNotifOpen(false); }}
            className={cn(
              "ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high text-[11px] transition hover:brightness-125",
              authed ? "text-on-surface ring-2 ring-primary-fixed-dim/40" : "text-on-surface-variant ring-2 ring-secondary/40"
            )}
            aria-label="Account menu"
          >
            U
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-10 z-50 w-[260px] overflow-hidden rounded-xl bg-surface-container-low shadow-ambient">
              <div className="border-b border-white/5 px-4 py-3">
                <div className="text-[11px] text-on-surface-variant">signed in</div>
                <div className="font-mono text-[13px] text-on-surface">
                  {authed ? "UPPCL user" : "not authenticated"}
                </div>
                {authed && (
                  <div className="mt-1 font-mono text-[10px] text-on-surface-variant/80">
                    jwt · {h?.jwt_expires_in_days?.toFixed(0)}d remaining
                  </div>
                )}
              </div>
              <MenuRow icon={<User className="h-4 w-4" />} onClick={() => { setProfileOpen(false); router.push("/settings"); }}>
                Settings
              </MenuRow>
              <MenuRow icon={<LogOut className="h-4 w-4" />} onClick={doLogout}>
                Sign out
              </MenuRow>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuRow({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] text-on-surface transition-colors hover:bg-surface-container"
    >
      <span className="text-on-surface-variant">{icon}</span>
      <span>{children}</span>
    </button>
  );
}

function NotifRow({ tone, title, body }: { tone: "info" | "warn" | "error"; title: string; body: string }) {
  const toneCls = tone === "warn" ? "text-secondary" : tone === "error" ? "text-error" : "text-primary-fixed-dim";
  return (
    <div className="flex gap-3 rounded-md px-3 py-2 hover:bg-surface-container">
      <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current", toneCls)} />
      <div>
        <div className="text-[12px] text-on-surface">{title}</div>
        <div className="text-[11px] text-on-surface-variant">{body}</div>
      </div>
    </div>
  );
}
