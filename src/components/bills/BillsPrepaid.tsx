"use client";

import { useMemo, useState } from "react";
import { Download, Sparkles } from "lucide-react";
import {
  useBills,
  useBillHistory,
  usePayments,
  useDashboard,
  DailyBill,
} from "@/lib/api";
import { LineChart } from "@/components/viz/LineChart";
import { Donut } from "@/components/viz/Donut";
import { StackedBar } from "@/components/viz/StackedBar";
import { EventTimeline, TimelineEvent } from "@/components/viz/EventTimeline";
import { SidePanel } from "@/components/ui/SidePanel";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { mean, sum, toNum } from "@/lib/stats";
import { rupees, daysBetween } from "@/lib/utils";
import { chart } from "@/lib/chartColors";

/** Prepaid money hub: daily-bill cost analytics + recharge planner. */
export function BillsPrepaid() {
  const { data: bills } = useBills(365);
  const { data: history } = useBillHistory(24);
  const { data: payments } = usePayments(50);
  const { data: dashboard } = useDashboard();
  const { push } = useToast();
  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  const [amount, setAmount] = useState(2000);

  const asc = useMemo(
    () => [...(bills?.data ?? [])].sort((a, b) => new Date(a.billDate).getTime() - new Date(b.billDate).getTime()),
    [bills]
  );

  const effRateByMonth = useMemo(() => {
    const map = new Map<string, { units: number; rs: number }>();
    for (const b of asc) {
      const d = b.dailyBill.usage_date ?? b.billDate;
      if (!d) continue;
      const key = d.slice(0, 7);
      const u = toNum(b.dailyBill.units_billed_daily);
      const r = toNum(b.dailyBill.daily_en_chg);
      if (!Number.isFinite(u) || !Number.isFinite(r)) continue;
      const agg = map.get(key) ?? { units: 0, rs: 0 };
      agg.units += u;
      agg.rs += r;
      map.set(key, agg);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ month: k, rate: v.units > 0 ? v.rs / v.units : 0 }));
  }, [asc]);

  const last30 = asc.slice(-30);
  const comp = useMemo(() => ({
    energy: sum(last30.map((b) => toNum(b.dailyBill.daily_en_chg))),
    fixed: sum(last30.map((b) => toNum(b.dailyBill.daily_fc_chg))),
    duty: sum(last30.map((b) => toNum(b.dailyBill.daily_ed_chg))),
    fppa: sum(last30.map((b) => toNum(b.dailyBill.fppa_charges))),
    subsidy: sum(last30.map((b) => toNum(b.dailyBill.daily_gvt_subsidy))),
    rebate: sum(last30.map((b) => toNum(b.dailyBill.daily_rebate_chg))),
    total: sum(last30.map((b) => toNum(b.dailyBill.daily_chg))),
  }), [last30]);

  const subsidyYtd = useMemo(() => {
    const cum = toNum(asc[asc.length - 1]?.dailyBill.cum_gvt_subsidy);
    return Math.abs(Number.isFinite(cum) ? cum : 0);
  }, [asc]);
  const projectedAnnualSubsidy = subsidyYtd * (12 / (effRateByMonth.length || 1));

  const slabTotals = useMemo(() => {
    const t = [0, 0, 0, 0];
    for (const b of asc) for (let i = 0; i < 4; i++) t[i] += toNum(b.dailyBill[`unit_slab_${i + 1}`]);
    return t;
  }, [asc]);
  const totalUnits = sum(slabTotals);

  const events: TimelineEvent[] = useMemo(() => {
    const billEvents: TimelineEvent[] = asc.map((b) => ({
      id: `bill-${b._id}`, date: b.billDate, kind: "bill",
      title: `Daily bill · ₹${rupees(toNum(b.dailyBill.daily_chg))}`,
      subtitle: `${b.dailyBill.units_billed_daily} kWh · closing ₹${b.dailyBill.closing_bal}`,
      amount: toNum(b.dailyBill.daily_chg), raw: b.dailyBill as unknown as Record<string, unknown>,
    }));
    const invoiceEvents: TimelineEvent[] = (history?.data ?? []).map((inv) => ({
      id: `inv-${inv.invoice_id}`, date: inv.bill_dt, kind: "invoice",
      title: `Invoice ${inv.invoice_id}`, subtitle: `₹${inv.bill_amt} · due ${inv.due_dt?.slice(0, 10)}`,
      amount: toNum(inv.bill_amt), raw: inv as unknown as Record<string, unknown>,
    }));
    const payEvents: TimelineEvent[] = (payments?.data ?? []).map((p) => ({
      id: `pay-${p._id}`, date: p.payment_dt, kind: "payment",
      title: `Recharge · ₹${rupees(toNum(p.amt))}`, subtitle: `${p.payment_type} · ${p.channel} · ${p.status}`,
      amount: toNum(p.amt), raw: p as unknown as Record<string, unknown>,
    }));
    return [...billEvents, ...invoiceEvents, ...payEvents];
  }, [asc, history, payments]);

  // Recharge planner — lifespans + sweet-spot projection
  const lifespans = useMemo(() => {
    const sorted = [...(payments?.data ?? [])]
      .filter((p) => toNum(p.amt) > 0 && p.status === "Success")
      .sort((a, b) => new Date(a.payment_dt).getTime() - new Date(b.payment_dt).getTime());
    const out: { from: string; to: string; amt: number; days: number; txn: string }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const days = daysBetween(sorted[i].payment_dt, sorted[i + 1].payment_dt);
      if (days <= 0) continue;
      out.push({ from: sorted[i].payment_dt, to: sorted[i + 1].payment_dt, amt: toNum(sorted[i].amt), days, txn: sorted[i].txn_id });
    }
    return out;
  }, [payments]);
  const avgCostPerDay = dashboard?.runway.avg_daily_spend || (lifespans.length ? mean(lifespans.map((l) => l.amt / l.days)) : 0);
  const projectedRunway = avgCostPerDay > 0 ? amount / avgCostPerDay : 0;
  const maxSpanDays = Math.max(...lifespans.map((l) => l.days), 30);

  const exportCsv = () => {
    const rows = [
      ["date", "units_kwh", "daily_chg", "closing_bal", "energy", "fixed", "duty", "subsidy", "rebate"].join(","),
      ...asc.map((b) => [
        (b.dailyBill.usage_date ?? b.billDate).slice(0, 10),
        b.dailyBill.units_billed_daily, b.dailyBill.daily_chg, b.dailyBill.closing_bal,
        b.dailyBill.daily_en_chg, b.dailyBill.daily_fc_chg, b.dailyBill.daily_ed_chg,
        b.dailyBill.daily_gvt_subsidy, b.dailyBill.daily_rebate_chg,
      ].join(",")),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `uppcl-bills-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    push("CSV exported", { kind: "success" });
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <header>
        <div className="text-[11px] uppercase tracking-[0.24em] text-on-surface-variant sm:text-[10px]">Bills &amp; payments</div>
        <h1 className="mt-1 font-mono text-[28px] font-light tracking-tight text-on-surface sm:text-[32px]">Your bills, explained</h1>
        <p className="mt-1 max-w-[640px] text-[13px] text-on-surface-variant sm:text-[12px]">
          Effective ₹/unit, daily charge composition, subsidy, a recharge planner, and a timeline of every
          event that touched your meter.
        </p>
      </header>

      {/* Row 1 — effective rate + subsidy YTD */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Effective ₹/unit trend</div>
              <div className="mt-1 font-mono text-[22px] font-light text-on-surface sm:text-[26px]">
                ₹{effRateByMonth.length ? effRateByMonth[effRateByMonth.length - 1].rate.toFixed(2) : "—"}
              </div>
            </div>
            <Tooltip content={<div><div className="font-mono text-on-surface">Σ daily_en_chg / Σ units_billed_daily</div><div className="text-on-surface-variant">per month; energy component only.</div></div>}>
              <span className="cursor-help text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/70 underline decoration-dotted">how computed</span>
            </Tooltip>
          </div>
          {effRateByMonth.length ? (
            <LineChart
              height={220}
              format={(y) => `₹${y.toFixed(2)}`}
              yMin={0}
              yMax={Math.max(...effRateByMonth.map((m) => m.rate)) * 1.25 || 10}
              series={[{ label: "effective rate", color: chart.a, glow: true, points: effRateByMonth.map((m, i) => ({ x: i, y: m.rate, label: m.month })) }]}
              xFormat={(x) => effRateByMonth[Math.round(x)]?.month ?? ""}
            />
          ) : (
            <div className="py-16 text-center text-[11px] text-on-surface-variant">need at least one daily bill to compute</div>
          )}
        </section>

        <section className="flex flex-col items-center justify-center rounded-xl bg-surface-container-low p-5 sm:p-6">
          <Donut
            segments={[
              { label: "YTD subsidy", value: subsidyYtd, color: chart.a },
              { label: "remaining", value: Math.max(0, projectedAnnualSubsidy - subsidyYtd), color: "var(--color-surface-container)" },
            ]}
            size={180}
            stroke={12}
            centerValue={<>₹{rupees(subsidyYtd, { decimals: 0 })}</>}
            centerLabel="YTD saved"
          />
          <div className="mt-4 text-center text-[11px] text-on-surface-variant">
            projected annual ≈ ₹{rupees(projectedAnnualSubsidy, { decimals: 0 })}
          </div>
        </section>
      </div>

      {/* Row 2 — cost composition + slab usage */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Charge composition · last 30 days</div>
            <div className="font-mono text-[11px] text-on-surface-variant">₹{rupees(comp.total)} total</div>
          </div>
          {comp.total > 0 ? (
            <StackedBar
              total={comp.total}
              height={28}
              segments={[
                { label: "Energy", value: comp.energy, color: chart.a },
                { label: "Fixed", value: comp.fixed, color: chart.aSoft },
                { label: "Duty", value: comp.duty, color: chart.b },
                { label: "FPPA", value: comp.fppa, color: chart.bSoft },
                { label: "Subsidy", value: comp.subsidy, color: chart.a, sign: "neg" },
                { label: "Rebate", value: comp.rebate, color: chart.aSoft, sign: "neg" },
              ]}
            />
          ) : (
            <div className="py-10 text-center text-[11px] text-on-surface-variant">no bills yet</div>
          )}
        </section>

        <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
          <div className="mb-3 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Tariff slab usage</div>
          {totalUnits > 0 ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
              <Donut
                size={140}
                stroke={12}
                centerValue={<>{Math.round(totalUnits)}</>}
                centerLabel="kWh"
                segments={slabTotals.map((v, i) => ({ label: `slab ${i + 1}`, value: v, color: [chart.a, chart.aSoft, chart.b, chart.bSoft][i] }))}
              />
              <div className="flex-1 space-y-2">
                {slabTotals.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="h-2 w-2 rounded-sm" style={{ background: [chart.a, chart.aSoft, chart.b, chart.bSoft][i] }} />
                    <span className="text-on-surface-variant">Slab {i + 1}</span>
                    <span className="ml-auto font-mono text-on-surface">{v.toFixed(0)} kWh</span>
                    <span className="w-10 text-right font-mono text-on-surface-variant">{((v / totalUnits) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-[11px] text-on-surface-variant">no slab-differentiated units — flat tariff.</div>
          )}
        </section>
      </div>

      {/* Recharge planner */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-primary-fixed-dim">
          <Sparkles className="h-3 w-3" /> Recharge planner
        </div>
        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          <div className="flex flex-col justify-center">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">Recharge amount</span>
              <span className="font-mono text-[14px] text-primary-fixed-dim">₹{amount.toLocaleString("en-IN")}</span>
            </div>
            <input type="range" min={500} max={10000} step={500} value={amount} onChange={(e) => setAmount(parseInt(e.target.value))} className="mt-3 w-full accent-primary-fixed-dim" />
            <div className="mt-1 flex justify-between font-mono text-[9px] text-on-surface-variant/60"><span>₹500</span><span>₹5,000</span><span>₹10,000</span></div>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg bg-surface-container p-5 text-center">
            <div className="text-[10px] uppercase tracking-[0.26em] text-on-surface-variant">Projected runway</div>
            <div className="mt-2 font-mono text-[40px] font-light leading-none text-on-surface sm:text-[56px]">{projectedRunway > 0 ? projectedRunway.toFixed(0) : "—"}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-on-surface-variant/80">days of uptime</div>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-surface-container-lowest">
              <div className="h-full bg-primary-container transition-[width] duration-700" style={{ width: `${Math.min(100, (projectedRunway / 60) * 100)}%` }} />
            </div>
            <div className="mt-2 font-mono text-[10px] text-on-surface-variant">assumes ₹{avgCostPerDay.toFixed(2)}/day burn</div>
          </div>
        </div>
        {lifespans.length > 0 && (
          <div className="mt-6 border-t border-white/5 pt-4">
            <div className="mb-3 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Recharge lifespans</div>
            <div className="space-y-2">
              {[...lifespans].reverse().slice(0, 8).map((l) => (
                <Tooltip key={l.txn} content={<div><div className="font-mono text-on-surface">₹{rupees(l.amt)} · {l.days} days</div><div className="text-on-surface-variant">₹{(l.amt / l.days).toFixed(2)}/day effective</div></div>}>
                  <div className="flex flex-wrap items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-surface-container">
                    <div className="w-full font-mono text-[10px] text-on-surface-variant sm:w-40">
                      {new Date(l.from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – {new Date(l.to).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </div>
                    <div className="min-w-[160px] flex-1 overflow-hidden rounded-sm bg-surface-container">
                      <div className={"h-3 transition-[width] duration-700 " + (l.amt >= 5000 ? "bg-primary-container" : "bg-primary-fixed-dim")} style={{ width: `${(l.days / maxSpanDays) * 100}%` }} />
                    </div>
                    <div className="w-20 text-right font-mono text-[11px] text-on-surface">{l.days} days</div>
                    <div className="w-20 text-right font-mono text-[11px] text-on-surface-variant">₹{rupees(l.amt, { decimals: 0 })}</div>
                  </div>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Timeline */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="mb-1 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Unified event timeline</div>
        <h2 className="mb-4 font-mono text-[18px] text-on-surface">Every event that touched the meter</h2>
        <EventTimeline events={events} onSelect={setSelected} />
      </section>

      {/* Transaction ledger */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Transaction ledger · cost mapping</div>
            <p className="mt-1 text-[11px] text-on-surface-variant">last {asc.length} daily bills</p>
          </div>
          <button onClick={exportCsv} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-surface-container-high px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface transition hover:bg-surface-bright sm:w-auto">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 text-[12px]">
            <thead className="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
              <tr><Th>Date</Th><Th>kWh</Th><Th>Reading</Th><Th>Opening</Th><Th>Closing</Th><Th>Energy</Th><Th>Fixed</Th><Th>Duty</Th><Th>Subsidy</Th><Th>Total</Th></tr>
            </thead>
            <tbody className="font-mono">
              {[...asc].reverse().map((b) => <BillRow key={b._id} b={b} />)}
            </tbody>
          </table>
        </div>
      </section>

      <SidePanel open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? ""}
        subtitle={selected ? new Date(selected.date).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : undefined}>
        {selected && (
          <div className="space-y-2 font-mono text-[12px]">
            {Object.entries(selected.raw ?? {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 border-b border-white/5 pb-2">
                <span className="text-[11px] uppercase tracking-[0.14em] text-on-surface-variant">{k}</span>
                <span className="truncate text-right text-on-surface">{String(v ?? "—")}</span>
              </div>
            ))}
          </div>
        )}
      </SidePanel>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="sticky top-0 border-b border-white/5 px-3 py-2 text-left font-normal">{children}</th>;
}

function BillRow({ b }: { b: DailyBill }) {
  const db = b.dailyBill;
  const date = (db.usage_date ?? b.billDate).slice(0, 10);
  const td = "px-3 py-2 text-on-surface bg-surface-container-lowest hover:bg-surface-container transition-colors";
  const subsidy = toNum(db.daily_gvt_subsidy);
  return (
    <tr>
      <td className={td + " rounded-l-md"}>{date}</td>
      <td className={td}>{db.units_billed_daily}</td>
      <td className={td}>{db.reading_type ?? "—"}</td>
      <td className={td}>₹{db.opening_bal}</td>
      <td className={td}>₹{db.closing_bal}</td>
      <td className={td}>₹{db.daily_en_chg}</td>
      <td className={td}>₹{db.daily_fc_chg}</td>
      <td className={td}>₹{db.daily_ed_chg}</td>
      <td className={td + " text-primary-fixed-dim"}>{subsidy >= 0 ? `₹${subsidy.toFixed(2)}` : `−₹${Math.abs(subsidy).toFixed(2)}`}</td>
      <td className={td + " rounded-r-md text-on-surface"}>₹{db.daily_chg}</td>
    </tr>
  );
}
