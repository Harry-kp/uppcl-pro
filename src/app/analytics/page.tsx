"use client";

import { useMemo, useState } from "react";
import {
  useConsumption,
  useYearlyHistory,
  useApplianceData,
  useSavingTip,
} from "@/lib/api";
import { CalendarHeatmap, CalendarCell } from "@/components/viz/CalendarHeatmap";
import { DayOfWeekChart } from "@/components/viz/DayOfWeekChart";
import { BaselineActive } from "@/components/viz/BaselineActive";
import { LineChart } from "@/components/viz/LineChart";
import { Sparkline } from "@/components/viz/Sparkline";
import { CarbonCounter } from "@/components/viz/CarbonCounter";
import { Tooltip } from "@/components/ui/Tooltip";
import { mean, stddev, toNum } from "@/lib/stats";
import { kwh, cn } from "@/lib/utils";
import { chart } from "@/lib/chartColors";
import { Info, TrendingUp, TrendingDown, Minus, PlugZap, Lightbulb, Leaf } from "lucide-react";

const APPLIANCES = [
  { code: "fridge", label: "Fridge" },
  { code: "geyser", label: "Geyser" },
  { code: "washing_machine", label: "Washing m/c" },
  { code: "nightbaseload", label: "Night load" },
  { code: "others", label: "Others" },
] as const;
const APPLIANCE_KEYS = ["ac", "fridge", "geyser", "washing_machine", "nightbaseload", "others"] as const;

