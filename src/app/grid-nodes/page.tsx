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
import { LineChart } from "@/components/viz/LineChart";
import { RadialGauge, type GaugeAccent } from "@/components/viz/RadialGauge";
import { mean, toNum } from "@/lib/stats";
import { kwh } from "@/lib/utils";
import { chart } from "@/lib/chartColors";
import { Activity, Gauge, Info } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

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
    outstandingResp?.data?.msi || paymentsResp?.data?.[0]?.msi || balanceResp?.data?.msi || "—";

  const site = sitesResp?.data?.[0];

  const billsAsc = useMemo(
    () => [...(bills?.data ?? [])].sort((a, b) => new Date(a.billDate).getTime() - new Date(b.billDate).getTime()),
    [bills]
  );

  // Reading-type reliability (prepaid daily bills, incl. a meter's prior prepaid period)
  const reading = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of billsAsc) counts[b.dailyBill.reading_type ?? "Unknown"] = (counts[b.dailyBill.reading_type ?? "Unknown"] ?? 0) + 1;
    return counts;
  }, [billsAsc]);
  const totalReads = Object.values(reading).reduce((a, b) => a + b, 0);
  const actualPct = totalReads > 0 ? ((reading["Actual"] ?? 0) / totalReads) * 100 : 0;

  // Peak power (kW) from consumption + power factor from yearly (both meter types)
  const consAsc = useMemo(
    () => [...(cons?.data ?? [])].sort((a, b) => String(a.power.measureTime).localeCompare(String(b.power.measureTime))),
    [cons]
  );
  const powerSeries = consAsc
    .map((r, i) => ({ x: i, y: toNum(r.power.value), label: String(r.power.measureTime).slice(0, 10) }))
    .filter((p) => Number.isFinite(p.y));

  const pfSeries = useMemo(() => {
    const rows = (yearly?.data ?? [])
      .map((r) => ({ month: String(r.powerFactor?.measureTime ?? r.energyImportKWH?.measureTime), pf: toNum(r.powerFactor?.value) }))
      .filter((r) => r.pf > 0 && r.pf <= 1.5)
      .sort((a, b) => a.month.localeCompare(b.month));
    return rows.map((r, i) => ({ x: i, y: r.pf, label: r.month.slice(0, 7) }));
  }, [yearly]);

  // Power-quality summary
  const pfLatest = pfSeries.length ? pfSeries[pfSeries.length - 1].y : null;
  const pfAccent: GaugeAccent = pfLatest === null ? "default" : pfLatest >= 0.95 ? "good" : pfLatest >= 0.9 ? "default" : "warn";
  const pfAdvice =
    pfLatest === null ? "No power-factor history yet."
    : pfLatest >= 0.95 ? "Excellent — no surcharge, and you may qualify for a PF incentive."
    : pfLatest >= 0.9 ? "Healthy. Stay above 0.90 to avoid a power-factor surcharge."
    : "Below 0.90 — UPPCL levies a PF surcharge. Check for lightly-loaded motors or idle inductive loads.";

  const peakKw = toNum(statsResp?.data?.maximumPower) || (powerSeries.length ? Math.max(...powerSeries.map((p) => p.y)) : 0);
  const avgKw = mean(powerSeries.map((p) => p.y));
  const sanctioned = toNum(site?.sanctionedLoad);
  const demandPct = sanctioned > 0 && peakKw > 0 ? Math.round((peakKw / sanctioned) * 100) : null;
  const demandAccent: GaugeAccent = demandPct === null ? "default" : demandPct >= 100 ? "critical" : demandPct >= 85 ? "warn" : "default";
  const demandAdvice =
    demandPct === null ? "No demand data yet."
    : demandPct >= 100 ? "Exceeding sanctioned load — overload trips and penalties likely. Apply for load enhancement."
    : demandPct >= 85 ? "Near your sanctioned load. Frequent peaks risk MD penalties; consider load enhancement."
    : demandPct >= 70 ? "Approaching sanctioned load — avoid running heavy appliances at once."
    : "Comfortable headroom under your sanctioned load.";

  const lastReadDate = wm?.previousReadDateTime
    ? new Date(wm.previousReadDateTime.replace(/-/g, " ")).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "cumulative";

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <div className="px-1">
        <h1 className="text-[15px] text-on-surface">Meter</h1>
        <p className="mt-0.5 max-w-[680px] text-[12px] text-on-surface-variant">
          Two things that quietly affect your bill — <span className="text-on-surface">power factor</span> and{" "}
          <span className="text-on-surface">peak demand vs your sanctioned load</span> — plus your meter&apos;s official reading and identity.
        </p>
      </div>

      {/* 1 · Power quality */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          <Gauge className="h-3 w-3" /> Power quality
        </div>
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <RadialGauge value={pfLatest ?? 0} max={1} accent={pfAccent} centerValue={pfLatest !== null ? pfLatest.toFixed(2) : "—"} centerLabel="Power Factor" size={156} />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">
                <Activity className="h-3 w-3" /> Power factor
                <Tooltip content={<div className="max-w-[240px]">Real power ÷ apparent power (0–1). Below 0.90, UPPCL adds a surcharge; closer to 1 means less wasted current.</div>}>
                  <Info className="h-3 w-3 cursor-help text-on-surface-variant/70" />
                </Tooltip>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-on-surface">{pfAdvice}</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <RadialGauge value={peakKw} max={sanctioned || 1} accent={demandAccent} centerValue={peakKw > 0 ? kwh(peakKw, 1) : "—"} centerLabel="Peak kW" sub={demandPct !== null ? `${demandPct}% of ${sanctioned} kW` : undefined} size={156} />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">
                <Gauge className="h-3 w-3" /> Peak demand vs sanctioned
                <Tooltip content={<div className="max-w-[240px]">The highest power your meter drew vs your sanctioned load. Nearing it risks max-demand penalties; exceeding it can trip your supply.</div>}>
                  <Info className="h-3 w-3 cursor-help text-on-surface-variant/70" />
                </Tooltip>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-on-surface">{demandAdvice}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2 · Meter & connection — status, reading, reliability, identity in one block */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Meter &amp; connection</div>
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-primary-fixed-dim">official · UPPCL</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat k="Meter status" v={(wm?.meterStatus ?? "active").toLowerCase()} hint="UPPCL register" />
          <Stat k="Last reading" v={wm?.previousReadingKWH ? `${kwh(toNum(wm.previousReadingKWH), 0)} kWh` : "—"} hint={lastReadDate} />
          <Stat k="Tariff category" v={wm?.purposeOfSupply ?? site?.meterType ?? "—"} hint="purpose of supply" />
          <Stat k="Sanctioned load" v={sanctioned > 0 ? `${sanctioned} kW` : "—"} hint={`peak ${peakKw > 0 ? kwh(peakKw, 1) : "—"} kW`} />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2.5 font-mono text-[12px] sm:grid-cols-2 lg:grid-cols-3">
          <Kv k="connection" v={site?.connectionId} />
          <Kv k="device / serial" v={site?.deviceId} />
          <Kv k="installation #" v={site?.meterInstallationNumber} />
          <Kv k="make / type" v={wm?.manufacturerCode ? `${wm.manufacturerCode}${wm.meterConfigType ? ` · ${wm.meterConfigType}` : ""}` : site?.meterType} />
          <Kv k="phase" v={site?.meterPhase} />
          <Kv k="connection type" v={site?.connectionType} />
          <Kv k="discom" v={site?.tenantId} />
          <Kv k="pincode" v={site?.pincode} />
          {billsAsc.length > 0 && <Kv k="actual reads" v={`${actualPct.toFixed(0)}% of ${totalReads}`} />}
          <Kv k="last msi" v={msiNow} />
        </div>
      </section>

      {/* 3 · Trends */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Peak kW — 90-day trend</div>
            <span className="font-mono text-[11px] text-on-surface-variant">avg {avgKw.toFixed(2)} kW</span>
          </div>
          {powerSeries.length ? (
            <LineChart height={180} format={(y) => y.toFixed(2)} xFormat={(x) => powerSeries[Math.round(x)]?.label ?? ""}
              series={[{ label: "kW", color: chart.a, glow: true, points: powerSeries }]} />
          ) : (
            <div className="py-14 text-center text-[11px] text-on-surface-variant">no peak-power history</div>
          )}
        </section>
        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Power factor — monthly</div>
            <span className="font-mono text-[11px] text-on-surface-variant">target ≥ 0.95</span>
          </div>
          {pfSeries.length ? (
            <LineChart height={180} format={(y) => y.toFixed(2)} yMin={0.8} yMax={1.02} xFormat={(x) => pfSeries[Math.round(x)]?.label ?? ""}
              series={[
                { label: "PF", color: chart.aSoft, glow: true, points: pfSeries },
                { label: "target", color: chart.b, dashed: true, points: pfSeries.map((p) => ({ x: p.x, y: 0.95 })) },
              ]} />
          ) : (
            <div className="py-14 text-center text-[11px] text-on-surface-variant">no PF history yet</div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ k, v, hint }: { k: string; v: string; hint: string }) {
  return (
    <div className="rounded-lg bg-surface-container p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">{k}</div>
      <div className="mt-1 font-mono text-[17px] font-light text-on-surface">{v}</div>
      <div className="mt-0.5 text-[10px] text-on-surface-variant/70">{hint}</div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2">
      <span className="text-[11px] uppercase tracking-[0.16em] text-on-surface-variant">{k}</span>
      <span className="truncate text-right text-on-surface">{v || "—"}</span>
    </div>
  );
}
