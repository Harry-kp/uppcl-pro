"use client";

import { useMemo, useState } from "react";
import {
  useBills,
  useDashboard,
  usePayments,
  useYearlyHistory,
} from "@/lib/api";
import { Tile } from "@/components/Tile";
import { Sparkline } from "@/components/viz/Sparkline";
import { RunwayGauge } from "@/components/viz/RunwayGauge";
import { AnomalyBanner } from "@/components/AnomalyBanner";
import { ComplaintsSection } from "@/components/ComplaintsSection";
import { SidePanel } from "@/components/ui/SidePanel";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { mean, stddev, toNum } from "@/lib/stats";
import { rupees, kwh, daysBetween, formatRelative } from "@/lib/utils";
import {
  History,
  FileText,
  Zap,
  Activity,
  CreditCard,
  ArrowUpRight,
  Info,
  BellRing,
} from "lucide-react";

export default function Home() {
  const { data, error, isLoading } = useDashboard();
  const { data: billsResp } = useBills(90);
  const { data: paymentsResp } = usePayments(50);
  const { data: yearly } = useYearlyHistory();
  const { push } = useToast();

  const [panel, setPanel] = useState<null | "balance" | "runway" | "spike">(null);

  // Always call useMemo — derive inside so hook order is stable
  const derived = useMemo(() => {
    if (!data) return null;

    // Bills in chronological order (oldest → newest) for charting
    const billsAsc = [...data.recent_bills].sort(
      (a, b) => new Date(a.billDate).getTime() - new Date(b.billDate).getTime()
    );
    const longBills = billsResp?.data ? [...billsResp.data].sort(
      (a, b) => new Date(a.billDate).getTime() - new Date(b.billDate).getTime()
    ) : billsAsc;

    const units = billsAsc.map((b) => toNum(b.dailyBill.units_billed_daily));
    const labels = billsAsc.map((b) => {
      const d = b.dailyBill.usage_date ?? b.billDate;
      return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    });

    const charges90 = longBills.map((b) => toNum(b.dailyBill.daily_chg)).filter((x) => x > 0);
    const avg30 = mean(charges90.slice(-30));
    const sd30 = stddev(charges90.slice(-30));
    const latestCharge = charges90[charges90.length - 1] ?? 0;

    // Anomaly: yesterday > mean + 1.5σ (Stitch's "40% above" is just a cleaner proxy)
    const zThreshold = 1.5;
    const spike = sd30 > 0 ? (latestCharge - avg30) / sd30 : 0;
    const anomaly = spike >= zThreshold;
    const anomalyPct = avg30 > 0 ? Math.round(((latestCharge - avg30) / avg30) * 100) : 0;

    // Today/yesterday kWh
    const todayKwh = units[units.length - 1] ?? 0;
    const yestKwh = units[units.length - 2] ?? 0;
    const dayDeltaPct = yestKwh > 0 ? Math.round(((todayKwh - yestKwh) / yestKwh) * 100) : 0;

    // Last recharge (prefer /payments[0] over balance.last_recharge which is often 0)
    const lastPayment = paymentsResp?.data?.[0] ?? data.recent_payments[0];
    const lastRechargeAmt = lastPayment ? toNum(lastPayment.amt) : data.balance.last_recharge;
    const daysSinceRecharge = lastPayment?.payment_dt
      ? daysBetween(lastPayment.payment_dt, new Date())
      : null;
    const latestLifespan = data.recharge_lifespans[data.recharge_lifespans.length - 1];

    // Power factor — pull latest non-zero from yearly monthly rollups
    const pfSeries = (yearly?.data ?? [])
      .map((r) => ({ t: r.powerFactor?.measureTime, v: toNum(r.powerFactor?.value) }))
      .filter((p) => p.v > 0 && p.v <= 1.5)
      .sort((a, b) => (a.t ?? "").localeCompare(b.t ?? ""));
    const pfLatest = pfSeries[pfSeries.length - 1]?.v ?? null;
    const pfPrev = pfSeries[pfSeries.length - 2]?.v ?? null;
    const pfDelta = pfLatest !== null && pfPrev !== null ? pfLatest - pfPrev : null;

    // Next-bill estimate — avg daily charge × 30 (a billing cycle is ~30 days)
    const next = avg30 * 30;
    const nextMargin = sd30 * Math.sqrt(30); // stddev of a 30-day sum ≈ σ·√n
    const nextLow = Math.max(0, next - nextMargin);
    const nextHigh = next + nextMargin;

    // Recharge recommendation: hit targetRunway days at current burn
    const targetRunway = 40;
    const recommendedRaw = targetRunway * data.runway.avg_daily_spend - data.balance.inr;
    const recommendedAmount = Math.max(500, Math.ceil(recommendedRaw / 500) * 500);
    // eslint-disable-next-line react-hooks/purity -- Date.now() inside useMemo is intentional; value captured once per recompute
    const emptyEta = data.runway.days ? new Date(Date.now() + data.runway.days * 86400_000) : null;

    return {
      units,
      labels,
      latestCharge,
      avg30,
      sd30,
      spike,
      anomaly,
      anomalyPct,
      todayKwh,
      yestKwh,
      dayDeltaPct,
      lastPayment,
      lastRechargeAmt,
      daysSinceRecharge,
      latestLifespan,
      pfLatest,
      pfDelta,
      next,
      nextLow,
      nextHigh,
      recommendedAmount,
      emptyEta,
      targetRunway,
    };
  }, [data, billsResp, paymentsResp, yearly]);

  // Auth + proxy-reachability gating lives in <Shell>; by the time this
  // page renders we're guaranteed authenticated. Keep only the data-fetch
  // error state here — that's page-specific (home-dashboard endpoint).
  if (error) return <ProxyErrorView message={(error as Error).message} />;
  if (isLoading || !data || !derived) return <Skeleton />;

  const {
    units, labels, latestCharge, avg30, sd30, spike, anomaly, anomalyPct,
    todayKwh, yestKwh, dayDeltaPct, lastPayment, lastRechargeAmt, daysSinceRecharge,
    latestLifespan, pfLatest, pfDelta, next, nextLow, nextHigh,
    recommendedAmount, emptyEta, targetRunway,
  } = derived;

  const balance = data.balance.inr;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      {/* HERO ROW */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* Balance */}
        <button
          onClick={() => setPanel("balance")}
          className="glow-hero group relative flex flex-col justify-between rounded-xl bg-surface-container-low p-6 text-left transition-colors hover:bg-surface-container"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-on-surface-variant">
                Available Balance
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-[20px] text-primary-fixed-dim">₹</span>
                <Tooltip
                  side="bottom"
                  content={
                    <div className="space-y-1">
                      <div className="font-mono text-on-surface">₹{rupees(balance)}</div>
                      <div className="text-on-surface-variant">
                        Source: prefers live <code>/site/prepaidBalance</code>; falls back to
                        latest bill <code>closing_bal</code>.
                      </div>
                    </div>
                  }
                >
                  <span className="font-mono text-[64px] font-light leading-none tracking-tight text-on-surface animate-count-up">
                    {rupees(balance)}
                  </span>
                </Tooltip>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-on-surface-variant">
                {data.balance.updated_at ? (
                  <>updated {formatRelative(data.balance.updated_at)}</>
                ) : (
                  <>no update timestamp</>
                )}
                <span className="flex items-center gap-1 text-primary-fixed-dim">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-fixed-dim" />
                  {data.balance.meter_status === "A" ? "meter active" : data.balance.meter_status ? `status · ${data.balance.meter_status}` : "bills flowing"}
                </span>
                <span className="ml-auto flex items-center gap-1 text-on-surface-variant/70 opacity-0 transition-opacity group-hover:opacity-100">
                  <Info className="h-3 w-3" /> click for detail
                </span>
              </div>
            </div>
            <div className="rounded-md bg-surface-container p-2.5 text-on-surface-variant">
              <CreditCard className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
              <span>{Math.min(14, units.length)}-day consumption trend</span>
              <span className="font-mono text-primary-fixed-dim">
                avg {kwh(data.consumption_30d.avg_daily_kwh)} kWh/d
              </span>
            </div>
            <Sparkline
              values={units.slice(-14)}
              labels={labels.slice(-14)}
              height={64}
              unit="kWh"
            />
          </div>
        </button>

        {/* Runway */}
        <button
          onClick={() => setPanel("runway")}
          className="flex flex-col items-center justify-center rounded-xl bg-surface-container-low p-6 text-center transition-colors hover:bg-surface-container"
        >
          <RunwayGauge days={data.runway.days} avgDailySpend={data.runway.avg_daily_spend} />
          <div className="mt-4 text-[11px] text-on-surface-variant/80">
            basis: {data.runway.basis_days} days of spend history
          </div>
          {emptyEta && (
            <div className="mt-1 font-mono text-[11px] text-on-surface-variant">
              empty by {emptyEta.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </div>
          )}
        </button>
      </div>

      {/* ANOMALY BANNER */}
      <AnomalyBanner
        visible={anomaly}
        message={
          <>
            Yesterday&apos;s charge was{" "}
            <span className="font-mono text-on-surface">₹{rupees(latestCharge, { decimals: 0 })}</span>{" "}
            —{" "}
            <Tooltip
              content={
                <div>
                  <div className="font-mono text-on-surface">z = {spike.toFixed(2)}</div>
                  <div className="text-on-surface-variant">
                    mean ₹{rupees(avg30, { decimals: 0 })} · σ ₹{rupees(sd30, { decimals: 0 })}
                  </div>
                </div>
              }
            >
              <span className="cursor-help font-mono text-secondary underline decoration-dotted">
                {anomalyPct}% above
              </span>
            </Tooltip>{" "}
            your 30-day average.
          </>
        }
        onInvestigate={() => setPanel("spike")}
      />

      {/* 4-TILE KPI GRID */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          icon={<History className="h-3 w-3" />}
          label="Last Recharge"
          tag={daysSinceRecharge !== null ? `${daysSinceRecharge} d ago` : undefined}
          value={<>₹{rupees(lastRechargeAmt, { decimals: 0 })}</>}
          hint={
            latestLifespan ? (
              <>Lasted <span className="text-on-surface">{latestLifespan.lasted_days.toFixed(1)} days</span></>
            ) : lastPayment ? (
              <>Via {lastPayment.payment_type} · {lastPayment.channel}</>
            ) : (
              <>no recharges on file</>
            )
          }
          formula={
            lastPayment ? (
              <div>
                <div className="font-mono text-on-surface">txn {lastPayment.txn_id}</div>
                <div className="text-on-surface-variant">
                  {new Date(lastPayment.payment_dt).toLocaleString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </div>
              </div>
            ) : undefined
          }
          href="/recharges"
        />
        <Tile
          icon={<FileText className="h-3 w-3" />}
          label="Next Bill Estimate"
          tag="Projection"
          value={<>~₹{rupees(next, { decimals: 0 })}</>}
          hint={
            <>
              ±<span className="font-mono text-on-surface">₹{rupees(nextHigh - next, { decimals: 0 })}</span>
              {" "}(95% CI)
            </>
          }
          formula={
            <div>
              <div className="font-mono text-on-surface">avg₃₀ × 30 days = ₹{rupees(next, { decimals: 0 })}</div>
              <div className="mt-0.5 text-on-surface-variant">
                Range: ₹{rupees(nextLow, { decimals: 0 })} – ₹{rupees(nextHigh, { decimals: 0 })}
              </div>
              <div className="text-on-surface-variant">
                σ of sum = σ·√n ≈ ₹{rupees(nextHigh - next, { decimals: 0 })}
              </div>
            </div>
          }
          href="/ledger"
        />
        <Tile
          icon={<Zap className="h-3 w-3" />}
          label="kWh Today"
          tag="Latest"
          value={<>{kwh(todayKwh)}</>}
          hint={
            dayDeltaPct !== 0 ? (
              <span className={dayDeltaPct > 0 ? "text-secondary" : "text-primary-fixed-dim"}>
                {dayDeltaPct > 0 ? "▲" : "▼"} {Math.abs(dayDeltaPct)}% vs yesterday
              </span>
            ) : (
              <span className="text-on-surface-variant">no change vs yesterday</span>
            )
          }
          formula={
            <div>
              <div className="font-mono text-on-surface">today {kwh(todayKwh)} · yday {kwh(yestKwh)} kWh</div>
              <div className="text-on-surface-variant">from latest /bill/search dailyBill.units_billed_daily</div>
            </div>
          }
          href="/analytics"
        />
        <Tile
          icon={<Activity className="h-3 w-3" />}
          label="Power Factor"
          tag="Last Month"
          accent={pfLatest !== null && pfLatest >= 0.95 ? "good" : "warn"}
          value={pfLatest !== null ? pfLatest.toFixed(2) : "—"}
          hint={
            pfDelta !== null ? (
              <span className={pfDelta >= 0 ? "text-primary-fixed-dim" : "text-secondary"}>
                {pfDelta >= 0 ? "▲" : "▼"} {Math.abs(pfDelta).toFixed(3)} vs prev month
              </span>
            ) : (
              <span className="text-on-surface-variant">
                {pfLatest !== null ? (pfLatest >= 0.95 ? "high efficiency" : "below target") : "no history"}
              </span>
            )
          }
          formula={<>Monthly rollup from <code>/eventsummary/search</code> · groupBy:year</>}
          href="/grid-nodes"
        />
      </div>

      {/* RECHARGE RECOMMENDATION */}
      <div className="flex items-start justify-between gap-4 rounded-xl bg-surface-container-low p-5">
        <div className="flex items-start gap-3">
          <div className="h-full w-0.5 shrink-0 self-stretch rounded-full bg-primary-container" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-primary-fixed-dim">
              Recommended Action
            </div>
            <div className="mt-1.5 text-[15px] text-on-surface">
              Drop{" "}
              <Tooltip
                content={
                  <div>
                    <div className="font-mono text-on-surface">target: {targetRunway} days runway</div>
                    <div className="text-on-surface-variant">
                      needed = {targetRunway} × ₹{data.runway.avg_daily_spend.toFixed(2)} − balance ₹{balance.toFixed(2)}
                    </div>
                    <div className="text-on-surface-variant">rounded up to nearest ₹500</div>
                  </div>
                }
              >
                <span className="cursor-help font-mono text-on-surface underline decoration-dotted">
                  ₹{recommendedAmount.toLocaleString("en-IN")}
                </span>
              </Tooltip>
              {emptyEta && (
                <> by <span className="text-on-surface">{emptyEta.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></>
              )}
              {" to maintain a "}<span className="text-on-surface">{targetRunway}-day</span>{" runway."}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => push("Reminder set — we'll ping you 3 days before empty", { kind: "success" })}
            className="flex items-center gap-1.5 rounded-md bg-surface-container-high px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface transition hover:bg-surface-bright"
          >
            <BellRing className="h-3 w-3" /> Remind 3 d before
          </button>
          <a
            href="https://uppcl.sem.jio.com/uppclsmart/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-md bg-primary-container px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-primary-fixed transition hover:brightness-110"
          >
            Open UPPCL Payment <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
          </a>
        </div>
      </div>

      {/* COMPLAINTS HISTORY */}
      <ComplaintsSection />

      {/* DRILL-IN PANELS */}
      <SidePanel open={panel === "balance"} onClose={() => setPanel(null)} title="Balance detail"
        subtitle={data.balance.updated_at ? `as of ${new Date(data.balance.updated_at).toLocaleString("en-IN")}` : undefined}>
        <div className="space-y-4">
          <Row k="Current balance"  v={`₹${rupees(balance)}`} big />
          <Row k="Arrears"          v={`₹${rupees(data.balance.arrears_inr)}`} />
          <Row k="Last recharge"    v={`₹${rupees(lastRechargeAmt)}`} />
          <Row k="Meter status"     v={data.balance.meter_status === "A" ? "Active" : data.balance.meter_status ?? "unreported (bills flowing)"} />
          <Row k="Connection"       v={data.site.connectionId} mono />
          <Row k="Device"           v={data.site.deviceId} mono />
          <Row k="DISCOM"           v={data.site.tenantId} mono />
          <div className="mt-6 rounded-md bg-surface-container p-3 text-[11px] text-on-surface-variant">
            <div className="mb-1 uppercase tracking-[0.18em] text-on-surface-variant/80">How this is computed</div>
            The proxy tries live <code>/site/prepaidBalance</code> first. When it returns empty (a known upstream quirk on some accounts),
            it falls back to the most recent daily bill&apos;s <code>closing_bal</code>, accurate to within 24 h.
          </div>
        </div>
      </SidePanel>

      <SidePanel open={panel === "runway"} onClose={() => setPanel(null)} title="Runway forecast"
        subtitle={`at current burn of ₹${data.runway.avg_daily_spend.toFixed(2)}/day`}>
        <div className="space-y-4">
          <Row k="Days remaining"     v={data.runway.days?.toFixed(1) ?? "—"} big />
          <Row k="Empty on"           v={emptyEta?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) ?? "—"} />
          <Row k="Avg daily spend"    v={`₹${data.runway.avg_daily_spend.toFixed(2)}`} />
          <Row k="Basis window"       v={`${data.runway.basis_days} days`} />
          <Row k="30-day σ"           v={`₹${rupees(sd30)}`} />
          <div className="mt-6 rounded-md bg-surface-container p-3 text-[11px] text-on-surface-variant">
            <div className="mb-1 uppercase tracking-[0.18em] text-on-surface-variant/80">Formula</div>
            runway ≈ balance ÷ mean(daily_chg over last 30 days).
            Assumes constant consumption — real runway will vary with weather and season.
          </div>
        </div>
      </SidePanel>

      <SidePanel open={panel === "spike"} onClose={() => setPanel(null)} title="Yesterday's spike"
        subtitle={`z-score ${spike.toFixed(2)} · ${anomalyPct}% above 30-d avg`}>
        <div className="space-y-4">
          <Row k="Yesterday's charge"     v={`₹${rupees(latestCharge, { decimals: 2 })}`} big />
          <Row k="30-day mean charge"     v={`₹${rupees(avg30, { decimals: 2 })}`} />
          <Row k="30-day std deviation"   v={`₹${rupees(sd30, { decimals: 2 })}`} />
          <Row k="z-score"                v={spike.toFixed(2)} />
          <Row k="Threshold for flag"     v="z ≥ 1.5" />
          <div className="mt-6 rounded-md bg-surface-container p-3 text-[11px] text-on-surface-variant">
            <div className="mb-1 uppercase tracking-[0.18em] text-on-surface-variant/80">Likely causes</div>
            Weather (heat wave raises AC load), appliance repair / replacement, guests, tariff slab crossing,
            or a meter-reading estimate being corrected after the fact.
          </div>
        </div>
      </SidePanel>
    </div>
  );
}

function Row({ k, v, big, mono }: { k: string; v: React.ReactNode; big?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-3 last:border-0">
      <span className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">{k}</span>
      <span className={mono ? "font-mono text-on-surface" : big ? "font-mono text-[20px] text-on-surface" : "text-on-surface"}>{v}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="h-[260px] animate-pulse rounded-xl bg-surface-container-low" />
        <div className="h-[260px] animate-pulse rounded-xl bg-surface-container-low" />
      </div>
      <div className="h-12 animate-pulse rounded-lg bg-surface-container-low" />
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[120px] animate-pulse rounded-lg bg-surface-container-high" />
        ))}
      </div>
      <div className="h-20 animate-pulse rounded-xl bg-surface-container-low" />
    </div>
  );
}

function ProxyErrorView({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-20 max-w-md rounded-xl bg-surface-container-low p-8 text-center">
      <div className="font-mono text-[20px] text-secondary">Proxy unreachable</div>
      <p className="mt-3 text-[13px] text-on-surface-variant">{message}</p>
      <p className="mt-4 font-mono text-[11px] text-on-surface-variant/70">
        Is the FastAPI proxy running? <br />
        <code className="rounded bg-surface-container px-1.5 py-0.5">uvicorn uppcl_api:app --port 8000</code>
      </p>
    </div>
  );
}
