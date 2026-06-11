"use client";

import { useMemo, useState } from "react";
import {
  useBills,
  useDashboard,
  usePayments,
  useYearlyHistory,
  useOutstanding,
  useLatestInvoice,
  useUsageStats,
  useWssConsumer,
  useWssArrears,
  downloadBillPdf,
  type DashboardResponse,
  type MonthlyInvoice,
} from "@/lib/api";
import { Tile } from "@/components/Tile";
import { Sparkline } from "@/components/viz/Sparkline";
import { RunwayGauge } from "@/components/viz/RunwayGauge";
import { BillCycleRing } from "@/components/viz/BillCycleRing";
import { AnomalyBanner } from "@/components/AnomalyBanner";
import { InsightStrip, type Insight } from "@/components/InsightStrip";
import { SidePanel } from "@/components/ui/SidePanel";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { mean, stddev, toNum } from "@/lib/stats";
import { rupees, kwh, daysBetween, formatRelative, billingPeriod } from "@/lib/utils";
import {
  History,
  FileText,
  Zap,
  Activity,
  CreditCard,
  ArrowUpRight,
  Info,
  BellRing,
  Wallet,
  Clock,
  AlertTriangle,
  Check,
  TrendingUp,
  ScrollText,
  Calendar,
  Download,
} from "lucide-react";

// ── Dispatcher ────────────────────────────────────────────────────────────────
// The home dashboard reshapes by meter type. Prepaid keeps the balance + runway
// view; postpaid swaps in amount-due + bill-cycle + projection. See docs/dashboard-vision.md.
export default function Home() {
  const { data, error, isLoading } = useDashboard();

  if (error) return <ProxyErrorView message={(error as Error).message} />;
  if (isLoading || !data) return <Skeleton />;

  return data.site.connectionType === "postpaid" ? (
    <PostpaidHome dashboard={data} />
  ) : (
    <PrepaidHome dashboard={data} />
  );
}

