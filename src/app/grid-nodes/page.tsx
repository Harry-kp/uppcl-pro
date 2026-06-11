"use client";

import { useMemo } from "react";
import {
  useBills,
  useConsumption,
  useYearlyHistory,
  useSites,
  useBalance,
  useOutstanding,
  usePayments,
  useUsageStats,
  useWssMeter,
} from "@/lib/api";
import { Donut } from "@/components/viz/Donut";
import { CalendarHeatmap, CalendarCell } from "@/components/viz/CalendarHeatmap";
import { LineChart } from "@/components/viz/LineChart";
import { RadialGauge, type GaugeAccent } from "@/components/viz/RadialGauge";
import { mean, toNum } from "@/lib/stats";
import { kwh } from "@/lib/utils";
import { chart } from "@/lib/chartColors";
import { Activity, Gauge } from "lucide-react";

export default function GridNodesPage() {
  const { data: bills } = useBills(365);
  const { data: cons } = useConsumption(90);
  const { data: yearly } = useYearlyHistory();
  const { data: sitesResp } = useSites();
  const { data: balanceResp } = useBalance();
  const { data: outstandingResp } = useOutstanding();
  const { data: paymentsResp } = usePayments(5);
  const { data: statsResp } = useUsageStats();
  const { data: meterResp } = useWssMeter();
  const wm = meterResp?.data;

  const msiNow =
    outstandingResp?.data?.msi ||
    paymentsResp?.data?.[0]?.msi ||
    balanceResp?.data?.msi ||
    "—";

  const site = sitesResp?.data?.[0];

  const billsAsc = useMemo(
    () =>
      [...(bills?.data ?? [])].sort(
        (a, b) => new Date(a.billDate).getTime() - new Date(b.billDate).getTime()
      ),
    [bills]
  );

  // Reading-type distribution (prepaid daily bills only)
  const reading = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of billsAsc) {
      const t = b.dailyBill.reading_type ?? "Unknown";
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  }, [billsAsc]);
  const totalReads = Object.values(reading).reduce((a, b) => a + b, 0);
  const actualPct = totalReads > 0 ? ((reading["Actual"] ?? 0) / totalReads) * 100 : 0;

  const cells: CalendarCell[] = useMemo(
    () =>
      billsAsc.flatMap((b) => {
        const iso = (b.dailyBill.usage_date ?? b.billDate).slice(0, 10);
        return iso ? [{ date: iso, value: 1 }] : [];
      }),
    [billsAsc]
  );
  const daysCovered = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- Date.now() inside useMemo is intentional; value captured once per recompute
    const now = Date.now();
    return Math.round((now - new Date(cells[0]?.date ?? now).getTime()) / 86_400_000) || 1;
  }, [cells]);

  // Peak power (kW) from consumption series + power factor from yearly (both meter types).
  const consAsc = useMemo(
    () =>
      [...(cons?.data ?? [])].sort((a, b) =>
        String(a.power.measureTime).localeCompare(String(b.power.measureTime))
      ),
    [cons]
  );
  const powerSeries = consAsc
    .map((r, i) => ({ x: i, y: toNum(r.power.value), label: String(r.power.measureTime).slice(0, 10) }))
    .filter((p) => Number.isFinite(p.y));

  const pfSeries = useMemo(() => {
    const rows = (yearly?.data ?? [])
      .map((r) => ({
        month: String(r.powerFactor?.measureTime ?? r.energyImportKWH?.measureTime),
        pf: toNum(r.powerFactor?.value),
      }))
      .filter((r) => r.pf > 0 && r.pf <= 1.5)
      .sort((a, b) => a.month.localeCompare(b.month));
    return rows.map((r, i) => ({ x: i, y: r.pf, label: r.month.slice(0, 7) }));
  }, [yearly]);

  // ── Power-quality summary ─────────────────────────────────────────
  const pfLatest = pfSeries.length ? pfSeries[pfSeries.length - 1].y : null;
  const pfAccent: GaugeAccent = pfLatest === null ? "default" : pfLatest >= 0.95 ? "good" : pfLatest >= 0.9 ? "default" : "warn";
  const pfAdvice =
    pfLatest === null ? "No power-factor history yet."
    : pfLatest >= 0.95 ? "Excellent — no surcharge, and you may qualify for a PF incentive."
    : pfLatest >= 0.9 ? "Healthy. Stay above 0.90 to avoid a power-factor surcharge."
    : "Below 0.90 — UPPCL levies a PF surcharge. Check for lightly-loaded motors or idle inductive loads.";

  const peakFromStats = toNum(statsResp?.data?.maximumPower);
  const peakKw = peakFromStats || (powerSeries.length ? Math.max(...powerSeries.map((p) => p.y)) : 0);
  const avgKw = mean(powerSeries.map((p) => p.y));
  const sanctioned = toNum(site?.sanctionedLoad);
  const demandPct = sanctioned > 0 && peakKw > 0 ? Math.round((peakKw / sanctioned) * 100) : null;
  const demandAccent: GaugeAccent =
    demandPct === null ? "default" : demandPct >= 100 ? "critical" : demandPct >= 85 ? "warn" : "default";
  const demandAdvice =
    demandPct === null ? "No demand data yet."
    : demandPct >= 100 ? "Exceeding sanctioned load — overload trips and penalties likely. Apply for load enhancement."
    : demandPct >= 85 ? "Near your sanctioned load. Frequent peaks risk MD penalties; consider load enhancement."
    : demandPct >= 70 ? "Approaching sanctioned load — avoid running heavy appliances simultaneously."
    : "Comfortable headroom under your sanctioned load.";

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Meter health</div>
          <h1 className="mt-1 font-mono text-[28px] font-light tracking-tight text-on-surface sm:text-[32px]">
            Is your meter behaving?
          </h1>
          <p className="mt-1 max-w-[640px] text-[13px] text-on-surface-variant sm:text-[12px]">
            Power quality (factor + peak demand), load headroom, and{billsAsc.length > 0 ? " reading reliability and" : ""} data
            integrity for your meter.
          </p>
        </div>
        <div className="text-left font-mono text-[11px] text-on-surface-variant sm:text-right">
          <div>{site?.deviceId ?? "—"}</div>
          <div>serial {site?.meterInstallationNumber ?? "—"}</div>
        </div>
      </header>

      {/* Power quality — PF + peak-demand gauges */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          <Gauge className="h-3 w-3" /> Power quality
        </div>
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <RadialGauge
              value={pfLatest ?? 0}
              max={1}
              accent={pfAccent}
              centerValue={pfLatest !== null ? pfLatest.toFixed(2) : "—"}
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
              <div className="mt-3 grid grid-cols-3 gap-3 text-[11px] text-on-surface-variant">
                <MeterStat k="Peak" v={`${peakKw.toFixed(2)} kW`} />
                <MeterStat k="Avg" v={`${avgKw.toFixed(2)} kW`} />
                <MeterStat k="Sanctioned" v={sanctioned > 0 ? `${sanctioned.toFixed(2)} kW` : "—"} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reading reliability + data integrity — shown whenever daily-bill data
          exists (prepaid, or a postpaid meter with a prior prepaid period). */}
      {billsAsc.length > 0 && (
        <>
          <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Data reliability</div>
            <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Donut
                size={180}
                stroke={12}
                centerValue={<>{actualPct.toFixed(0)}%</>}
                centerLabel="actual"
                segments={Object.entries(reading).map(([k, v], i) => ({
                  label: k,
                  value: v,
                  color: k === "Actual" ? chart.a : i === 1 ? chart.aSoft : chart.b,
                }))}
              />
              <div className="flex-1 space-y-2 text-[11px]">
                {Object.entries(reading).map(([k, v], i) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm" style={{ background: k === "Actual" ? chart.a : i === 1 ? chart.aSoft : chart.b }} />
                    <span className="text-on-surface-variant">{k}</span>
                    <span className="ml-auto font-mono text-on-surface">{v}</span>
                    <span className="w-10 text-right font-mono text-on-surface-variant">
                      {totalReads > 0 ? ((v / totalReads) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                ))}
                <div className="pt-2 text-[10px] text-on-surface-variant/70">
                  Higher &quot;Actual&quot; share = fewer estimated bills = more trustworthy data.
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Annual data integrity</div>
                <p className="mt-1 text-[11px] text-on-surface-variant">
                  Each cell = one day. Blue = bill received. Dark = missing (server didn&apos;t emit a daily row).
                </p>
              </div>
              <div className="text-right font-mono text-[11px] text-on-surface-variant">
                {cells.length} / {daysCovered} days covered
              </div>
            </div>
            <CalendarHeatmap cells={cells} unit="bill" />
          </section>
        </>
      )}

      {/* Stability trends — peak power + PF (both meter types) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Peak kW — 90-day trend</div>
            <span className="font-mono text-[11px] text-on-surface-variant">
              avg {avgKw.toFixed(2)} · σ {(powerSeries.length ? Math.sqrt(mean(powerSeries.map((p) => (p.y - avgKw) ** 2))) : 0).toFixed(2)}
            </span>
          </div>
          {powerSeries.length ? (
            <LineChart
              height={200}
              format={(y) => y.toFixed(2)}
              xFormat={(x) => powerSeries[Math.round(x)]?.label ?? ""}
              series={[{ label: "kW", color: chart.a, glow: true, points: powerSeries }]}
            />
          ) : (
            <div className="py-16 text-center text-[11px] text-on-surface-variant">no peak-power history</div>
          )}
        </section>
        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Power factor — monthly</div>
            <span className="font-mono text-[11px] text-on-surface-variant">target ≥ 0.95</span>
          </div>
          {pfSeries.length ? (
            <LineChart
              height={200}
              format={(y) => y.toFixed(2)}
              yMin={0.8}
              yMax={1.02}
              xFormat={(x) => pfSeries[Math.round(x)]?.label ?? ""}
              series={[
                { label: "PF", color: chart.aSoft, glow: true, points: pfSeries },
                { label: "target", color: chart.b, dashed: true, points: pfSeries.map((p) => ({ x: p.x, y: 0.95 })) },
              ]}
            />
          ) : (
            <div className="py-16 text-center text-[11px] text-on-surface-variant">no PF history yet</div>
          )}
        </section>
      </div>

      {/* Official meter reading (from the UPPCL bill portal) */}
      {wm && (
        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Official meter reading</div>
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-primary-fixed-dim">UPPCL</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <BottomStat
              k="Last reading"
              v={wm.previousReadingKWH ? `${kwh(toNum(wm.previousReadingKWH), 0)} kWh` : "—"}
              hint={wm.previousReadDateTime ? new Date(wm.previousReadDateTime.replace(/-/g, " ")).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "cumulative"}
            />
            <BottomStat k="Meter status" v={wm.meterStatus ?? "—"} hint="UPPCL register" />
            <BottomStat k="Tariff category" v={wm.purposeOfSupply ?? "—"} hint="purpose of supply" />
            <BottomStat k="Make / type" v={wm.manufacturerCode ?? "—"} hint={wm.meterConfigType ?? "meter"} />
          </div>
        </section>
      )}

      {/* Node identity */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="mb-4 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Node identity</div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 font-mono text-[12px] sm:grid-cols-2 lg:grid-cols-3">
          <Kv k="connection"            v={site?.connectionId} />
          <Kv k="device"                v={site?.deviceId} />
          <Kv k="installation #"        v={site?.meterInstallationNumber} />
          <Kv k="phase"                 v={site?.meterPhase} />
          <Kv k="meter type"            v={site?.meterType} />
          <Kv k="connection type"       v={site?.connectionType} />
          <Kv k="sanctioned load"       v={site?.sanctionedLoad ? `${site.sanctionedLoad} kW` : undefined} />
          <Kv k="tariff tenant"         v={site?.tenantId} />
          <Kv k="tenant code"           v={site?.tenantCode} />
          <Kv k="pincode"               v={site?.pincode} />
          <Kv k="last msi seen"         v={msiNow} />
        </div>
      </section>

    </div>
  );
}

function MeterStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.2em] text-on-surface-variant/80 sm:text-[10px]">{k}</div>
      <div className="mt-0.5 font-mono text-[14px] text-on-surface sm:text-[16px]">{v}</div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-2">
      <span className="text-[12px] uppercase tracking-[0.18em] text-on-surface-variant sm:text-[11px]">{k}</span>
      <span className="truncate text-right text-on-surface">{v || "—"}</span>
    </div>
  );
}

function BottomStat({ k, v, hint }: { k: string; v: string; hint: string }) {
  return (
    <div className="rounded-xl bg-surface-container-high p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-on-surface-variant sm:text-[10px]">{k}</div>
      <div className="mt-2 font-mono text-[18px] font-light text-on-surface sm:text-[22px]">{v}</div>
      <div className="mt-1 text-[12px] text-on-surface-variant sm:text-[11px]">{hint}</div>
    </div>
  );
}
