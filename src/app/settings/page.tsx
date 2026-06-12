"use client";

import { useState } from "react";
import { useHealth, useSites, useWssConsumer, logout } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { mutate as swrMutate } from "swr";
import { ExternalLink, LogOut, Sun, Moon, Laptop, Info, Code2 } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

export default function SettingsPage() {
  const { data: h } = useHealth();
  const { data: sites } = useSites();
  const s = sites?.data?.[0];
  const { data: wssConsumer } = useWssConsumer();
  const cd = wssConsumer?.ConsumerDetails;
  const billingMode = cd?.onlineBillingStatus;
  // The official profile embeds a govt-scheme flag inside currentAddress, e.g.
  // "$True…eligible for Bijli Bill Rahat Yojna 2025". Pull the name when active.
  const schemeMatch = (cd?.currentAddress ?? "").match(/\$(True|False)[^,]*?[Ee]ligible [Ff]or ([^,]+)/);
  const schemeName = schemeMatch && schemeMatch[1].toLowerCase() === "true" ? schemeMatch[2].trim() : null;
  const dob = cd?.dateOfBirth
    ? (() => { const d = new Date(cd.dateOfBirth!.replace(/-/g, " ")); return isNaN(d.getTime()) ? cd.dateOfBirth : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); })()
    : null;
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
        <h1 className="mt-1 font-mono text-[28px] font-light tracking-tight text-on-surface sm:text-[32px]">
          Settings
        </h1>
        <p className="mt-1 text-[13px] text-on-surface-variant sm:text-[12px]">
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

          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              onClick={signOut}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-surface-container-high px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface transition hover:bg-surface-bright sm:w-auto"
            >
              <LogOut className="h-3 w-3" /> Sign out
            </button>
            <Tooltip
              content={
                <div className="space-y-1">
                  <div>Signing out clears your local session on this device.</div>
                  <div>To fully revoke access everywhere, change your UPPCL password.</div>
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
            <Row k="billing mode"        v={billingMode ? (billingMode.toUpperCase() === "EMAIL" ? "Paperless (email)" : billingMode) : "—"} />
          </div>

          {/* Billing office & scheme — from the official /wss getConsumerDetails profile */}
          <div className="mt-5 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/80">Billing office</div>
          <div className="mt-3 space-y-3 font-mono text-[13px]">
            <Row k="division"            v={cd?.division ?? "—"} />
            <Row k="sub-division"        v={cd?.subDivision ?? "—"} />
            <Row k="latest bill no"      v={cd?.billNo ?? "—"} />
            {dob && <Row k="account holder dob" v={dob} small />}
            <Row k="govt scheme"         v={
              schemeName
                ? <span className="text-primary-fixed-dim">{schemeName}</span>
                : <span className="text-on-surface-variant">none active</span>
            } />
          </div>
          <p className="mt-4 text-[10px] text-on-surface-variant/70">
            Connection IDs from <code>/site/search</code>; billing office &amp; scheme from the official
            UPPCL <code>getConsumerDetails</code> profile. Nothing hardcoded.
          </p>
        </section>

        {/* Appearance */}
        <section className="rounded-xl bg-surface-container-low p-6 lg:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            Appearance
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
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
                    "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] transition-colors sm:w-auto " +
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
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <LinkCard
              href="https://uppcl.sem.jio.com/uppclsmart/"
              title="UPPCL SMART web"
              body="Official UPPCL portal — recharge, change phone, view official receipts."
              icon={<ExternalLink className="h-4 w-4" />}
            />
            <LinkCard
              href="https://github.com/Harry-kp/uppcl-pro"
              title="GitHub"
              body="Source code, issues, and contributing guidelines."
              icon={<Code2 className="h-4 w-4" />}
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
