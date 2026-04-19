"use client";

import { useMemo, useState } from "react";
import {
  useDashboard,
  useHealth,
  usePayments,
  Payment,
} from "@/lib/api";
import { Tooltip } from "@/components/ui/Tooltip";
import { SidePanel } from "@/components/ui/SidePanel";
import { useToast } from "@/components/ui/Toast";
import { mean, toNum } from "@/lib/stats";
import { rupees, daysBetween } from "@/lib/utils";
import { AlertTriangle, BellRing, Calendar, Sparkles, ArrowUpRight } from "lucide-react";

export default function RechargesPage() {
  const { data } = useDashboard();
  const { data: paysResp } = usePayments(50);
  const { data: h } = useHealth();
  const { push } = useToast();

  const [amount, setAmount] = useState(2000);
  const [frequency, setFrequency] = useState<"Weekly" | "Fortnightly" | "Bi-Monthly" | "Monthly" | "Quarterly">("Bi-Monthly");
  const [selected, setSelected] = useState<Payment | null>(null);

  const payments = paysResp?.data ?? [];

  // Lifespans: pair consecutive recharges
  const lifespans = useMemo(() => {
    const sorted = [...payments]
      .filter((p) => toNum(p.amt) > 0 && p.status === "Success")
      .sort((a, b) => new Date(a.payment_dt).getTime() - new Date(b.payment_dt).getTime());
    const out: { from: string; to: string; amt: number; days: number; txn: string; raw: Payment }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const days = daysBetween(a.payment_dt, b.payment_dt);
      if (days <= 0) continue;
      out.push({ from: a.payment_dt, to: b.payment_dt, amt: toNum(a.amt), days, txn: a.txn_id, raw: a });
    }
    return out;
  }, [payments]);

  // Stats
  const avgDaysPerRecharge = mean(lifespans.map((l) => l.days));
  const avgCostPerDay = data
    ? data.runway.avg_daily_spend
    : lifespans.length
      ? mean(lifespans.map((l) => l.amt / l.days))
      : 0;

  // Projected runway from sliders
  const projectedRunway = avgCostPerDay > 0 ? amount / avgCostPerDay : 0;

  // Balance & warning
  const balance = data?.balance.inr ?? 0;
  const runway = data?.runway.days ?? 0;
  const lowBalance = runway > 0 && runway < 2 || balance < 200;

  // Next recharge schedule
  const nextRechargeAt = useMemo(() => {
    const freqDays: Record<typeof frequency, number> = {
      Weekly: 7,
      Fortnightly: 14,
      "Bi-Monthly": 15,
      Monthly: 30,
      Quarterly: 90,
    };
    const base = payments[0]?.payment_dt ? new Date(payments[0].payment_dt).getTime() : Date.now();
    return new Date(base + freqDays[frequency] * 86400_000);
  }, [payments, frequency]);

  const setAlert = () => {
    push(`Reminder set — we'll ping you before ${nextRechargeAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`, {
      kind: "success",
    });
  };

  // Historical lifespan chart
  const maxSpanDays = Math.max(...lifespans.map((l) => l.days), 30);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            Financial Ledger
          </div>
          <h1 className="mt-1 font-mono text-[32px] font-light tracking-tight text-on-surface">
            Recharges &amp; Runway
          </h1>
          <p className="mt-1 text-[12px] text-on-surface-variant">
            Optimize when and how much to drop in. Sliders below estimate runway from your historical burn.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.22em] text-on-surface-variant">
            Estimated depletion
          </div>
          <div className="mt-1 font-mono text-[36px] font-light text-on-surface">
            {runway > 0 ? runway.toFixed(0) : "—"}
            <span className="ml-1 text-[12px] text-on-surface-variant">DAYS</span>
          </div>
        </div>
      </header>

      {/* Row 1: Recommender + alerts column */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        {/* Sweet-spot recommender */}
        <section className="rounded-xl bg-surface-container-low p-6">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-primary-fixed-dim">
                <Sparkles className="h-3 w-3" /> Sweet-Spot Recommender
              </div>
              <div className="mt-1 text-[12px] text-on-surface-variant">
                Optimize your kinetic energy investment
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-8">
            {/* sliders column */}
            <div className="space-y-6">
              <SliderRow
                label="Recharge amount"
                display={`₹${amount.toLocaleString("en-IN")}`}
                min={500}
                max={10000}
                step={500}
                value={amount}
                onChange={setAmount}
                ticks={["₹500", "₹5,000", "₹10,000"]}
              />
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">Frequency</span>
                  <span className="font-mono text-[14px] text-primary-fixed-dim">{frequency}</span>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-1">
                  {/* Pills show short labels to fit a 5-col grid; the full
                      name (e.g. "Bi-Monthly") stays visible in the header
                      above so nothing is lost. */}
                  {(
                    [
                      { value: "Weekly",      short: "Weekly" },
                      { value: "Fortnightly", short: "2-Week" },
                      { value: "Bi-Monthly",  short: "Bi-Mo"  },
                      { value: "Monthly",     short: "Monthly" },
                      { value: "Quarterly",   short: "Quarter" },
                    ] as const
                  ).map(({ value, short }) => (
                    <button
                      key={value}
                      onClick={() => setFrequency(value)}
                      className={
                        "rounded-md px-1 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap transition-colors " +
                        (frequency === value
                          ? "bg-primary-container text-on-primary-fixed"
                          : "bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface")
                      }
                    >
                      {short}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* projected runway column */}
            <div className="flex flex-col items-center justify-center rounded-lg bg-surface-container p-6 text-center">
              <div className="text-[10px] uppercase tracking-[0.26em] text-on-surface-variant">
                Projected Runway
              </div>
              <div className="mt-2 font-mono text-[56px] font-light leading-none text-on-surface">
                {projectedRunway > 0 ? projectedRunway.toFixed(0) : "—"}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-on-surface-variant/80">
                Days of uptime
              </div>
              <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-surface-container-lowest">
                <div
                  className="h-full bg-primary-container transition-[width] duration-700"
                  style={{ width: `${Math.min(100, (projectedRunway / 60) * 100)}%` }}
                />
              </div>
              <div className="mt-2 font-mono text-[10px] text-on-surface-variant">
                assumes ₹{avgCostPerDay.toFixed(2)}/day burn (based on {lifespans.length || "your"} recharge history)
              </div>
            </div>
          </div>
        </section>

        {/* Alerts column */}
        <div className="flex flex-col gap-3">
          <AlertCard
            kind={lowBalance ? "warn" : "ok"}
            title={lowBalance ? "Low Balance Warning" : "Balance healthy"}
            body={
              lowBalance
                ? <>Wallet below threshold (₹200). Auto-cutoff risk in {runway > 0 ? `${runway.toFixed(0)}h` : "the next cycle"}.</>
                : <>₹{rupees(balance, { decimals: 0 })} on meter · {runway.toFixed(0)} days runway at current burn.</>
            }
            cta={lowBalance ? "Action Required" : "No Action"}
            onCta={lowBalance ? () => window.open("https://uppcl.sem.jio.com/uppclsmart/", "_blank") : undefined}
          />
          <AlertCard
            kind="info"
            title="Upcoming Recharge"
            body={<>Scheduled for <span className="font-mono text-on-surface">{nextRechargeAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span> · {frequency} Tier (₹{amount.toLocaleString("en-IN")})</>}
            cta="Scheduled"
            icon={<Calendar className="h-4 w-4" />}
          />
          <AlertCard
            kind="muted"
            title="Session verification"
            body={h?.authenticated ? <>Active · {h.jwt_expires_in_days?.toFixed(0)}d left</> : <>Not logged in.</>}
          />
        </div>
      </div>

      {/* Row 2: Lifespan chart */}
      <section className="rounded-xl bg-surface-container-low p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
              Recharge Lifespan Analytics
            </div>
            <p className="mt-1 text-[11px] text-on-surface-variant">
              Historical duration analysis by amount tier
            </p>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-primary-container" /> ELITE (≥₹5k)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-primary-fixed-dim" /> STANDARD
            </span>
          </div>
        </div>
        <div className="space-y-2">
          {lifespans.length ? (
            [...lifespans].reverse().slice(0, 12).map((l) => {
              const pct = (l.days / maxSpanDays) * 100;
              const elite = l.amt >= 5000;
              return (
                <Tooltip
                  key={l.txn}
                  content={
                    <div>
                      <div className="font-mono text-on-surface">₹{rupees(l.amt)} · {l.days} days</div>
                      <div className="text-on-surface-variant">
                        {new Date(l.from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} →{" "}
                        {new Date(l.to).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </div>
                      <div className="text-on-surface-variant">₹{(l.amt / l.days).toFixed(2)}/day effective</div>
                    </div>
                  }
                >
                  <div className="flex items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-surface-container">
                    <div className="w-40 font-mono text-[10px] text-on-surface-variant">
                      {new Date(l.from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} –{" "}
                      {new Date(l.to).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </div>
                    <div className="flex-1 overflow-hidden rounded-sm bg-surface-container">
                      <div
                        className={"h-3 transition-[width] duration-700 " + (elite ? "bg-primary-container" : "bg-primary-fixed-dim")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="w-20 text-right font-mono text-[11px] text-on-surface">
                      {l.days} days
                    </div>
                    <div className="w-20 text-right font-mono text-[11px] text-on-surface-variant">
                      ₹{rupees(l.amt, { decimals: 0 })}
                    </div>
                  </div>
                </Tooltip>
              );
            })
          ) : (
            <div className="py-10 text-center text-[11px] text-on-surface-variant">
              Need at least 2 successful recharges to compute lifespans.
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-6 border-t border-white/5 pt-4 text-center">
          <Stat k="Avg days / recharge"   v={avgDaysPerRecharge ? avgDaysPerRecharge.toFixed(1) : "—"} />
          <Stat k="Avg cost / day"        v={`₹${avgCostPerDay.toFixed(2)}`} />
          <Stat k="Vault efficiency"      v={lifespans.length ? `${((avgDaysPerRecharge / 30) * 100).toFixed(1)}%` : "—"} />
        </div>
      </section>

      {/* Row 3: Transaction ledger */}
      <section className="rounded-xl bg-surface-container-low p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            Transaction ledger
          </div>
          <button
            onClick={setAlert}
            className="flex items-center gap-1.5 rounded-md bg-surface-container-high px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface transition hover:bg-surface-bright"
          >
            <BellRing className="h-3 w-3" /> Set reminder for next
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 text-[12px]">
            <thead className="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
              <tr>
                <Th>Date</Th><Th>Amount</Th><Th>Method</Th><Th>Status</Th><Th>txn ID</Th><Th>MSI</Th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {payments.map((p) => {
                const td = "px-3 py-2 bg-surface-container-lowest text-on-surface hover:bg-surface-container cursor-pointer transition-colors";
                return (
                  <tr key={p._id} onClick={() => setSelected(p)}>
                    <td className={td + " rounded-l-md"}>
                      {new Date(p.payment_dt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className={td + " text-primary-fixed-dim"}>
                      ₹{rupees(toNum(p.amt), { decimals: 0 })}
                    </td>
                    <td className={td}>{p.payment_type} · {p.channel}</td>
                    <td className={td}>
                      <span className={
                        "inline-flex rounded-full px-2 py-0.5 text-[10px] " +
                        (p.status === "Success"
                          ? "bg-primary-container/20 text-primary-fixed-dim"
                          : "bg-secondary-container/30 text-secondary")
                      }>
                        {p.status}
                      </span>
                    </td>
                    <td className={td + " truncate"}>{p.txn_id}</td>
                    <td className={td + " rounded-r-md truncate text-on-surface-variant"}>{p.msi}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recharge drill-in */}
      <SidePanel
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Recharge · ₹${rupees(toNum(selected.amt))}` : ""}
        subtitle={selected ? new Date(selected.payment_dt).toLocaleString("en-IN") : undefined}
      >
        {selected && (
          <div className="space-y-4">
            <KvBlock k="Amount received"        v={`₹${rupees(toNum(selected.amt))}`} big />
            <KvBlock k="Status"                 v={selected.status} />
            <KvBlock k="Payment method"         v={`${selected.payment_type} · ${selected.channel}`} />
            <KvBlock k="Transaction ID"         v={selected.txn_id} mono />
            <KvBlock k="Auth / MSI"             v={selected.msi} mono />
            <KvBlock k="Connection txn id"      v={selected.connectionTransactionId} mono />
            <KvBlock k="Installation"           v={selected.installation_no} />
            <KvBlock k="Tenant"                 v={selected.tenant} />
            <a
              href="https://uppcl.sem.jio.com/uppclsmart/"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary-container px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-primary-fixed transition hover:brightness-110"
            >
              Download receipt on UPPCL <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        )}
      </SidePanel>
    </div>
  );
}

/* ── sub-components ─────────────────────────────────────────────────── */

function SliderRow({ label, display, min, max, step, value, onChange, ticks }: {
  label: string; display: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; ticks: string[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">{label}</span>
        <span className="font-mono text-[14px] text-primary-fixed-dim">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="mt-3 w-full accent-primary-fixed-dim"
      />
      <div className="mt-1 flex justify-between font-mono text-[9px] text-on-surface-variant/60">
        {ticks.map((t, i) => <span key={i}>{t}</span>)}
      </div>
    </div>
  );
}

function AlertCard({ kind, title, body, cta, onCta, icon }: {
  kind: "ok" | "warn" | "info" | "muted"; title: string; body: React.ReactNode; cta?: string; onCta?: () => void; icon?: React.ReactNode;
}) {
  const tone = {
    ok:    { bg: "bg-surface-container-low",     accent: "text-primary-fixed-dim" },
    warn:  { bg: "bg-[rgba(255,185,81,0.10)]",   accent: "text-secondary" },
    info:  { bg: "bg-surface-container-low",     accent: "text-on-surface" },
    muted: { bg: "bg-surface-container-low",     accent: "text-on-surface-variant" },
  }[kind];
  const ico = icon ?? (kind === "warn" ? <AlertTriangle className="h-4 w-4" /> : <Calendar className="h-4 w-4" />);
  return (
    <div className={"rounded-xl p-4 " + tone.bg}>
      <div className="flex items-start gap-3">
        <div className={tone.accent}>{ico}</div>
        <div className="flex-1">
          <div className="text-[12px] font-semibold text-on-surface">{title}</div>
          <div className="mt-1 text-[11px] text-on-surface-variant">{body}</div>
          {cta && (
            <button
              onClick={onCta}
              className={
                "mt-3 rounded-md px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] " +
                (kind === "warn"
                  ? "bg-secondary-container text-on-secondary-fixed"
                  : "bg-surface-container-high text-on-surface-variant")
              }
            >
              {cta}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="sticky top-0 border-b border-white/5 px-3 py-2 text-left font-normal">{children}</th>;
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="font-mono text-[24px] font-light text-on-surface">{v}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">{k}</div>
    </div>
  );
}

function KvBlock({ k, v, big, mono }: { k: string; v: React.ReactNode; big?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2 last:border-0">
      <span className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">{k}</span>
      <span className={mono ? "font-mono text-on-surface" : big ? "font-mono text-[20px] text-on-surface" : "text-on-surface"}>{v || "—"}</span>
    </div>
  );
}