export default function AnalyticsPage() {
  // Daily kWh from eventsummary — works for BOTH prepaid and postpaid meters.
  // NOTE: eventsummary/aggregate only serves ~the last 150 days (absolute-age
  // cap, verified live — older `from` dates return []). The full-year view comes
  // from the monthly groupBy:year rollup below, not from daily data.
  const { data: daily } = useConsumption(150);
  const { data: yearly } = useYearlyHistory();
  const { data: applianceResp } = useApplianceData();
  const [tipAppliance, setTipAppliance] = useState<string>("fridge");
  const { data: tipsResp } = useSavingTip(tipAppliance);

  // One cell per day, from eventsummary energyImportKWH.
  const cells: CalendarCell[] = useMemo(
    () =>
      (daily?.data ?? []).flatMap((r) => {
        const iso = String(r.energyImportKWH?.measureTime ?? "").slice(0, 10);
        const v = toNum(r.energyImportKWH?.value);
        return iso && Number.isFinite(v) ? [{ date: iso, value: v }] : [];
      }),
    [daily]
  );

  const sortedCells = useMemo(
    () => [...cells].sort((a, b) => a.date.localeCompare(b.date)),
    [cells]
  );

  const values = sortedCells.map((c) => c.value).filter((v) => v > 0);
  const avg = mean(values);
  const peak = values.length ? Math.max(...values) : 0;
  const sd = stddev(values);

  const last30 = sortedCells.slice(-30);
  const last7 = sortedCells.slice(-7);
  const total30 = last30.reduce((a, c) => a + c.value, 0);
  const avg30 = last30.length ? total30 / last30.length : 0;
  const avgPrev7 =
    sortedCells.length >= 14 ? mean(sortedCells.slice(-14, -7).map((c) => c.value)) : 0;
  const last7Avg = mean(last7.map((c) => c.value));
  const wowDelta = avgPrev7 > 0 ? ((last7Avg - avgPrev7) / avgPrev7) * 100 : 0;

  const dailyPoints = sortedCells.map((c, i) => ({ x: i, y: c.value, label: c.date }));

  const monthly = useMemo(
    () =>
      (yearly?.data ?? [])
        .map((r) => ({
          month: String(r.energyImportKWH?.measureTime ?? ""),
          kwh: toNum(r.energyImportKWH?.value),
          pf: toNum(r.powerFactor?.value),
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    [yearly]
  );
  const monthlyMax = Math.max(...monthly.map((m) => m.kwh), 1);

  // Avg PF only powers the contextual saving-tip note here; the PF chart/gauge
  // lives on the Meter tab (power quality) to avoid duplicating the metric.
  const avgPf = useMemo(() => {
    const vals = monthly.filter((m) => m.pf > 0 && m.pf <= 1.5).map((m) => m.pf);
    return vals.length ? mean(vals) : 0;
  }, [monthly]);

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
        <h1 className="text-[15px] text-on-surface">Usage</h1>
        <p className="mt-0.5 max-w-[680px] text-[12px] text-on-surface-variant">
          How much electricity you use and <span className="text-on-surface">when</span> — daily kWh, weekday patterns,
          the year at a glance, and where it goes. Power factor and demand live on the Meter tab.
        </p>
      </div>

      {/* HERO ROW: total + sparkline | baseline-vs-active */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="glow-hero relative flex flex-col justify-between rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-on-surface-variant sm:text-[10px]">
                Usage · last 30 days
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-[40px] font-light leading-none tracking-tight text-on-surface animate-count-up sm:text-[64px]">
                  {kwh(total30, 2)}
                </span>
                <span className="font-mono text-[14px] text-on-surface-variant sm:text-[16px]">kWh</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-on-surface-variant sm:text-[11px]">
                <span>
                  avg <span className="font-mono text-on-surface">{kwh(avg30, 2)}</span> kWh/day
                </span>
                <DeltaPill value={wowDelta} />
                <Tooltip
                  content={
                    <div>
                      <div className="font-mono text-on-surface">week-over-week on last 7 days</div>
                      <div className="text-on-surface-variant">
                        {avgPrev7 > 0
                          ? `prev 7-day avg: ${avgPrev7.toFixed(2)} kWh · current 7-day avg: ${last7Avg.toFixed(2)} kWh`
                          : "need at least 14 days of data"}
                      </div>
                    </div>
                  }
                >
                  <Info className="h-3 w-3 cursor-help text-on-surface-variant/70" />
                </Tooltip>
              </div>
            </div>

            <div className="hidden gap-6 md:flex">
              <Stat label="Avg"   value={`${kwh(avg)}`} sub="kWh/day" />
              <Stat label="σ"     value={`${kwh(sd)}`} sub="kWh/day" />
              <Stat label="Peak"  value={`${kwh(peak)}`} sub="kWh/day" />
              <Stat label="Days"  value={String(sortedCells.length)} sub="on record" />
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.24em] text-on-surface-variant sm:text-[10px]">
              <span>last {last30.length}-day consumption trend</span>
              <span className="font-mono text-primary-fixed-dim">peak {kwh(peak)} kWh</span>
            </div>
            <Sparkline
              values={last30.map((c) => c.value)}
              labels={last30.map((c) => c.date)}
              height={56}
              unit="kWh"
            />
          </div>
        </section>

        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.28em] text-on-surface-variant">
              Baseline vs Active load
            </div>
            <Tooltip
              content={
                <div>
                  <div className="font-mono text-on-surface">how baseline is computed</div>
                  <div className="text-on-surface-variant">
                    Baseline = the 25ᵗʰ-percentile daily kWh — a proxy for &quot;always-on&quot;
                    load (fridge, router, standby). Active = avg daily kWh − baseline.
                  </div>
                </div>
              }
            >
              <span className="cursor-help text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/70 underline decoration-dotted">
                how computed
              </span>
            </Tooltip>
          </div>
          <BaselineActive dayValues={values} />
        </section>
      </div>

      {/* PATTERNS ROW: calendar heatmap | day-of-week */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.8fr_1fr]">
        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
                Calendar heatmap
              </div>
              <p className="mt-1 text-[11px] text-on-surface-variant">
                columns = ISO weeks · rows = Mon→Sun · brightness = kWh that day
              </p>
            </div>
            <span className="font-mono text-[11px] text-on-surface-variant">
              {cells.length} day{cells.length === 1 ? "" : "s"} mapped
            </span>
          </div>
          <CalendarHeatmap cells={cells} />
        </section>

        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
                Day of week
              </div>
              <h3 className="mt-1 font-mono text-[14px] text-on-surface">When do you use more?</h3>
            </div>
            <Tooltip
              content={
                <div className="space-y-1">
                  <div className="font-mono text-on-surface">Daily granularity</div>
                  <div className="text-on-surface-variant">
                    Upstream returns daily kWh totals (measureTime always 00:00). This Mon-Sun
                    breakdown is the tightest signal available.
                  </div>
                </div>
              }
            >
              <span className="inline-flex cursor-help items-center gap-1 rounded-full bg-surface-container-high px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-on-surface-variant">
                <Info className="h-3 w-3" /> daily
              </span>
            </Tooltip>
          </div>
          <DayOfWeekChart dayValues={sortedCells} />
          <p className="mt-3 text-[10px] text-on-surface-variant/70">
            Amber = peak weekday. Hover any bar for delta vs average.
          </p>
        </section>
      </div>

      {/* TREND ROW: full-width daily line */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
              Daily kWh — crosshair scrub
            </div>
            <p className="mt-1 text-[11px] text-on-surface-variant">
              {dailyPoints.length} days plotted · dashed line = mean · hover for delta-from-mean
            </p>
          </div>
          <span className="font-mono text-[11px] text-on-surface-variant">
            mean {avg.toFixed(2)} kWh · σ {sd.toFixed(2)}
          </span>
        </div>
        {dailyPoints.length >= 2 ? (
          <LineChart
            height={200}
            format={(y) => y.toFixed(2)}
            xFormat={(x) => dailyPoints[Math.round(x)]?.label ?? ""}
            series={[
              { label: "kWh", color: chart.a, glow: true, points: dailyPoints },
              { label: "mean", color: chart.muted, dashed: true, points: dailyPoints.map((p) => ({ x: p.x, y: avg })) },
            ]}
          />
        ) : (
          <div className="py-16 text-center text-[11px] text-on-surface-variant">
            need at least 2 days of data to draw a trend line
          </div>
        )}
      </section>

      {/* BOTTOM ROW: monthly bars + carbon */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
              Annual profile
            </div>
            <div className="font-mono text-[10px] text-on-surface-variant/70">monthly · groupBy:year</div>
          </div>
          {monthly.length ? (
            <div className="flex gap-1.5" style={{ height: 180 }}>
              {monthly.map((m, i) => {
                const h = m.kwh > 0 ? Math.max(4, (m.kwh / monthlyMax) * 100) : 0;
                return (
                  <Tooltip
                    asChild
                    key={i}
                    content={
                      <div>
                        <div className="font-mono text-on-surface">
                          {new Date(m.month).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                        </div>
                        <div className="text-on-surface-variant">{m.kwh.toFixed(0)} kWh</div>
                        {m.pf > 0 && <div className="text-on-surface-variant">PF {m.pf.toFixed(2)}</div>}
                      </div>
                    }
                  >
                    <div className="group flex h-full flex-1 cursor-default flex-col">
                      <div className="flex flex-1 flex-col justify-end">
                        <div
                          className="w-full rounded-t-[3px] bg-gradient-to-t from-primary-container/40 to-primary-fixed-dim transition-all group-hover:brightness-125"
                          style={{ height: `${h}%` }}
                        />
                      </div>
                      <div className="mt-2 text-center font-mono text-[9px] text-on-surface-variant/70">
                        {m.month ? new Date(m.month).toLocaleDateString("en-IN", { month: "short" }) : ""}
                      </div>
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          ) : (
            <div className="flex h-[180px] items-center justify-center text-[11px] text-on-surface-variant">
              no yearly rollups yet
            </div>
          )}
        </section>

        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            <Leaf className="h-3 w-3" /> Carbon footprint
          </div>
          <CarbonCounter periodKwh={total30} periodLabel="last 30 days" />
        </section>
      </div>

      {/* APPLIANCE + TIPS ROW */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            <Lightbulb className="h-3 w-3" /> Saving tips
          </div>
          {avgPf > 0 && avgPf < 0.9 && (
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
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-[0.22em] text-on-surface-variant/80 sm:text-[9px]">
        {label}
      </div>
      <div className="mt-1 font-mono text-[14px] font-light text-on-surface sm:text-[16px]">{value}</div>
      <div className="font-mono text-[10px] text-on-surface-variant/70 sm:text-[9px]">{sub}</div>
    </div>
  );
}

function DeltaPill({ value }: { value: number }) {
  const up = value > 1;
  const down = value < -1;
  const cls = up ? "text-secondary bg-secondary-container/20" : down ? "text-primary-fixed-dim bg-primary-container/15" : "text-on-surface-variant bg-surface-container";
  return (
    <span className={"inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] " + cls}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : down ? <TrendingDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
      {value >= 0 ? "+" : ""}{value.toFixed(0)}% w/w
    </span>
  );
}
