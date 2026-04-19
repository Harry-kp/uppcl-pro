"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Activity, ScrollText, Radio, Settings, Wallet, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";
import { useHealth } from "@/lib/api";

const nav = [
  { href: "/",            label: "Home",       icon: Home,        hint: "Balance · runway · anomalies",          shortcut: "g h" },
  { href: "/analytics",   label: "Usage",      icon: Activity,    hint: "Consumption heatmap + patterns",        shortcut: "g u" },
  { href: "/ledger",      label: "Bills",      icon: ScrollText,  hint: "Cost breakdown + unified timeline",     shortcut: "g b" },
  { href: "/recharges",   label: "Recharges",  icon: Wallet,      hint: "Sweet-spot recommender + history",      shortcut: "g r" },
  { href: "/grid-nodes",  label: "Meter",      icon: Radio,         hint: "Health, data integrity, peak load",     shortcut: "g m" },
  { href: "/complaints",  label: "Complaints", icon: MessageSquare, hint: "1912 complaint history & status",       shortcut: "g c" },
  { href: "/settings",    label: "Settings",   icon: Settings,      hint: "Session, preferences, external links",  shortcut: "g s" },
] as const;

export function Sidebar(_props: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const { data: h, error } = useHealth();
  const proxyOk = !error && !!h?.ok;
  const authed = !!h?.authenticated;

  return (
    <aside className="flex h-dvh w-[220px] shrink-0 flex-col bg-(--color-surface-container-lowest) px-4 py-6">
      {/* Wordmark */}
      <div className="px-2 pb-10">
        <div className="font-mono text-[18px] font-semibold tracking-[0.02em] text-primary-fixed-dim">
          UPPCL
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.28em] text-on-surface-variant/70">
          Kinetic Vault
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1">
        {nav.map(({ href, label, icon: Icon, hint, shortcut }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Tooltip
              key={href}
              side="right"
              content={
                <div>
                  <div className="font-mono text-on-surface">{label}</div>
                  <div className="text-on-surface-variant">{hint}</div>
                  <div className="mt-1 font-mono text-[10px] text-on-surface-variant/70">
                    shortcut: <span className="text-on-surface-variant">{shortcut}</span>
                  </div>
                </div>
              }
            >
              <Link
                href={href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                  active
                    ? "bg-surface-container-high text-on-surface"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span>{label}</span>
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      {/* Live Grid status pill — anchored to bottom */}
      <Tooltip
        side="right"
        content={
          <div className="space-y-1">
            <div className="font-mono text-on-surface">
              Proxy · <span className={proxyOk ? "text-primary-fixed-dim" : "text-secondary"}>
                {proxyOk ? "reachable" : "unreachable"}
              </span>
            </div>
            <div className="font-mono text-on-surface">
              Session · {authed
                ? <span className="text-primary-fixed-dim">active · {h?.jwt_expires_in_days?.toFixed(0)}d left</span>
                : <span className="text-secondary">not logged in</span>
              }
            </div>
            <div className="text-on-surface-variant">OAEP: {h?.oaep_hash_in_use ?? "—"}</div>
            <div className="text-on-surface-variant">Tenant: <span className="font-mono">{h?.tenant?.slice(0, 8) ?? "—"}…</span></div>
          </div>
        }
      >
        <div
          className={cn(
            "mt-2 flex cursor-help items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2.5",
            "transition-colors hover:bg-surface-container"
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              proxyOk ? "bg-primary-fixed-dim glow-primary" : "bg-secondary"
            )}
          />
          <Radio className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" strokeWidth={1.75} />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className={cn(
              "text-[11px] font-medium",
              proxyOk ? "text-on-surface" : "text-secondary"
            )}>
              {proxyOk ? "Live grid" : "Grid offline"}
            </span>
            <span className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-on-surface-variant/80">
              {authed
                ? `jwt ${h?.jwt_expires_in_days?.toFixed(0) ?? "?"}d left`
                : "not signed in"}
            </span>
          </div>
        </div>
      </Tooltip>
    </aside>
  );
}
