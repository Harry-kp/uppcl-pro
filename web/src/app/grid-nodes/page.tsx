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
} from "@/lib/api";
import { Donut } from "@/components/viz/Donut";
import { CalendarHeatmap, CalendarCell } from "@/components/viz/CalendarHeatmap";
import { LineChart } from "@/components/viz/LineChart";
import { Tooltip } from "@/components/ui/Tooltip";
import { mean, toNum } from "@/lib/stats";
import { kwh } from "@/lib/utils";
import { chart } from "@/lib/chartColors";

export default function GridNodesPage() {
  const { data: bills } = useBills(365);
  const { data: cons } = useConsumption(90);
  const { data: yearly } = useYearlyHistory();
  const { data: sitesResp } = useSites();
  const { data: balanceResp } = useBalance();
  const { data: outstandingResp } = useOutstanding();
  const { data: paymentsResp } = usePayments(5);

  // MSI: prefer outstandingBalance (reliably returns it), fall back to latest
  // payment record's msi, then whatever prepaidBalance might have given us.
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

  // Reading-type distribution
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

  // Integrity calendar — mark days with a bill row
  const cells: CalendarCell[] = useMemo(
    () =>
      billsAsc.flatMap((b) => {
        const iso = (b.dailyBill.usage_date ?? b.billDate).slice(0, 10);
        return iso ? [{ date: iso, value: 1 }] : [];
      }),
    [billsAsc]
  );

  // Stability matrix — peak power (kW) from consumption series + power factor from yearly
  const consAsc = useMemo(
    () =>
      [...(cons?.data ?? [])].sort((a, b) =>
        String(a.power.measureTime).localeCompare(String(b.power.measureTime))
      ),
    [cons]
  );
  const powerSeries = consAsc
    .map((r, i) => ({
      x: i,
      y: toNum(r.power.value),
      label: String(r.power.measureTime).slice(0, 10),
    }))
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

  // Peak kW vs sanctioned load
  const peakKw = powerSeries.length ? Math.max(...powerSeries.map((p) => p.y)) : 0;
  const avgKw = mean(powerSeries.map((p) => p.y));
  const sanctioned = toNum(site?.sanctionedLoad);
  const loadFactor = sanctioned > 0 ? peakKw / sanctioned : 0;

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            Meter health
          </div>
          <h1 className="mt-1 font-mono text-[32px] font-light tracking-tight text-on-surface">
            Is your meter behaving?
          </h1>
          <p className="mt-1 max-w-[640px] text-[12px] text-on-surface-variant">
            Reading reliability (Actual vs Estimated), data-integrity calendar, peak-vs-sanctioned
            load, and power-quality proxies for your meter.
          </p>
        </div>
        <div className="text-right font-mono text-[11px] text-on-surface-variant">
          <div>{site?.deviceId ?? "—"}</div>
          <div>serial {site?.meterInstallationNumber ?? "—"}</div>
        </div>
      </header>

      {/* Row 1: reliability donut + peak-vs-sanctioned gauge */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-xl bg-surface-container-low p-6">
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            Data reliability
          </div>
          <div className="mt-4 flex items-center gap-6">
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
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ background: k === "Actual" ? chart.a : i === 1 ? chart.aSoft : chart.b }}
                  />
                  <span className="text-on-surface-variant">{k}</span>
                  <span className="ml-auto font-mono text-on-surface">{v}</span>
                  <span className="w-10 text-right font-mono text-on-surface-variant">
                    {((v / totalReads) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
              <div className="pt-2 text-[10px] text-on-surface-variant/70">
                Higher &quot;Actual&quot; share = fewer estimated bills = more trustworthy data.
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-surface-container-low p-6">
          <div className="mb-1 flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
                Peak load vs sanctioned
              </div>
              <div className="mt-2 font-mono text-[26px] font-light text-on-surface">
                {peakKw.toFixed(2)} <span className="text-[14px] text-on-surface-variant">kW peak</span>
              </div>
            </div>
            {loadFactor > 0 && (
              <Tooltip
                content={
                  <div>
                    <div className="font-mono text-on-surface">peak / sanctioned = {(loadFactor * 100).toFixed(1)}%</div>
                    <div className="text-on-surface-variant">
                      {loadFactor > 0.9 ? "⚠ near limit — breaching risks disconnection" :
                       loadFactor > 0.7 ? "headroom shrinking" :
                       "healthy headroom"}
                    </div>
                  </div>
                }
              >
                <span
                  className={
                    "cursor-help rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] " +
                    (loadFactor > 0.9
                      ? "bg-secondary-container/30 text-secondary"
                      : loadFactor > 0.7
                      ? "bg-surface-container-high text-on-surface-variant"
                      : "bg-surface-container-high text-primary-fixed-dim")
                  }
                >
                  {(loadFactor * 100).toFixed(0)}% of limit
                </span>
              </Tooltip>
            )}
          </div>
          <div className="mt-4">
            <GaugeBar value={peakKw} sanctioned={sanctioned} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 text-[11px] text-on-surface-variant">
            <MeterStat k="Peak"         v={`${peakKw.toFixed(2)} kW`} />
            <MeterStat k="Avg"          v={`${avgKw.toFixed(2)} kW`} />
            <MeterStat k="Sanctioned"   v={sanctioned > 0 ? `${sanctioned.toFixed(2)} kW` : "—"} />
          </div>
        </section>
      </div>

      {/* Row 2: data integrity 365-day calendar */}
      <section className="rounded-xl bg-surface-container-low p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
              Annual data integrity
            </div>
            <p className="mt-1 text-[11px] text-on-surface-variant">
              Each cell = one day. Blue = bill received. Dark = missing (server didn&apos;t emit a daily row).
            </p>
          </div>
          <div className="text-right font-mono text-[11px] text-on-surface-variant">
            {cells.length} / {Math.round((Date.now() - new Date(cells[0]?.date ?? Date.now()).getTime()) / 86_400_000) || 1} days covered
          </div>
        </div>
        <CalendarHeatmap cells={cells} unit="bill" />
      </section>

      {/* Row 3: stability matrix — peak power line + PF line */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl bg-surface-container-low p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
              Peak kW — 90-day trend
            </div>
            <span className="font-mono text-[11px] text-on-surface-variant">
              avg {avgKw.toFixed(2)} · σ {(powerSeries.length ? Math.sqrt(mean(powerSeries.map(p => (p.y - avgKw) ** 2))) : 0).toFixed(2)}
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
        <section className="rounded-xl bg-surface-container-low p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
              Power factor — monthly
            </div>
            <span className="font-mono text-[11px] text-on-surface-variant">
              target ≥ 0.95
            </span>
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

      {/* Row 4: meter metadata card */}
      <section className="rounded-xl bg-surface-container-low p-6">
        <div className="mb-4 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          Node identity
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 font-mono text-[12px] lg:grid-cols-3">
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
          <Kv k="current meter status"  v={balanceResp?.data?.meterStatus ?? (balanceResp?.source === "latest-daily-bill" ? "unreported (bills flowing)" : "—")} />
          <Kv k="last msi seen"         v={msiNow} />
        </div>
      </section>

      {/* Row 5: bottom stats */}
      <div className="grid grid-cols-4 gap-4">
        <BottomStat k="Bills received"    v={String(totalReads)} hint="past year" />
        <BottomStat k="Actual readings"   v={`${actualPct.toFixed(0)}%`} hint="vs estimated" />
        <BottomStat
          k="Total 90-day kWh"
          v={kwh(
            consAsc.reduce(
              (a, r) => a + (Number.isFinite(toNum(r.energyImportKWH.value)) ? toNum(r.energyImportKWH.value) : 0),
              0
            ),
            0
          )}
          hint="imported"
        />
        <BottomStat
          k="Peak / sanctioned"
          v={sanctioned > 0 ? `${(loadFactor * 100).toFixed(0)}%` : "—"}
          hint={sanctioned > 0 ? (loadFactor > 0.9 ? "near limit" : "healthy") : "no limit set"}
        />
      </div>
    </div>
  );
}

function GaugeBar({ value, sanctioned }: { value: number; sanctioned: number }) {
  const pct = sanctioned > 0 ? Math.min(1, value / sanctioned) : 0;
  return (
    <div className="space-y-2">
      <div className="relative h-5 overflow-hidden rounded-md bg-surface-container">
        <div
          className="h-full rounded-md bg-gradient-to-r from-primary-container to-secondary transition-[width] duration-700"
          style={{ width: `${pct * 100}%` }}
        />
        {/* 70% and 90% markers */}
        <div className="absolute top-0 h-full w-px bg-white/20" style={{ left: "70%" }} />
        <div className="absolute top-0 h-full w-px bg-white/30" style={{ left: "90%" }} />
      </div>
      <div className="flex justify-between font-mono text-[9px] text-on-surface-variant/60">
        <span>0</span>
        <span style={{ marginLeft: "70%" }}>70%</span>
        <span>sanctioned</span>
      </div>
    </div>
  );
}

function MeterStat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/80">{k}</div>
      <div className="mt-0.5 font-mono text-[16px] text-on-surface">{v}</div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-2">
      <span className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">{k}</span>
      <span className="truncate text-right text-on-surface">{v || "—"}</span>
    </div>
  );
}

function BottomStat({ k, v, hint }: { k: string; v: string; hint: string }) {
  return (
    <div className="rounded-xl bg-surface-container-high p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">{k}</div>
      <div className="mt-2 font-mono text-[22px] font-light text-on-surface">{v}</div>
      <div className="mt-1 text-[11px] text-on-surface-variant">{hint}</div>
    </div>
  );
}
