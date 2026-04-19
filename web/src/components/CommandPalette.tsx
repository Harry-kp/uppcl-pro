"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { mutate as swrMutate } from "swr";
import { Home, Activity, ScrollText, Radio, Settings, Zap, Bell, Download, Clock, RefreshCw, Wallet, LogOut, ExternalLink, AlertTriangle, MessageSquare } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { logout } from "@/lib/api";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const { push } = useToast();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = (path: string, label: string) => {
    router.push(path);
    onOpenChange(false);
    push(`→ ${label}`, { kind: "info" });
  };

  const act = (name: string, fn: () => unknown) => async () => {
    onOpenChange(false);
    try {
      await fn();
      push(name, { kind: "success" });
    } catch (e) {
      push((e as Error).message ?? name + " failed", { kind: "error" });
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[15vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-[640px] rounded-xl bg-surface-container-low shadow-ambient">
        <Command label="Command palette" className="flex flex-col" loop>
          <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
            <span className="text-on-surface-variant">⌕</span>
            <Command.Input
              placeholder="Search commands or data…"
              className="flex-1 bg-transparent text-[14px] text-on-surface placeholder:text-on-surface-variant/60 outline-none"
              autoFocus
            />
            <kbd className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">ESC</kbd>
          </div>

          <Command.List className="max-h-[55vh] overflow-y-auto px-2 py-2">
            <Command.Empty className="px-3 py-6 text-center text-[13px] text-on-surface-variant">
              Nothing matches.
            </Command.Empty>

            <PGroup heading="Navigate">
              <PItem onSelect={() => go("/", "Home")}                    icon={<Home className="h-4 w-4" />}       shortcut="g h">Home</PItem>
              <PItem onSelect={() => go("/analytics", "Usage")}          icon={<Activity className="h-4 w-4" />}   shortcut="g u">Usage · consumption</PItem>
              <PItem onSelect={() => go("/ledger", "Bills")}             icon={<ScrollText className="h-4 w-4" />} shortcut="g b">Bills · cost &amp; timeline</PItem>
              <PItem onSelect={() => go("/recharges", "Recharges")}      icon={<Wallet className="h-4 w-4" />}     shortcut="g r">Recharges · sweet spot</PItem>
              <PItem onSelect={() => go("/grid-nodes", "Meter")}         icon={<Radio className="h-4 w-4" />}          shortcut="g m">Meter · health</PItem>
              <PItem onSelect={() => go("/complaints", "Complaints")}    icon={<MessageSquare className="h-4 w-4" />}  shortcut="g c">Complaints · 1912 history</PItem>
              <PItem onSelect={() => go("/settings", "Settings")}        icon={<Settings className="h-4 w-4" />}       shortcut="g s">Settings</PItem>
            </PGroup>

            <PGroup heading="Act">
              <PItem
                onSelect={() => { onOpenChange(false); window.dispatchEvent(new CustomEvent("uppcl:open-outage")); }}
                icon={<AlertTriangle className="h-4 w-4 text-secondary" />}
              >
                Report power outage
              </PItem>
              <PItem onSelect={act("Refreshed all data", () => swrMutate(() => true))} icon={<RefreshCw className="h-4 w-4" />}>
                Refresh all data
              </PItem>
              <PItem onSelect={act("Alert scheduled", () => {})} icon={<Bell className="h-4 w-4" />}>
                Set low-balance alert
              </PItem>
              <PItem
                onSelect={act("Opening UPPCL payment portal", () => {
                  window.open("https://uppcl.sem.jio.com/uppclsmart/", "_blank");
                })}
                icon={<Zap className="h-4 w-4 text-secondary" />}
              >
                Recharge now
              </PItem>
              <PItem
                onSelect={act("CSV export started", async () => {
                  const res = await fetch("http://localhost:8000/bills?days=365&limit=365");
                  const json = await res.json();
                  type Row = Record<string, string | null | undefined>;
                  const rows: Row[] = (json.data ?? []).map((b: { dailyBill: Row }) => b.dailyBill);
                  const headers = Object.keys(rows[0] ?? {});
                  const csv = [headers.join(","), ...rows.map((r: Row) => headers.map((h) => (r[h] ?? "")).join(","))].join("\n");
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                  a.download = "uppcl-bills.csv";
                  a.click();
                })}
                icon={<Download className="h-4 w-4" />}
              >
                Export all bills (CSV)
              </PItem>
            </PGroup>

            <PGroup heading="External">
              <PItem
                onSelect={act("Opening UPPCL SMART", () => window.open("https://uppcl.sem.jio.com/uppclsmart/", "_blank"))}
                icon={<ExternalLink className="h-4 w-4" />}
              >
                Open UPPCL SMART web
              </PItem>
              <PItem
                onSelect={act("Opening proxy docs", () => window.open("http://localhost:8000/docs", "_blank"))}
                icon={<ExternalLink className="h-4 w-4" />}
              >
                Open proxy API docs (Swagger)
              </PItem>
            </PGroup>

            <PGroup heading="Session">
              <PItem onSelect={act("Logged out", async () => { await logout(); swrMutate(() => true); })} icon={<LogOut className="h-4 w-4" />}>
                Logout (soft — JWT survives on server)
              </PItem>
            </PGroup>

            <PGroup heading="Learn">
              <PItem onSelect={act("Shortcuts", () => push("⌘K = palette · g+[h/a/l/r/n/s] = nav · ? = help", { kind: "info", ttl: 6000 }))} icon={<Clock className="h-4 w-4" />}>
                Keyboard shortcuts
              </PItem>
            </PGroup>
          </Command.List>

          <div className="flex items-center justify-between border-t border-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/70">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1.5"><kbd className="font-mono">⏎</kbd> select</span>
              <span className="flex items-center gap-1.5"><kbd className="font-mono">⌘K</kbd> close</span>
            </div>
            <div className="flex items-center gap-1.5 text-primary-fixed-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-fixed-dim" /> UPPCL PRO
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}

function PGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.2em] [&_[cmdk-group-heading]]:text-on-surface-variant/70"
    >
      {children}
    </Command.Group>
  );
}

function PItem({ onSelect, icon, shortcut, children }: { onSelect: () => void; icon: React.ReactNode; shortcut?: string; children: React.ReactNode }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[13px] text-on-surface data-[selected=true]:bg-surface-container aria-selected:bg-surface-container"
    >
      <span className="text-on-surface-variant">{icon}</span>
      <span className="flex-1">{children}</span>
      {shortcut && <kbd className="font-mono text-[10px] text-on-surface-variant">{shortcut}</kbd>}
    </Command.Item>
  );
}
