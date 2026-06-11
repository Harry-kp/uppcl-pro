"use client";

import { useMemo, useState } from "react";
import {
  useDashboard,
  useYearlyHistory,
  useUsageStats,
  useInvoices,
  useApplianceData,
  useSavingTip,
} from "@/lib/api";
import { RadialGauge, type GaugeAccent } from "@/components/viz/RadialGauge";
import { CarbonCounter } from "@/components/viz/CarbonCounter";
import { SlabBar, UP_DOMESTIC_SLABS } from "@/components/viz/SlabBar";
import { Sparkline } from "@/components/viz/Sparkline";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { toNum } from "@/lib/stats";
import { kwh, rupees } from "@/lib/utils";
import { Activity, Gauge, Leaf, Receipt, Info, PlugZap, Lightbulb } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const APPLIANCES = [
  { code: "fridge", label: "Fridge" },
  { code: "geyser", label: "Geyser" },
  { code: "washing_machine", label: "Washing m/c" },
  { code: "nightbaseload", label: "Night load" },
  { code: "others", label: "Others" },
] as const;
const APPLIANCE_KEYS = ["ac", "fridge", "geyser", "washing_machine", "nightbaseload", "others"] as const;

export default function InsightsPage() {
  const { data, error, isLoading } = useDashboard();
  const { data: yearly } = useYearlyHistory();
  const { data: statsResp } = useUsageStats();
  const { data: invoicesResp } = useInvoices(18);
  const { data: applianceResp } = useApplianceData();
  const [tipAppliance, setTipAppliance] = useState<string>("fridge");
  const { data: tipsResp } = useSavingTip(tipAppliance);

  const derived = useMemo(() => {
    if (!data) return null;

    const monthlyRows = [...(yearly?.data ?? [])]
      .map((r) => ({
        t: r.energyImportKWH?.measureTime ?? "",
        kwhVal: toNum(r.energyImportKWH?.value),
        pf: toNum(r.powerFactor?.value),
        powerKw: toNum(r.power?.value),
      }))
      .filter((m) => m.t)
      .sort((a, b) => a.t.localeCompare(b.t));

    const monthLabels = monthlyRows.map((m) => MONTHS[new Date(m.t).getMonth()]);
    const monthlyKwh = monthlyRows.map((m) => m.kwhVal);
    const monthlyCarbon = monthlyKwh.map((k) => k * 0.71);

    // Power factor
    const pfRows = monthlyRows.filter((m) => m.pf > 0 && m.pf <= 1.5);
    const pf = pfRows.at(-1)?.pf ?? null;
    const pfAccent: GaugeAccent = pf === null ? "default" : pf >= 0.95 ? "good" : pf >= 0.9 ? "default" : "warn";
    const pfAdvice =
      pf === null ? "No power-factor history yet."
      : pf >= 0.95 ? "Excellent — no surcharge, and you may qualify for a PF incentive."
      : pf >= 0.9 ? "Healthy. Stay above 0.90 to avoid a power-factor surcharge."
      : "Below 0.90 — UPPCL levies a PF surcharge. Check for lightly-loaded motors or idle inductive loads.";

    // Peak demand vs sanctioned load
    const sanctioned = toNum(data.site.sanctionedLoad);
    const peakKw = toNum(statsResp?.data?.maximumPower) || Math.max(0, ...monthlyRows.map((m) => m.powerKw));
    const demandPct = sanctioned > 0 && peakKw > 0 ? Math.round((peakKw / sanctioned) * 100) : null;
    const demandAccent: GaugeAccent =
      demandPct === null ? "default" : demandPct >= 100 ? "critical" : demandPct >= 85 ? "warn" : "default";
    const demandAdvice =
      demandPct === null ? "No demand data yet."
      : demandPct >= 100 ? "Exceeding sanctioned load — overload trips and penalties likely. Apply for load enhancement."
      : demandPct >= 85 ? "Near your sanctioned load. Frequent peaks risk MD penalties; consider load enhancement."
      : demandPct >= 70 ? "Approaching sanctioned load — avoid running heavy appliances simultaneously."
      : "Comfortable headroom under your sanctioned load.";

    // This month's units (latest monthly rollup) + effective rate
    const thisMonthKwh = monthlyKwh.at(-1) ?? data.consumption_30d.kwh;
    const avgDailyKwh = data.consumption_30d.avg_daily_kwh;

    const isPostpaid = data.site.connectionType === "postpaid";
    const invoices = invoicesResp?.data ?? [];
    const lastInvoice = invoices.find((b) => Math.abs(toNum(b.bill_amt)) > 0);
    let effectiveRate = data.consumption_30d.effective_rate || 0;
    if (isPostpaid && lastInvoice) {
      const billMonth = new Date(lastInvoice.bill_dt).getMonth();
      const m = monthlyRows.find((r) => new Date(r.t).getMonth() === billMonth);
      const billKwh = toNum(m?.kwhVal);
      if (billKwh > 0) effectiveRate = Math.abs(toNum(lastInvoice.bill_amt)) / billKwh;
    }
    if (!effectiveRate || !Number.isFinite(effectiveRate)) effectiveRate = 6.5;

    const projectedKwh = avgDailyKwh * 30;
    const projectedBill = projectedKwh * effectiveRate;

    return {
      monthLabels, monthlyKwh, monthlyCarbon, pf, pfAccent, pfAdvice,
      sanctioned, peakKw, demandPct, demandAccent, demandAdvice,
      thisMonthKwh, avgDailyKwh, effectiveRate, projectedKwh, projectedBill, isPostpaid,
    };
  }, [data, yearly, statsResp, invoicesResp]);

  if (error) return <ErrorView message={(error as Error).message} />;
  if (isLoading || !data || !derived) return <Skeleton />;

  const {
    monthLabels, monthlyCarbon, pf, pfAccent, pfAdvice,
    sanctioned, peakKw, demandPct, demandAccent, demandAdvice,
    thisMonthKwh, avgDailyKwh, effectiveRate, projectedKwh, projectedBill,
  } = derived;

  // Appliance disaggregation (empty until UPPCL's model has data for this meter).
  const applianceRows = applianceResp?.data ?? [];
  const applianceTotals = APPLIANCE_KEYS
    .map((k) => ({ key: k, value: applianceRows.reduce((s, row) => s + toNum((row as Record<string, unknown>)[k]), 0) }))
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value);
  const applianceTotal = applianceTotals.reduce((s, a) => s + a.value, 0);
  const tips = (tipsResp?.data ?? []).filter((t) => t.tipEnglish).slice(0, 3);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <div className="px-1">
        <h1 className="text-[15px] text-on-surface">Insights</h1>
        <p className="mt-0.5 text-[12px] text-on-surface-variant">
          Power quality, tariff intelligence and carbon — the things your bill doesn&apos;t tell you.
        </p>
      </div>

      {/* POWER QUALITY */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          <Gauge className="h-3 w-3" /> Power quality
        </div>
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Power factor */}
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <RadialGauge
              value={pf ?? 0}
              max={1}
              accent={pfAccent}
              centerValue={pf !== null ? pf.toFixed(2) : "—"}
              centerLabel="Power Factor"
              size={172}
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">
                <Activity className="h-3 w-3" /> Power factor
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-on-surface">{pfAdvice}</p>
            </div>
          </div>
          {/* Peak demand */}
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <RadialGauge
              value={peakKw}
              max={sanctioned || 1}
              accent={demandAccent}
              centerValue={peakKw > 0 ? kwh(peakKw, 1) : "—"}
              centerLabel="Peak kW"
              sub={demandPct !== null ? `${demandPct}% of ${sanctioned} kW` : undefined}
              size={172}
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">
                <Gauge className="h-3 w-3" /> Peak demand vs sanctioned load
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-on-surface">{demandAdvice}</p>
            </div>
          </div>
        </div>
      </section>

      {/* TARIFF & NEXT BILL */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          <Receipt className="h-3 w-3" /> Tariff &amp; next bill
        </div>
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
          <div className="flex flex-col justify-center">
            <div className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">Your effective rate</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-[18px] text-primary-fixed-dim">₹</span>
              <Tooltip
                content={
                  <div className="space-y-1">
                    <div className="text-on-surface-variant">Derived from your own bills:</div>
                    <div className="font-mono text-on-surface">last bill ₹ ÷ that month&apos;s kWh</div>
                  </div>
                }
              >
                <span className="cursor-help font-mono text-[44px] font-light leading-none tracking-tight text-on-surface animate-count-up">
                  {rupees(effectiveRate, { decimals: 2 })}
                </span>
              </Tooltip>
              <span className="text-[13px] text-on-surface-variant">/kWh</span>
            </div>
            <div className="mt-4 rounded-lg bg-surface-container p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">Projected next bill</div>
              <div className="mt-1 font-mono text-[20px] text-on-surface">~₹{rupees(projectedBill, { decimals: 0 })}</div>
              <div className="mt-1 text-[11px] text-on-surface-variant">
                {kwh(avgDailyKwh)} kWh/day × 30 × ₹{rupees(effectiveRate, { decimals: 2 })} = {kwh(projectedKwh, 0)} kWh
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">
              <span>Tariff slab position</span>
              <span className="font-mono">{kwh(thisMonthKwh, 0)} units this month</span>
            </div>
            <SlabBar units={thisMonthKwh} slabs={UP_DOMESTIC_SLABS} />
            <div className="flex items-start gap-1.5 text-[10px] text-on-surface-variant/70">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Slab rates are indicative UP domestic (LMV-1) figures; your effective ₹/kWh above is the
              authoritative number, derived from your actual bills.
            </div>
          </div>
        </div>
      </section>

      {/* CARBON */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          <Leaf className="h-3 w-3" /> Carbon footprint
        </div>
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
          <CarbonCounter periodKwh={thisMonthKwh} periodLabel="this month" />
          <div>
            <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">
              <span>Monthly CO₂ trend</span>
              <span className="font-mono text-primary-fixed-dim">kg</span>
            </div>
            {monthlyCarbon.length >= 2 ? (
              <Sparkline values={monthlyCarbon} labels={monthLabels} height={72} unit="kg" />
            ) : (
              <div className="flex h-[72px] items-center justify-center text-[12px] text-on-surface-variant">
                Need at least 2 months of data.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* WHERE YOUR POWER GOES (appliance disaggregation) */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          <PlugZap className="h-3 w-3" /> Where your power goes
        </div>
        {applianceTotal > 0 ? (
          <div className="mt-5 flex flex-col gap-3">
            {applianceTotals.map((a) => {
              const pct = Math.round((a.value / applianceTotal) * 100);
              const label = APPLIANCES.find((x) => x.code === a.key)?.label ?? a.key;
              return (
                <div key={a.key}>
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className="text-on-surface">{label}</span>
                    <span className="font-mono text-on-surface-variant">{kwh(a.value, 0)} kWh · {pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
                    <div className="h-full rounded-full bg-primary-container" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-surface-container p-4">
            <span className="h-1.5 w-1.5 shrink-0 translate-y-2 rounded-full bg-primary-fixed-dim glow-primary" />
            <p className="text-[13px] leading-relaxed text-on-surface-variant">
              <span className="text-on-surface">Learning your usage.</span> UPPCL&apos;s appliance model needs a few
              more weeks of metered data before it can split your consumption by appliance. This panel lights up
              automatically once it&apos;s ready.
            </p>
          </div>
        )}
      </section>

      {/* SAVING TIPS */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          <Lightbulb className="h-3 w-3" /> Saving tips
        </div>
        {pf !== null && pf < 0.9 && (
          <p className="mt-3 text-[12px] text-secondary">
            Your power factor is low — lightly-loaded motors and idle inductive appliances are common causes.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {APPLIANCES.map((a) => (
            <button
              key={a.code}
              onClick={() => setTipAppliance(a.code)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-medium transition",
                tipAppliance === a.code
                  ? "bg-primary-container text-on-primary-fixed"
                  : "bg-surface-container-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {tips.length > 0 ? (
            tips.map((t) => (
              <div key={t._id} className="flex items-start gap-2.5 rounded-lg bg-surface-container p-3">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary" />
                <p className="text-[13px] leading-relaxed text-on-surface">{t.tipEnglish}</p>
              </div>
            ))
          ) : (
            <div className="text-[12px] text-on-surface-variant">No tips available right now.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl bg-surface-container-low p-6">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="skeleton h-40 rounded-lg" />
            <div className="skeleton h-40 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-20 max-w-md rounded-xl bg-surface-container-low p-8 text-center">
      <div className="font-mono text-[20px] text-secondary">Insights unavailable</div>
      <p className="mt-3 text-[13px] text-on-surface-variant">{message}</p>
    </div>
  );
}
