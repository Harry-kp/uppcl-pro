"use client";

import { useState } from "react";
import { useHealth, useSites, logout } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { mutate as swrMutate } from "swr";
import { ExternalLink, LogOut, Sparkles, Sun, Moon, Laptop, Info } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

export default function SettingsPage() {
  const { data: h } = useHealth();
  const { data: sites } = useSites();
  const s = sites?.data?.[0];
  const { push } = useToast();

  const [theme, setTheme] = useState<"dark" | "light" | "system">(
    typeof window !== "undefined"
      ? ((localStorage.getItem("theme") as "dark" | "light") || "dark")
      : "dark"
  );

  const applyTheme = (t: "dark" | "light" | "system") => {
    setTheme(t);
    const resolved = t === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : t;
    localStorage.setItem("theme", resolved);
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.classList.toggle("light", resolved === "light");
    push(`Theme: ${t}`, { kind: "info" });
  };

  const signOut = async () => {
    try { await logout(); swrMutate(() => true); push("Signed out", { kind: "success" }); }
    catch (e) { push((e as Error).message ?? "Logout failed", { kind: "error" }); }
  };

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
      <header>
        <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          Preferences
        </div>
        <h1 className="mt-1 font-mono text-[32px] font-light tracking-tight text-on-surface">
          Settings
        </h1>
        <p className="mt-1 text-[12px] text-on-surface-variant">
          Session, connection details, appearance, and external links.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Session */}
        <section className="rounded-xl bg-surface-container-low p-6">
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            Session
          </div>
          <div className="mt-4 space-y-3 font-mono text-[13px]">
            <Row k="authenticated"   v={
              <span className={h?.authenticated ? "text-primary-fixed-dim" : "text-secondary"}>
                {h?.authenticated ? "yes · active" : "no"}
              </span>
            } />
            <Row k="expires in"      v={h ? `${h.jwt_expires_in_days?.toFixed(1) ?? "—"} days` : "—"} />
            <Row k="tenant uuid"     v={h?.tenant ?? "—"} small />
            <Row k="oaep variant"    v={h?.oaep_hash_in_use ?? "—"} />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-md bg-surface-container-high px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface transition hover:bg-surface-bright"
            >
              <LogOut className="h-3 w-3" /> Sign out
            </button>
            <Tooltip
              content={
                <div className="space-y-1">
                  <div>Upstream <code>/auth/logout</code> is a <span className="text-secondary">soft</span> delete —</div>
                  <div>the JWT itself stays valid until its <code>expires</code> timestamp.</div>
                  <div>To force-invalidate, change your UPPCL password.</div>
                </div>
              }
            >
              <span className="inline-flex cursor-help items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/70 underline decoration-dotted">
                <Info className="h-3 w-3" /> how logout behaves
              </span>
            </Tooltip>
          </div>
        </section>

        {/* Primary connection */}
        <section className="rounded-xl bg-surface-container-low p-6">
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            Primary connection
          </div>
          <div className="mt-4 space-y-3 font-mono text-[13px]">
            <Row k="connectionId"        v={s?.connectionId ?? "—"} />
            <Row k="deviceId (meter)"    v={s?.deviceId ?? "—"} />
            <Row k="installation #"      v={s?.meterInstallationNumber ?? "—"} />
            <Row k="discom"              v={s?.tenantId ?? "—"} />
            <Row k="meter phase"         v={s?.meterPhase ?? "—"} />
            <Row k="meter type"          v={s?.meterType ?? "—"} />
            <Row k="sanctioned load"     v={s?.sanctionedLoad ? `${s.sanctionedLoad} kW` : "—"} />
            <Row k="connection type"     v={s?.connectionType ?? "—"} />
          </div>
          <p className="mt-4 text-[10px] text-on-surface-variant/70">
            All user-specific IDs discovered at runtime from <code>/site/search</code>. Nothing hardcoded.
          </p>
        </section>

        {/* Appearance */}
        <section className="rounded-xl bg-surface-container-low p-6 lg:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            Appearance
          </div>
          <div className="mt-4 flex gap-2">
            {([
              { v: "dark",   label: "Dark",   Icon: Moon },
              { v: "light",  label: "Light",  Icon: Sun },
              { v: "system", label: "System", Icon: Laptop },
            ] as const).map(({ v, label, Icon }) => {
              const active = theme === v;
              return (
                <button
                  key={v}
                  onClick={() => applyTheme(v)}
                  className={
                    "flex items-center gap-2 rounded-lg px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] transition-colors " +
                    (active
                      ? "bg-primary-container text-on-primary-fixed"
                      : "bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface")
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] text-on-surface-variant/70">
            Shortcut: <span className="font-mono">t</span> toggles dark ↔ light.
          </p>
        </section>

        {/* External links */}
        <section className="rounded-xl bg-surface-container-low p-6 lg:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            External
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <LinkCard
              href="http://localhost:8000/docs"
              title="Proxy API docs"
              body="Swagger UI for the local FastAPI proxy — try any endpoint interactively."
              icon={<Sparkles className="h-4 w-4" />}
            />
            <LinkCard
              href="https://uppcl.sem.jio.com/uppclsmart/"
              title="UPPCL SMART web"
              body="Official UPPCL portal — recharge, change phone, view official receipts."
              icon={<ExternalLink className="h-4 w-4" />}
            />
            <LinkCard
              href="http://localhost:8000/health"
              title="Proxy health"
              body="Raw JSON health check — session expiry, OAEP variant, tenant."
              icon={<ExternalLink className="h-4 w-4" />}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ k, v, small }: { k: string; v: React.ReactNode; small?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2">
      <span className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">{k}</span>
      <span className={small ? "text-[11px] text-on-surface" : "text-on-surface"}>{v}</span>
    </div>
  );
}

function LinkCard({ href, title, body, icon }: { href: string; title: string; body: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-start gap-3 rounded-lg bg-surface-container-high p-4 transition-colors hover:bg-surface-bright"
    >
      <span className="rounded-md bg-surface-container p-2 text-on-surface-variant">{icon}</span>
      <div className="flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-on-surface">
          {title}
          <ExternalLink className="h-3 w-3 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="mt-0.5 text-[11px] text-on-surface-variant">{body}</div>
      </div>
    </a>
  );
}
