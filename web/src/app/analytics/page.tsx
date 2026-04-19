"use client";

import { useMemo } from "react";
import { useBills, useYearlyHistory } from "@/lib/api";
import { CalendarHeatmap, CalendarCell } from "@/components/viz/CalendarHeatmap";
import { DayOfWeekChart } from "@/components/viz/DayOfWeekChart";
import { BaselineActive } from "@/components/viz/BaselineActive";
import { LineChart } from "@/components/viz/LineChart";
import { Sparkline } from "@/components/viz/Sparkline";
import { Tooltip } from "@/components/ui/Tooltip";
import { mean, stddev, toNum } from "@/lib/stats";
import { kwh } from "@/lib/utils";
import { chart } from "@/lib/chartColors";
import { Info, TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function AnalyticsPage() {
  const { data: bills } = useBills(365);
  const { data: yearly } = useYearlyHistory();

  // One cell per day of daily data
  const cells: CalendarCell[] = useMemo(
    () =>
      (bills?.data ?? []).flatMap((b) => {
        const iso = (b.dailyBill.usage_date ?? b.billDate).slice(0, 10);
        const v = toNum(b.dailyBill.units_billed_daily);
        return iso && Number.isFinite(v) ? [{ date: iso, value: v }] : [];
      }),
    [bills]
  );

  const sortedCells = useMemo(
    () => [...cells].sort((a, b) => a.date.localeCompare(b.date)),
    [cells]
  );

  const values = sortedCells.map((c) => c.value).filter((v) => v > 0);
  const avg = mean(values);
  const peak = values.length ? Math.max(...values) : 0;
  const sd = stddev(values);

  // Last N days aggregates
  const last30 = sortedCells.slice(-30);
  const last7 = sortedCells.slice(-7);
  const total30 = last30.reduce((a, c) => a + c.value, 0);
  const avg30 = last30.length ? total30 / last30.length : 0;
  const avgPrev7 =
    sortedCells.length >= 14
      ? mean(sortedCells.slice(-14, -7).map((c) => c.value))
      : 0;
  const last7Avg = mean(last7.map((c) => c.value));
  const wowDelta = avgPrev7 > 0 ? ((last7Avg - avgPrev7) / avgPrev7) * 100 : 0;

  // Daily series for trend line
  const dailyPoints = sortedCells.map((c, i) => ({ x: i, y: c.value, label: c.date }));

  // Monthly rollups (yearly history)
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

  const pfPoints = useMemo(
    () =>
      monthly
        .filter((m) => Number.isFinite(m.pf) && m.pf > 0 && m.pf <= 1.5)
        .map((m, i) => ({ x: i, y: m.pf, label: m.month.slice(0, 7) })),
    [monthly]
  );
  const avgPf = pfPoints.length ? mean(pfPoints.map((p) => p.y)) : 0;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      {/* HERO ROW: total + sparkline | baseline-vs-active */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="glow-hero relative flex flex-col justify-between rounded-xl bg-surface-container-low p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-on-surface-variant">
                Usage · last 30 days
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-[64px] font-light leading-none tracking-tight text-on-surface animate-count-up">
                  {kwh(total30, 2)}
                </span>
                <span className="font-mono text-[16px] text-on-surface-variant">kWh</span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-on-surface-variant">
                <span>
                  avg <span className="font-mono text-on-surface">{kwh(avg30, 2)}</span> kWh/day
                </span>
                <DeltaPill value={wowDelta} />
                <Tooltip
                  content={
                    <div>
                      <div className="font-mono text-on-surface">
                        week-over-week on last 7 days
                      </div>
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

            {/* Inline key stats */}
            <div className="hidden gap-6 md:flex">
              <Stat label="Avg"   value={`${kwh(avg)}`} sub="kWh/day" />
              <Stat label="σ"     value={`${kwh(sd)}`} sub="kWh/day" />
              <Stat label="Peak"  value={`${kwh(peak)}`} sub="kWh/day" />
              <Stat label="Days"  value={String(sortedCells.length)} sub="on record" />
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
              <span>last {last30.length}-day consumption trend</span>
              <span className="font-mono text-primary-fixed-dim">avg {kwh(avg30)} kWh/d</span>
            </div>
            <Sparkline
              values={last30.map((c) => c.value)}
              labels={last30.map((c) => c.date)}
              height={56}
              unit="kWh"
            />
          </div>
        </section>

        <section className="rounded-xl bg-surface-container-low p-6">
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
        <section className="rounded-xl bg-surface-container-low p-6">
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

        <section className="rounded-xl bg-surface-container-low p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
                Day of week
              </div>
              <h3 className="mt-1 font-mono text-[14px] text-on-surface">
                When do you use more?
              </h3>
            </div>
            <Tooltip
              content={
                <div className="space-y-1">
                  <div className="font-mono text-on-surface">Why not Day × Hour?</div>
                  <div className="text-on-surface-variant">
                    Upstream returns daily totals only (measureTime always 00:00).
                    Hour-slab fields (tod_1..tod_10) are zero for flat-tariff accounts.
                    This Mon-Sun breakdown is the tightest signal available.
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
      <section className="rounded-xl bg-surface-container-low p-6">
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
            need at least 2 days of bills to draw a trend line
          </div>
        )}
      </section>

      {/* BOTTOM ROW: monthly bars + PF + ToD */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl bg-surface-container-low p-6 lg:col-span-1">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
              Annual profile
            </div>
            <div className="font-mono text-[10px] text-on-surface-variant/70">
              monthly · groupBy:year
            </div>
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

        <section className="rounded-xl bg-surface-container-low p-6 lg:col-span-1">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
                Power factor
                <Tooltip
                  content={
                    <div className="space-y-1.5">
                      <div className="font-mono text-on-surface">Power factor (PF) — what is it?</div>
                      <div className="text-on-surface-variant">
                        Ratio of <span className="text-on-surface">real power</span> (kW, does useful work)
                        to <span className="text-on-surface">apparent power</span> (kVA, what the grid delivers).
                        1.00 = perfectly efficient; lower = more of the current is &quot;reactive&quot; and wasted.
                      </div>
                      <div className="text-on-surface-variant">
                        <span className="text-on-surface">Target ≥ 0.95</span> — DISCOMs penalise below this on
                        commercial tariffs. For residential it&apos;s an appliance-health signal: inductive loads
                        (AC compressors, old motors) drag PF down.
                      </div>
                      <div className="text-on-surface-variant">
                        <span className="text-secondary">Falling PF</span> → check for an aging AC, motor, or
                        unbalanced neutral before your next bill cycle.
                      </div>
                    </div>
                  }
                >
                  <Info className="h-3 w-3 cursor-help text-on-surface-variant/70" />
                </Tooltip>
              </div>
              <div className="mt-1 font-mono text-[11px]">
                {avgPf > 0 ? (
                  <span className={avgPf >= 0.95 ? "text-primary-fixed-dim" : "text-secondary"}>
                    {avgPf.toFixed(2)} avg
                  </span>
                ) : (
                  <span className="text-on-surface-variant">—</span>
                )}
                <span className="ml-2 text-[10px] uppercase text-on-surface-variant/80">target ≥ 0.95</span>
              </div>
            </div>
          </div>
          {pfPoints.length ? (
            <LineChart
              height={180}
              format={(y) => y.toFixed(2)}
              yMin={0.8}
              yMax={1.02}
              xFormat={(x) => pfPoints[Math.round(x)]?.label ?? ""}
              series={[
                { label: "PF", color: chart.aSoft, glow: true, points: pfPoints },
                { label: "target", color: chart.b, dashed: true, points: pfPoints.map((p) => ({ x: p.x, y: 0.95 })) },
              ]}
            />
          ) : (
            <div className="flex h-[180px] items-center justify-center text-[11px] text-on-surface-variant">
              need at least one complete month of rollups
            </div>
          )}
        </section>

        <TodSlabs bills={bills?.data ?? []} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-[0.22em] text-on-surface-variant/80">
        {label}
      </div>
      <div className="mt-1 font-mono text-[16px] font-light text-on-surface">{value}</div>
      <div className="font-mono text-[9px] text-on-surface-variant/70">{sub}</div>
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

function TodSlabs({ bills }: { bills: { dailyBill: Record<string, string | null | undefined> }[] }) {
  if (!bills.length) {
    return (
      <section className="rounded-xl bg-surface-container-low p-6">
        <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          Time-of-day slabs
        </div>
        <div className="mt-4 text-[11px] text-on-surface-variant">no bills yet.</div>
      </section>
    );
  }
  const latest = bills[0].dailyBill;
  const slabs = Array.from({ length: 10 }, (_, i) => ({
    label: `T${i + 1}`,
    amount: parseFloat((latest[`tod_${i + 1}_ec_total`] as string) || "0"),
  })).filter((s) => s.amount > 0);
  const total = slabs.reduce((a, s) => a + s.amount, 0);

  return (
    <section className="rounded-xl bg-surface-container-low p-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          Time-of-day slabs
        </div>
        {total === 0 && (
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-on-surface-variant">
            flat tariff
          </span>
        )}
      </div>
      {total === 0 ? (
        <div className="mt-2 space-y-2 text-[11px] text-on-surface-variant">
          <p>
            All <span className="font-mono text-on-surface">tod_1..tod_10</span> fields are zero on your latest bill.
            You&apos;re on a flat (non-TOD) tariff — no time-of-day splitting to report.
          </p>
          <p className="text-on-surface-variant/70">
            If your tariff changes, this panel will populate automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {slabs.map((s) => {
            const pct = (s.amount / total) * 100;
            return (
              <div key={s.label} className="flex items-center gap-3">
                <div className="w-8 font-mono text-[11px] text-on-surface-variant">{s.label}</div>
                <div className="flex-1 overflow-hidden rounded-sm bg-surface-container">
                  <div className="h-3 bg-primary-container" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-12 text-right font-mono text-[11px] text-on-surface">
                  {pct.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