// ── Prepaid home (the original dashboard) ──────────────────────────────────────
function PrepaidHome({ dashboard: data }: { dashboard: DashboardResponse }) {
  const { data: billsResp } = useBills(90);
  const { data: paymentsResp } = usePayments(50);
  const { data: yearly } = useYearlyHistory();
  const { push } = useToast();

  const [panel, setPanel] = useState<null | "balance" | "runway" | "spike">(null);

  const derived = useMemo(() => {
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

    const zThreshold = 1.5;
    const spike = sd30 > 0 ? (latestCharge - avg30) / sd30 : 0;
    const anomaly = spike >= zThreshold;
    const anomalyPct = avg30 > 0 ? Math.round(((latestCharge - avg30) / avg30) * 100) : 0;

    const todayKwh = units[units.length - 1] ?? 0;
    const yestKwh = units[units.length - 2] ?? 0;
    const dayDeltaPct = yestKwh > 0 ? Math.round(((todayKwh - yestKwh) / yestKwh) * 100) : 0;

    const lastPayment = paymentsResp?.data?.[0] ?? data.recent_payments[0];
    const lastRechargeAmt = lastPayment ? toNum(lastPayment.amt) : data.balance.last_recharge;
    const daysSinceRecharge = lastPayment?.payment_dt
      ? daysBetween(lastPayment.payment_dt, new Date())
      : null;
    const latestLifespan = data.recharge_lifespans[data.recharge_lifespans.length - 1];

    const pfSeries = (yearly?.data ?? [])
      .map((r) => ({ t: r.powerFactor?.measureTime, v: toNum(r.powerFactor?.value) }))
      .filter((p) => p.v > 0 && p.v <= 1.5)
      .sort((a, b) => (a.t ?? "").localeCompare(b.t ?? ""));
    const pfLatest = pfSeries[pfSeries.length - 1]?.v ?? null;
    const pfPrev = pfSeries[pfSeries.length - 2]?.v ?? null;
    const pfDelta = pfLatest !== null && pfPrev !== null ? pfLatest - pfPrev : null;

    const next = avg30 * 30;
    const nextMargin = sd30 * Math.sqrt(30);
    const nextLow = Math.max(0, next - nextMargin);
    const nextHigh = next + nextMargin;

    const targetRunway = 40;
    const recommendedRaw = targetRunway * data.runway.avg_daily_spend - data.balance.inr;
    const recommendedAmount = Math.max(500, Math.ceil(recommendedRaw / 500) * 500);
    // eslint-disable-next-line react-hooks/purity -- Date.now() inside useMemo is intentional; value captured once per recompute
    const emptyEta = data.runway.days ? new Date(Date.now() + data.runway.days * 86400_000) : null;

    return {
      units, labels, latestCharge, avg30, sd30, spike, anomaly, anomalyPct,
      todayKwh, yestKwh, dayDeltaPct, lastPayment, lastRechargeAmt, daysSinceRecharge,
      latestLifespan, pfLatest, pfDelta, next, nextLow, nextHigh, recommendedAmount,
      emptyEta, targetRunway,
    };
  }, [data, billsResp, paymentsResp, yearly]);

  const {
    units, labels, latestCharge, avg30, sd30, spike, anomaly, anomalyPct,
    todayKwh, yestKwh, dayDeltaPct, lastPayment, lastRechargeAmt, daysSinceRecharge,
    latestLifespan, pfLatest, pfDelta, next, nextLow, nextHigh,
    recommendedAmount, emptyEta, targetRunway,
  } = derived;

  const balance = data.balance.inr;
  const runwayDays = data.runway.days;

  const insights: Insight[] = [];
  if (anomaly) {
    insights.push({
      id: "spike", tone: "warn", icon: <AlertTriangle className="h-3 w-3" />,
      title: <>Yesterday&apos;s charge was {anomalyPct}% above your 30-day average</>,
      detail: <>₹{rupees(latestCharge, { decimals: 0 })} vs ₹{rupees(avg30, { decimals: 0 })} avg · z {spike.toFixed(2)}</>,
      onClick: () => setPanel("spike"), cta: "Investigate",
    });
  }
  insights.push({
    id: "recharge", tone: runwayDays !== null && runwayDays < 10 ? "critical" : "good",
    icon: <Wallet className="h-3 w-3" />,
    title: <>Recharge ₹{recommendedAmount.toLocaleString("en-IN")}{emptyEta ? <> by {emptyEta.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</> : null}</>,
    detail: <>keeps a {targetRunway}-day runway at ₹{data.runway.avg_daily_spend.toFixed(2)}/day</>,
    href: "https://uppcl.sem.jio.com/uppclsmart/", cta: "Pay",
  });
  if (runwayDays !== null) {
    insights.push({
      id: "runway", tone: runwayDays < 10 ? "warn" : "info", icon: <Clock className="h-3 w-3" />,
      title: <>{runwayDays.toFixed(0)} days of balance left at current usage</>,
      detail: emptyEta ? <>empty by {emptyEta.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</> : undefined,
      onClick: () => setPanel("runway"), cta: "Forecast",
    });
  }

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <InsightStrip insights={insights} />

      {/* HERO ROW */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* Balance */}
        <button
          onClick={() => setPanel("balance")}
          className="glow-hero group relative flex flex-col justify-between rounded-xl bg-surface-container-low p-5 text-left transition-colors hover:bg-surface-container sm:p-6"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-on-surface-variant sm:text-[10px]">
                Available Balance
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-[18px] text-primary-fixed-dim sm:text-[20px]">₹</span>
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
                  <span className="font-mono text-[40px] font-light leading-none tracking-tight text-on-surface animate-count-up sm:text-[64px]">
                    {rupees(balance)}
                  </span>
                </Tooltip>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-on-surface-variant sm:text-[11px]">
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
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.24em] text-on-surface-variant sm:text-[10px]">
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
          className="flex flex-col items-center justify-center rounded-xl bg-surface-container-low p-5 text-center transition-colors hover:bg-surface-container sm:p-6"
        >
          <RunwayGauge days={data.runway.days} avgDailySpend={data.runway.avg_daily_spend} />
          <div className="mt-4 text-[12px] text-on-surface-variant/80 sm:text-[11px]">
            basis: {data.runway.basis_days} days of spend history
          </div>
          {emptyEta && (
            <div className="mt-1 font-mono text-[12px] text-on-surface-variant sm:text-[11px]">
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
          href="/ledger"
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
      <div className="flex flex-col gap-4 rounded-xl bg-surface-container-low p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="h-full w-0.5 shrink-0 self-stretch rounded-full bg-primary-container" />
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-primary-fixed-dim sm:text-[10px]">
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
        <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
          <button
            onClick={() => push("Reminder set — we'll ping you 3 days before empty", { kind: "success" })}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-surface-container-high px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface transition hover:bg-surface-bright sm:w-auto"
          >
            <BellRing className="h-3 w-3" /> Remind 3 d before
          </button>
          <a
            href="https://uppcl.sem.jio.com/uppclsmart/"
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary-container px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-primary-fixed transition hover:brightness-110 sm:w-auto"
          >
            Open UPPCL Payment <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
          </a>
        </div>
      </div>
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
          <div className="mt-6 border-l-2 border-white/10 pl-3 text-[11px] text-on-surface-variant">
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
          <div className="mt-6 border-l-2 border-white/10 pl-3 text-[11px] text-on-surface-variant">
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
          <div className="mt-6 border-l-2 border-white/10 pl-3 text-[11px] text-on-surface-variant">
            <div className="mb-1 uppercase tracking-[0.18em] text-on-surface-variant/80">Likely causes</div>
            Weather (heat wave raises AC load), appliance repair / replacement, guests, tariff slab crossing,
            or a meter-reading estimate being corrected after the fact.
          </div>
        </div>
      </SidePanel>
    </div>
  );
}

// ── Postpaid home (amount due + bill cycle + projection) ───────────────────────
function PostpaidHome({ dashboard: data }: { dashboard: DashboardResponse }) {
  const { data: outstanding } = useOutstanding();
  const { data: invoiceResp } = useLatestInvoice();
  const { data: statsResp } = useUsageStats();
  const { data: yearly } = useYearlyHistory();
  const { data: wssConsumer } = useWssConsumer();
  const { data: wssArrears } = useWssArrears();
  const { push } = useToast();

  const [panel, setPanel] = useState<null | "bill" | "projection">(null);
  const [downloading, setDownloading] = useState(false);

  const inv: MonthlyInvoice | undefined = invoiceResp?.data && (invoiceResp.data as MonthlyInvoice).invoice_id
    ? (invoiceResp.data as MonthlyInvoice)
    : undefined;

  async function downloadBill() {
    if (!inv) return;
    setDownloading(true);
    try {
      await downloadBillPdf({ invoice_id: inv.invoice_id });
      push("Bill PDF downloaded", { kind: "success" });
    } catch (e) {
      push((e as Error).message || "Could not download the bill", { kind: "error" });
    } finally {
      setDownloading(false);
    }
  }

  const derived = useMemo(() => {
    const today = new Date();

    // Daily kWh series from eventsummary (works for postpaid — the "daily quota" stand-in).
    const dailyRows = [...(data.consumption_30d.daily ?? [])].sort(
      (a, b) => (a.energyImportKWH?.measureTime ?? "").localeCompare(b.energyImportKWH?.measureTime ?? "")
    );
    const series = dailyRows.map((r) => toNum(r.energyImportKWH?.value));
    const labels = dailyRows.map((r) =>
      new Date(r.energyImportKWH?.measureTime ?? "").toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    );
    const avgDailyKwh = data.consumption_30d.avg_daily_kwh;

    const outstandingAmt = toNum(outstanding?.data?.outstandingAmount);
    const hasDues = outstandingAmt > 1;

    // Billing cycle from the latest invoice.
    const billDt = inv?.bill_dt ? new Date(inv.bill_dt) : null;
    const dueDt = inv?.due_dt ? new Date(inv.due_dt) : null;
    const daysToDue = dueDt ? daysBetween(today, dueDt) : null;
    const daysSinceBill = billDt ? daysBetween(billDt, today) : null;
    const cycleLen = 30;
    const cycleProgress = daysSinceBill !== null ? Math.min(Math.max(daysSinceBill, 0) / cycleLen, 1) : 0;

    // kWh consumed this cycle (since the last bill date).
    const cycleKwh = billDt
      ? dailyRows
          .filter((r) => new Date(r.energyImportKWH?.measureTime ?? "") >= billDt)
          .reduce((s, r) => s + toNum(r.energyImportKWH?.value), 0)
      : data.consumption_30d.kwh;

    // Effective ₹/kWh: last bill amount ÷ that month's kWh (from yearly monthly rollups).
    const lastBillAmt = Math.abs(toNum(inv?.bill_amt));
    const monthlyRows = yearly?.data ?? [];
    let billMonthKwh = 0;
    if (billDt) {
      const m = monthlyRows.find((r) => {
        const t = r.energyImportKWH?.measureTime;
        return t && new Date(t).getMonth() === billDt.getMonth();
      });
      billMonthKwh = toNum(m?.energyImportKWH?.value);
    }
    const effectiveRate = billMonthKwh > 0 && lastBillAmt > 0
      ? lastBillAmt / billMonthKwh
      : (data.consumption_30d.effective_rate || 7.5);

    const projectedKwh = avgDailyKwh * cycleLen;
    const projectedBill = projectedKwh * effectiveRate;
    const projVsLast = lastBillAmt > 0 ? Math.round(((projectedBill - lastBillAmt) / lastBillAmt) * 100) : 0;

    // Power factor (same monthly source as prepaid).
    const pfSeries = monthlyRows
      .map((r) => ({ t: r.powerFactor?.measureTime, v: toNum(r.powerFactor?.value) }))
      .filter((p) => p.v > 0 && p.v <= 1.5)
      .sort((a, b) => (a.t ?? "").localeCompare(b.t ?? ""));
    const pfLatest = pfSeries[pfSeries.length - 1]?.v ?? null;

    // Peak demand vs sanctioned load.
    const peakKw = toNum(statsResp?.data?.maximumPower);
    const sanctioned = toNum(data.site.sanctionedLoad);
    const demandPct = sanctioned > 0 && peakKw > 0 ? Math.round((peakKw / sanctioned) * 100) : null;

    // Paid = a payment date exists (payment_amt may differ slightly via rounding).
    const billPaid = inv ? Boolean((inv.payment_dt || "").trim()) : false;

    return {
      series, labels, avgDailyKwh, outstandingAmt, hasDues, daysToDue, cycleProgress,
      cycleKwh, effectiveRate, projectedKwh, projectedBill, projVsLast, pfLatest,
      peakKw, sanctioned, demandPct, lastBillAmt, billPaid,
    };
  }, [data, outstanding, inv, statsResp, yearly]);

  const {
    series, labels, avgDailyKwh, outstandingAmt, hasDues, daysToDue, cycleProgress,
    cycleKwh, effectiveRate, projectedBill, projVsLast, pfLatest,
    sanctioned, demandPct, lastBillAmt, billPaid,
  } = derived;

  const PAY_URL = "https://uppcl.sem.jio.com/uppclsmart/";
  const officialArrears = toNum(wssArrears?.data?.amount);
  const addr = wssConsumer?.ConsumerDetails?.currentAddress ?? "";
  const schemeMatch = addr.match(/\$(True|False)[^,]*?[Ee]ligible [Ff]or ([^,]+)/);
  const schemeName = schemeMatch && schemeMatch[1].toLowerCase() === "true" ? schemeMatch[2].trim() : null;
  const dueDate = inv?.due_dt ? new Date(inv.due_dt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;

  // The strip carries ONLY things that need attention or action — not echoes of
  // the hero/ring. When nothing needs action, a single calm "all good" chip.
  const insights: Insight[] = [];
  if (officialArrears > 0) {
    insights.push({ id: "arrears", tone: "critical", icon: <AlertTriangle className="h-3 w-3" />,
      title: <>₹{rupees(officialArrears, { decimals: 0 })} in arrears</>, detail: <>clear to avoid disconnection</>, href: PAY_URL, cta: "Pay" });
  }
  if (hasDues) {
    insights.push({ id: "dues", tone: "critical", icon: <Wallet className="h-3 w-3" />,
      title: <>₹{rupees(outstandingAmt, { decimals: 0 })} outstanding</>, detail: <>pay to avoid disconnection</>, href: PAY_URL, cta: "Pay" });
  }
  if (daysToDue !== null && !billPaid && lastBillAmt > 0) {
    insights.push({ id: "due", tone: daysToDue <= 5 ? "warn" : "info", icon: <Calendar className="h-3 w-3" />,
      title: <>₹{rupees(lastBillAmt, { decimals: 0 })} {daysToDue < 0 ? <>overdue by {Math.abs(daysToDue)} d</> : <>due in {daysToDue} d</>}</>,
      onClick: () => setPanel("bill"), cta: "View bill" });
  }
  if (lastBillAmt > 0 && projVsLast > 15) {
    insights.push({ id: "trending", tone: "warn", icon: <TrendingUp className="h-3 w-3" />,
      title: <>Usage trending {projVsLast}% above last month</>, detail: <>projected ~₹{rupees(projectedBill, { decimals: 0 })} this cycle</>,
      onClick: () => setPanel("projection"), cta: "Breakdown" });
  }
  if (pfLatest !== null && pfLatest < 0.9) {
    insights.push({ id: "pf", tone: "warn", icon: <Activity className="h-3 w-3" />,
      title: <>Power factor {pfLatest.toFixed(2)} — penalty risk</>, href: "/grid-nodes", cta: "Details" });
  }
  if (demandPct !== null && demandPct >= 85) {
    insights.push({ id: "demand", tone: demandPct >= 100 ? "critical" : "warn", icon: <AlertTriangle className="h-3 w-3" />,
      title: <>Peak demand {demandPct}% of your {sanctioned} kW limit</>, href: "/grid-nodes", cta: "Details" });
  }
  if (schemeName) {
    insights.push({ id: "scheme", tone: "good", icon: <Check className="h-3 w-3" />,
      title: <>Eligible for {schemeName}</>, detail: <>a UPPCL bill-relief scheme</>, href: PAY_URL, cta: "Details" });
  }
  if (insights.length === 0) {
    insights.push({ id: "ok", tone: "good", icon: <Check className="h-3 w-3" />,
      title: <>Paid up and on track</>,
      detail: <>next bill ~₹{rupees(projectedBill, { decimals: 0 })}{dueDate ? ` by ${dueDate}` : ""}</> });
  }

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <InsightStrip insights={insights} />

      {/* HERO ROW */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* Amount due */}
        <button
          onClick={() => setPanel("bill")}
          className="glow-hero group relative flex flex-col justify-between rounded-xl bg-surface-container-low p-5 text-left transition-colors hover:bg-surface-container sm:p-6"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-on-surface-variant sm:text-[10px]">
                Amount Due
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className={`font-mono text-[18px] sm:text-[20px] ${hasDues ? "text-secondary" : "text-primary-fixed-dim"}`}>₹</span>
                <span className={`font-mono text-[40px] font-light leading-none tracking-tight animate-count-up sm:text-[64px] ${hasDues ? "text-secondary" : "text-on-surface"}`}>
                  {rupees(outstandingAmt, { decimals: 0 })}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-on-surface-variant sm:text-[11px]">
                <span className={`flex items-center gap-1 ${hasDues ? "text-secondary" : "text-primary-fixed-dim"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${hasDues ? "bg-secondary" : "bg-primary-fixed-dim"}`} />
                  {hasDues ? "payment due" : "paid up"}
                </span>
                {hasDues
                  ? (inv?.due_dt && <>· due {new Date(inv.due_dt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</>)
                  : (inv && lastBillAmt > 0 && <>· last bill ₹{rupees(lastBillAmt, { decimals: 0 })} cleared{inv.payment_dt ? ` ${formatRelative(inv.payment_dt)}` : ""}</>)}
                <span className="ml-auto flex items-center gap-1 text-on-surface-variant/70 opacity-0 transition-opacity group-hover:opacity-100">
                  <Info className="h-3 w-3" /> click for bill
                </span>
              </div>
            </div>
            <div className="rounded-md bg-surface-container p-2.5 text-on-surface-variant">
              <Wallet className="h-4 w-4" strokeWidth={1.5} />
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.24em] text-on-surface-variant sm:text-[10px]">
              <span>{Math.min(14, series.length)}-day usage trend</span>
              <span className="font-mono text-primary-fixed-dim">avg {kwh(avgDailyKwh)} kWh/d</span>
            </div>
            <Sparkline values={series.slice(-14)} labels={labels.slice(-14)} height={64} unit="kWh" />
          </div>
        </button>

        {/* Bill cycle ring */}
        <button
          onClick={() => setPanel("projection")}
          className="flex flex-col items-center justify-center rounded-xl bg-surface-container-low p-5 text-center transition-colors hover:bg-surface-container sm:p-6"
        >
          <BillCycleRing projectedInr={projectedBill} daysToDue={daysToDue} cycleProgress={cycleProgress} />
          <div className="mt-4 text-[12px] text-on-surface-variant/80 sm:text-[11px]">
            {kwh(cycleKwh)} kWh this cycle · ~₹{rupees(effectiveRate, { decimals: 1 })}/kWh
          </div>
        </button>
      </div>

      {/* 4-TILE KPI GRID */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          icon={<ScrollText className="h-3 w-3" />}
          label="Last Bill"
          tag={billPaid ? "Paid" : inv?.bill_dt ? new Date(inv.bill_dt).toLocaleDateString("en-IN", { month: "short" }) : undefined}
          accent={billPaid ? "good" : "default"}
          value={<>₹{rupees(lastBillAmt, { decimals: 0 })}</>}
          hint={
            inv ? (
              billPaid ? <>paid {inv.payment_dt ? formatRelative(inv.payment_dt) : ""}</> : <>due {inv.due_dt ? new Date(inv.due_dt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</>
            ) : <>no bill on file</>
          }
          formula={
            <div>
              <div className="font-mono text-on-surface">Amount payable on your latest monthly invoice</div>
              <div className="mt-0.5 text-on-surface-variant">
                Already net of any carried-forward credit. Covers {inv ? billingPeriod(inv.bill_dt).label : "the previous month"}. Tap to open Bills.
              </div>
            </div>
          }
          href="/ledger"
        />
        <Tile
          icon={<Wallet className="h-3 w-3" />}
          label="This cycle"
          tag="so far"
          value={<>₹{rupees(cycleKwh * effectiveRate, { decimals: 0 })}</>}
          hint={<>{kwh(cycleKwh, 0)} kWh used · ~₹{rupees(avgDailyKwh * effectiveRate, { decimals: 0 })}/day</>}
          formula={<>Running cost since your last bill — metered kWh × your effective ₹/kWh. Energy only (excl. fixed, duty &amp; FPPA). The ring shows the projected full-cycle total.</>}
          href="/ledger"
        />
        <Tile
          icon={<TrendingUp className="h-3 w-3" />}
          label="vs last month"
          tag="projected"
          accent={lastBillAmt > 0 ? (projVsLast > 10 ? "warn" : projVsLast < -5 ? "good" : "default") : "default"}
          value={
            lastBillAmt > 0 ? (
              <span className={projVsLast > 0 ? "text-secondary" : projVsLast < 0 ? "text-primary-fixed-dim" : "text-on-surface"}>
                {projVsLast >= 0 ? "+" : ""}{projVsLast}%
              </span>
            ) : "—"
          }
          hint={lastBillAmt > 0 ? <>on track for ~₹{rupees(projectedBill, { decimals: 0 })}</> : <>no prior bill to compare</>}
          formula={<>This cycle&apos;s projected bill against last month&apos;s. Positive = trending higher; tap for the usage that&apos;s driving it.</>}
          href="/analytics"
        />
        <Tile
          icon={<CreditCard className="h-3 w-3" />}
          label="Effective rate"
          tag="₹/kWh"
          value={<>₹{rupees(effectiveRate, { decimals: 2 })}</>}
          hint={<>your blended tariff</>}
          formula={<>Last bill ÷ that month&apos;s metered kWh — the real per-unit rate that drives every projection here. Tap for the bill breakdown.</>}
          href="/ledger"
        />
      </div>

      {/* CURRENT BILL — with official PDF download (the flagship postpaid feature) */}
      <div className="flex flex-col gap-4 rounded-xl bg-surface-container-low p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`h-full w-0.5 shrink-0 self-stretch rounded-full ${hasDues ? "bg-secondary-container" : "bg-primary-container"}`} />
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-primary-fixed-dim sm:text-[10px]">
              {inv ? "Latest Bill" : "Billing"}
            </div>
            <div className="mt-1.5 text-[15px] text-on-surface">
              {inv ? (
                <>
                  {billingPeriod(inv.bill_dt).label} bill
                  {billPaid ? <> · <span className="text-primary-fixed-dim">paid</span></> : inv.due_dt ? <> · due <span className="text-secondary">{new Date(inv.due_dt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></> : null}
                  {" "}— get the PDF or pay below
                </>
              ) : (
                <>No monthly bill is available yet for this connection.</>
              )}
            </div>
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
          {inv && (
            <button
              onClick={downloadBill}
              disabled={downloading}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-surface-container-high px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface transition hover:bg-surface-bright disabled:opacity-50 sm:w-auto"
            >
              <Download className="h-3 w-3" /> {downloading ? "Downloading…" : "Download bill"}
            </button>
          )}
          <a
            href="https://uppcl.sem.jio.com/uppclsmart/"
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary-container px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-primary-fixed transition hover:brightness-110 sm:w-auto"
          >
            {hasDues ? "Pay Now" : "Open UPPCL"} <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
          </a>
        </div>
      </div>
      {/* DRILL-IN PANELS */}
      <SidePanel open={panel === "bill"} onClose={() => setPanel(null)} title="Bill detail"
        subtitle={inv?.bill_dt ? `generated ${new Date(inv.bill_dt).toLocaleDateString("en-IN")}` : undefined}>
        <div className="space-y-4">
          <Row k="Amount due now"   v={`₹${rupees(outstandingAmt)}`} big />
          {inv && (() => {
            const fmt = (s: string) => s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
            const paidAmt = toNum(inv.payment_amt);
            const rebate = billPaid && paidAmt > 0 ? lastBillAmt - paidAmt : 0;
            const period = billingPeriod(inv.bill_dt);
            return (
              <>
                <Row k="Billing period" v={`${period.label}`} />
                <Row k="Amount payable" v={`₹${rupees(lastBillAmt)}`} />
                <Row k="Bill generated" v={fmt(inv.bill_dt)} />
                <Row k="Due date"       v={fmt(inv.due_dt)} />
                <Row k="Status"         v={billPaid ? "Paid" : "Unpaid"} />
                {billPaid && inv.payment_dt && (
                  <Row k="Paid" v={`₹${rupees(paidAmt, { decimals: 0 })} on ${fmt(inv.payment_dt)}`} />
                )}
                {rebate > 0 && (
                  <Row k="Rebate saved" v={`₹${rupees(rebate, { decimals: 0 })} (paid before due date)`} />
                )}
                <Row k="Invoice no."    v={inv.invoice_id} mono />
              </>
            );
          })()}
          <Row k="Connection"       v={data.site.connectionId} mono />
          <Row k="DISCOM"           v={data.site.tenantId} mono />
          {inv && (
            <button
              onClick={downloadBill}
              disabled={downloading}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary-container px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-primary-fixed transition hover:brightness-110 disabled:opacity-50"
            >
              <Download className="h-3 w-3" /> {downloading ? "Downloading…" : "Download official bill PDF"}
            </button>
          )}
          <div className="mt-6 border-l-2 border-white/10 pl-3 text-[11px] leading-relaxed text-on-surface-variant">
            <div className="mb-1 uppercase tracking-[0.18em] text-on-surface-variant/80">How your bill works</div>
            Your smart meter bills a month in arrears: this bill covers{" "}
            <span className="text-on-surface">{inv ? billingPeriod(inv.bill_dt).label : "the previous month"}</span>,
            even though it was generated on {inv ? new Date(inv.bill_dt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}.
            The <span className="text-on-surface">amount payable</span> is that month&apos;s charges minus any credit
            carried forward (a negative bill means you&apos;re in credit). Paying before the due date keeps a small
            prompt-payment rebate — that&apos;s why the paid amount can be a little under the bill.
          </div>
        </div>
      </SidePanel>

      <SidePanel open={panel === "projection"} onClose={() => setPanel(null)} title="This cycle's projection"
        subtitle={`${Math.round(cycleProgress * 100)}% through the billing cycle`}>
        <div className="space-y-4">
          <Row k="Projected bill"      v={`₹${rupees(projectedBill, { decimals: 0 })}`} big />
          <Row k="kWh this cycle"      v={`${kwh(cycleKwh)} kWh`} />
          <Row k="Avg daily usage"     v={`${kwh(avgDailyKwh)} kWh/day`} />
          <Row k="Effective rate"      v={`₹${rupees(effectiveRate, { decimals: 2 })}/kWh`} />
          <Row k="vs last bill"        v={lastBillAmt > 0 ? `${projVsLast >= 0 ? "+" : ""}${projVsLast}%` : "—"} />
          {daysToDue !== null && <Row k="Days to due date" v={daysToDue < 0 ? `${Math.abs(daysToDue)} overdue` : String(daysToDue)} />}
          <div className="mt-6 border-l-2 border-white/10 pl-3 text-[11px] text-on-surface-variant">
            <div className="mb-1 uppercase tracking-[0.18em] text-on-surface-variant/80">Formula</div>
            projection ≈ avg daily kWh × 30 × effective ₹/kWh, where the rate is the last bill amount
            divided by that month&apos;s metered kWh. A real bill also includes fixed charges, duty and FPPA.
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
        <div className="rounded-xl bg-surface-container-low p-6">
          <div className="skeleton h-3 w-28 rounded" />
          <div className="skeleton mt-4 h-14 w-48 rounded" />
          <div className="skeleton mt-3 h-3 w-36 rounded" />
          <div className="skeleton mt-10 h-3 w-24 rounded" />
          <div className="skeleton mt-3 h-16 w-full rounded" />
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl bg-surface-container-low p-6">
          <div className="skeleton h-32 w-32 rounded-full" />
          <div className="skeleton mt-4 h-3 w-28 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg bg-surface-container-high p-4">
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton mt-3 h-7 w-24 rounded" />
            <div className="skeleton mt-3 h-3 w-32 rounded" />
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-surface-container-low p-5">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="skeleton mt-2 h-5 w-64 rounded" />
      </div>
    </div>
  );
}

function ProxyErrorView({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-20 max-w-md rounded-xl bg-surface-container-low p-8 text-center">
      <div className="font-mono text-[20px] text-secondary">Data unavailable</div>
      <p className="mt-3 text-[13px] text-on-surface-variant">{message}</p>
      <p className="mt-4 font-mono text-[11px] text-on-surface-variant/70">
        This usually means the UPPCL upstream API is temporarily down,
        or your session has expired. Try signing out and back in.
      </p>
    </div>
  );
}
