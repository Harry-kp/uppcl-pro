"use client";

import { useMemo, useState } from "react";
import {
  useInvoices,
  usePayments,
  useYearlyHistory,
  useDashboard,
  useConsumption,
  useWssMeter,
  useWssArrears,
  downloadBillPdf,
  downloadReceiptPdf,
  downloadArrearsPdf,
} from "@/lib/api";
import { SlabBar, UP_DOMESTIC_SLABS } from "@/components/viz/SlabBar";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { toNum } from "@/lib/stats";
import { rupees, kwh, billingPeriod } from "@/lib/utils";
import { Receipt, ArrowUpRight, Download, Info, CalendarDays } from "lucide-react";

/** Postpaid money hub: monthly invoices + official PDF download, tariff/slab,
 *  projected next bill, payment history, and a document vault. */
export function BillsPostpaid() {
  const { data: invoicesResp } = useInvoices(24);
  const { data: payments } = usePayments(50);
  const { data: yearly } = useYearlyHistory();
  const { data: dashboard } = useDashboard();
  const { data: consResp } = useConsumption(90);
  const { data: meterResp } = useWssMeter();
  const { data: arrearsResp } = useWssArrears();
  const { push } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function downloadDoc(id: string, fn: () => Promise<void>, label: string) {
    setDownloadingId(id);
    try {
      await fn();
      push(`${label} downloaded`, { kind: "success" });
    } catch (e) {
      push((e as Error).message || `Could not download ${label.toLowerCase()}`, { kind: "error" });
    } finally {
      setDownloadingId(null);
    }
  }
  const download = (invoiceId: string) =>
    downloadDoc(invoiceId, () => downloadBillPdf({ invoice_id: invoiceId }), "Bill PDF");

  const tariffCategory = meterResp?.data?.purposeOfSupply;       // e.g. "LMV1"
  const arrearsAmt = toNum(arrearsResp?.data?.amount);

  const invoices = useMemo(
    () =>
      [...(invoicesResp?.data ?? [])]
        .filter((b) => b.invoice_id)
        .sort((a, b) => new Date(b.bill_dt).getTime() - new Date(a.bill_dt).getTime()),
    [invoicesResp]
  );

  const derived = useMemo(() => {
    const monthly = (yearly?.data ?? []).map((r) => ({
      t: String(r.energyImportKWH?.measureTime ?? ""),
      kwhVal: toNum(r.energyImportKWH?.value),
    }));
    const thisMonthKwh = monthly.at(-1)?.kwhVal ?? dashboard?.consumption_30d.kwh ?? 0;
    const avgDailyKwh = dashboard?.consumption_30d.avg_daily_kwh ?? 0;

    const lastInvoice = invoices.find((b) => Math.abs(toNum(b.bill_amt)) > 0);
    let effectiveRate = dashboard?.consumption_30d.effective_rate || 0;
    if (lastInvoice) {
      const m = monthly.find((r) => r.t && new Date(r.t).getMonth() === new Date(lastInvoice.bill_dt).getMonth());
      const billKwh = toNum(m?.kwhVal);
      if (billKwh > 0) effectiveRate = Math.abs(toNum(lastInvoice.bill_amt)) / billKwh;
    }
    if (!effectiveRate || !Number.isFinite(effectiveRate)) effectiveRate = 6.5;

    const projectedKwh = avgDailyKwh * 30;
    const projectedBill = projectedKwh * effectiveRate;
    return { thisMonthKwh, avgDailyKwh, effectiveRate, projectedKwh, projectedBill };
  }, [yearly, dashboard, invoices]);

  const { thisMonthKwh, avgDailyKwh, effectiveRate, projectedKwh, projectedBill } = derived;

  // Daily ledger — the granular per-day view postpaid lost, rebuilt from meter
  // telemetry. Surfaces fields UPPCL never shows: apparent energy (kVAh) and a
  // derived power factor (kWh ÷ kVAh, since the daily aggregate omits PF).
  const daily = useMemo(() => {
    const rows = [...(consResp?.data ?? [])]
      .map((r) => {
        const date = String(r.energyImportKWH?.measureTime ?? "").slice(0, 10);
        const kWh = toNum(r.energyImportKWH?.value);
        const kVAh = toNum(r.energyImportKVAH?.value);
        const peakKw = toNum(r.power?.value);
        const exportKwh = toNum(r.energyExportKWH?.value);
        const reportedPf = toNum(r.powerFactor?.value);
        const pf = reportedPf > 0 ? Math.min(1, reportedPf) : kVAh > 0 ? Math.min(1, kWh / kVAh) : null;
        return { date, kWh, kVAh, peakKw, exportKwh, pf, cost: kWh * effectiveRate };
      })
      .filter((r) => r.date && r.kWh > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
    const sumKwh = rows.reduce((s, r) => s + r.kWh, 0);
    return {
      rows,
      sumKwh,
      sumCost: rows.reduce((s, r) => s + r.cost, 0),
      avgKwh: rows.length ? sumKwh / rows.length : 0,
      hasExport: rows.some((r) => r.exportKwh > 0),
    };
  }, [consResp, effectiveRate]);

  function exportDailyCsv() {
    const head = ["date", "kwh", "peak_kw", "kvah", "power_factor", "est_cost_inr"];
    const lines = daily.rows.map((r) =>
      [r.date, r.kWh.toFixed(2), r.peakKw.toFixed(2), r.kVAh.toFixed(2), r.pf?.toFixed(3) ?? "", r.cost.toFixed(2)].join(",")
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uppcl-daily-usage-${daily.rows[0]?.date ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const pays = payments?.data ?? [];

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <header>
        <div className="text-[11px] uppercase tracking-[0.24em] text-on-surface-variant sm:text-[10px]">Bills &amp; payments</div>
        <h1 className="mt-1 font-mono text-[28px] font-light tracking-tight text-on-surface sm:text-[32px]">Your bills, explained</h1>
        <p className="mt-1 max-w-[680px] text-[13px] text-on-surface-variant sm:text-[12px]">
          Your smart meter bills a month in arrears — each bill covers the <span className="text-on-surface">previous month&apos;s</span> usage,
          and the amount payable is that month&apos;s charges minus any credit carried forward. Download any bill or receipt as an official PDF below.
        </p>
      </header>

      {/* Tariff & next bill */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
          <Receipt className="h-3 w-3" /> Tariff &amp; next bill
        </div>
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
          <div className="flex flex-col justify-center">
            <div className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">Your effective rate</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-[18px] text-primary-fixed-dim">₹</span>
              <Tooltip content={<div className="space-y-1"><div className="text-on-surface-variant">From your own bills:</div><div className="font-mono text-on-surface">last bill ₹ ÷ that month&apos;s kWh</div></div>}>
                <span className="cursor-help font-mono text-[44px] font-light leading-none tracking-tight text-on-surface animate-count-up">
                  {rupees(effectiveRate, { decimals: 2 })}
                </span>
              </Tooltip>
              <span className="text-[13px] text-on-surface-variant">/kWh</span>
            </div>
            <div className="mt-4 rounded-lg bg-surface-container p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
                Projected next bill
                <Tooltip content={<div className="space-y-1"><div className="font-mono text-on-surface">avg daily kWh × 30 × ₹/kWh</div><div className="text-on-surface-variant">Energy estimate only — your real bill also adds fixed charges, electricity duty and FPPA.</div></div>}>
                  <Info className="h-3 w-3 cursor-help text-on-surface-variant/70" />
                </Tooltip>
              </div>
              <div className="mt-1 font-mono text-[20px] text-on-surface">~₹{rupees(projectedBill, { decimals: 0 })}</div>
              <div className="mt-1 text-[11px] text-on-surface-variant">
                {kwh(avgDailyKwh)} kWh/day × 30 × ₹{rupees(effectiveRate, { decimals: 2 })} = {kwh(projectedKwh, 0)} kWh
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">
              <span>
                Tariff slab position
                {tariffCategory && <span className="ml-2 rounded-full bg-surface-container-high px-2 py-0.5 font-mono text-[10px] text-primary-fixed-dim">{tariffCategory}</span>}
              </span>
              <span className="font-mono">{kwh(thisMonthKwh, 0)} units this month</span>
            </div>
            <SlabBar units={thisMonthKwh} slabs={UP_DOMESTIC_SLABS} />
            <div className="text-[10px] text-on-surface-variant/70">
              {tariffCategory
                ? <>Official tariff category <span className="text-on-surface">{tariffCategory}</span> (UP domestic). Slab rates are indicative; your effective ₹/kWh above is derived from your actual bills.</>
                : <>Slab rates are indicative UP domestic (LMV-1) figures; your effective ₹/kWh above is the authoritative number.</>}
            </div>
          </div>
        </div>
      </section>

      {/* Daily usage & cost — the granular ledger postpaid lost, rebuilt from telemetry */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">
            <CalendarDays className="h-3 w-3" /> Daily usage &amp; cost
          </div>
          {daily.rows.length > 0 && (
            <button
              onClick={exportDailyCsv}
              className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface transition hover:bg-surface-bright"
            >
              <Download className="h-3 w-3" /> CSV
            </button>
          )}
        </div>
        <p className="max-w-[680px] text-[11px] text-on-surface-variant">
          Per-day energy, peak demand, apparent power (kVAh) and a derived power factor — detail UPPCL&apos;s postpaid view hides.
          Estimated cost ≈ each day&apos;s kWh × your ₹{rupees(effectiveRate, { decimals: 2 })}/kWh effective rate.
        </p>
        {daily.rows.length ? (
          <>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-on-surface-variant">
              <span><span className="text-on-surface">{daily.rows.length}</span> days</span>
              <span><span className="text-on-surface">{kwh(daily.sumKwh, 0)}</span> kWh</span>
              <span>~<span className="text-on-surface">₹{rupees(daily.sumCost, { decimals: 0 })}</span> est. energy cost</span>
              <span>avg <span className="text-on-surface">{kwh(daily.avgKwh)}</span> kWh/day</span>
            </div>
            <div className="mt-3 max-h-[440px] overflow-auto">
              <table className="w-full border-separate border-spacing-y-1 text-[12px]">
                <thead className="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
                  <tr>
                    <Th>Date</Th><Th>kWh</Th><Th>Peak kW</Th>
                    <Th>
                      <span className="inline-flex items-center gap-1">kVAh
                        <Tooltip content={<div className="max-w-[220px]">Apparent energy. The gap between kVAh and kWh is reactive (wasted) energy — the bigger the gap, the lower your power factor.</div>}>
                          <Info className="h-2.5 w-2.5 cursor-help text-on-surface-variant/60" />
                        </Tooltip>
                      </span>
                    </Th>
                    <Th>
                      <span className="inline-flex items-center gap-1">PF
                        <Tooltip content={<div className="max-w-[220px]">Power factor = kWh ÷ kVAh. Below 0.90 (amber) UPPCL levies a surcharge.</div>}>
                          <Info className="h-2.5 w-2.5 cursor-help text-on-surface-variant/60" />
                        </Tooltip>
                      </span>
                    </Th>
                    {daily.hasExport && <Th>Export</Th>}
                    <Th>Est. ₹</Th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {daily.rows.map((r) => {
                    const td = "px-3 py-1.5 bg-surface-container-lowest text-on-surface";
                    const lowPf = r.pf !== null && r.pf < 0.9;
                    return (
                      <tr key={r.date}>
                        <td className={td + " rounded-l-md"}>{new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                        <td className={td}>{kwh(r.kWh)}</td>
                        <td className={td + " text-on-surface-variant"}>{r.peakKw > 0 ? r.peakKw.toFixed(2) : "—"}</td>
                        <td className={td + " text-on-surface-variant"}>{r.kVAh > 0 ? r.kVAh.toFixed(1) : "—"}</td>
                        <td className={td + (lowPf ? " text-secondary" : " text-on-surface-variant")}>{r.pf !== null ? r.pf.toFixed(2) : "—"}</td>
                        {daily.hasExport && <td className={td + " text-primary-fixed-dim"}>{r.exportKwh > 0 ? kwh(r.exportKwh) : "—"}</td>}
                        <td className={td + " rounded-r-md"}>₹{rupees(r.cost, { decimals: 0 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="py-10 text-center text-[11px] text-on-surface-variant">
            No daily telemetry available — the meter aggregate serves roughly the last 150 days.
          </div>
        )}
      </section>

      {/* Invoice history */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="mb-4 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Monthly bills</div>
        {invoices.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-1 text-[12px]">
              <thead className="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
                <tr><Th>Bill date</Th><Th>Period</Th><Th>Amount</Th><Th>Due</Th><Th>Status</Th><Th>Invoice</Th><Th> </Th></tr>
              </thead>
              <tbody className="font-mono">
                {invoices.map((inv) => {
                  const amt = toNum(inv.bill_amt);
                  // Paid = a payment date exists. (payment_amt can differ slightly
                  // from bill_amt due to rounding/adjustments — outstanding is the truth.)
                  const paid = Boolean((inv.payment_dt || "").trim());
                  const credit = amt < 0;
                  const td = "px-3 py-2 bg-surface-container-lowest text-on-surface";
                  return (
                    <tr key={inv.invoice_id}>
                      <td className={td + " rounded-l-md"}>{new Date(inv.bill_dt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td className={td}>{billingPeriod(inv.bill_dt).label}</td>
                      <td className={td + (credit ? " text-primary-fixed-dim" : "")}>{credit ? `+₹${rupees(Math.abs(amt), { decimals: 0 })}` : `₹${rupees(amt, { decimals: 0 })}`}</td>
                      <td className={td}>{inv.due_dt ? new Date(inv.due_dt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</td>
                      <td className={td}>
                        <span className={"inline-flex rounded-full px-2 py-0.5 text-[10px] " + (credit ? "bg-primary-container/20 text-primary-fixed-dim" : paid ? "bg-primary-container/20 text-primary-fixed-dim" : "bg-secondary-container/30 text-secondary")}>
                          {credit ? "credit" : paid ? "paid" : "due"}
                        </span>
                      </td>
                      <td className={td + " truncate text-on-surface-variant"}>{inv.invoice_id}</td>
                      <td className={td + " rounded-r-md"}>
                        <button
                          onClick={() => download(inv.invoice_id)}
                          disabled={downloadingId === inv.invoice_id}
                          className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface transition hover:bg-surface-bright disabled:opacity-50"
                        >
                          <Download className="h-3 w-3" /> {downloadingId === inv.invoice_id ? "…" : "PDF"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-[11px] text-on-surface-variant">No monthly bills on file yet.</div>
        )}
      </section>

      {/* Payments */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Payment history</div>
          <div className="flex items-center gap-2">
            {arrearsAmt > 0 && (
              <button
                onClick={() => downloadDoc("arrears", downloadArrearsPdf, "Arrears statement")}
                disabled={downloadingId === "arrears"}
                className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-secondary transition hover:bg-surface-bright disabled:opacity-50"
              >
                <Download className="h-3 w-3" /> {downloadingId === "arrears" ? "…" : "Arrears statement"}
              </button>
            )}
            {pays.length > 0 && (
              <button
                onClick={() => downloadDoc("receipt", downloadReceiptPdf, "Receipt PDF")}
                disabled={downloadingId === "receipt"}
                className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface transition hover:bg-surface-bright disabled:opacity-50"
              >
                <Download className="h-3 w-3" /> {downloadingId === "receipt" ? "…" : "Last receipt"}
              </button>
            )}
            <a href="https://uppcl.sem.jio.com/uppclsmart/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant hover:text-on-surface">
              Pay on UPPCL <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </div>
        {pays.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-1 text-[12px]">
              <thead className="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
                <tr><Th>Date</Th><Th>Amount</Th><Th>Method</Th><Th>Status</Th><Th>txn ID</Th></tr>
              </thead>
              <tbody className="font-mono">
                {pays.map((p) => {
                  const td = "px-3 py-2 bg-surface-container-lowest text-on-surface";
                  return (
                    <tr key={p._id}>
                      <td className={td + " rounded-l-md"}>{new Date(p.payment_dt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td className={td + " text-primary-fixed-dim"}>₹{rupees(toNum(p.amt), { decimals: 0 })}</td>
                      <td className={td}>{p.payment_type} · {p.channel}</td>
                      <td className={td}>
                        <span className={"inline-flex rounded-full px-2 py-0.5 text-[10px] " + (p.status === "Success" ? "bg-primary-container/20 text-primary-fixed-dim" : "bg-secondary-container/30 text-secondary")}>{p.status}</span>
                      </td>
                      <td className={td + " rounded-r-md truncate text-on-surface-variant"}>{p.txn_id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-[11px] text-on-surface-variant">No payments on file yet.</div>
        )}
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="sticky top-0 z-10 border-b border-white/5 bg-surface-container-low px-3 py-2 text-left font-normal">{children}</th>;
}

