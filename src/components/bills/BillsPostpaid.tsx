"use client";

import { useMemo, useState } from "react";
import {
  useInvoices,
  usePayments,
  useYearlyHistory,
  useDashboard,
  downloadBillPdf,
} from "@/lib/api";
import { SlabBar, UP_DOMESTIC_SLABS } from "@/components/viz/SlabBar";
import { Tooltip } from "@/components/ui/Tooltip";
import { useToast } from "@/components/ui/Toast";
import { toNum } from "@/lib/stats";
import { rupees, kwh, formatRelative } from "@/lib/utils";
import { Receipt, ArrowUpRight, Download } from "lucide-react";

/** Postpaid money hub: monthly invoices + official PDF download, tariff/slab,
 *  projected next bill, and payment history. */
export function BillsPostpaid() {
  const { data: invoicesResp } = useInvoices(24);
  const { data: payments } = usePayments(50);
  const { data: yearly } = useYearlyHistory();
  const { data: dashboard } = useDashboard();
  const { push } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function download(invoiceId: string) {
    setDownloadingId(invoiceId);
    try {
      await downloadBillPdf({ invoice_id: invoiceId });
      push("Bill PDF downloaded", { kind: "success" });
    } catch (e) {
      push((e as Error).message || "Could not download the bill", { kind: "error" });
    } finally {
      setDownloadingId(null);
    }
  }

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

  const pays = payments?.data ?? [];

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4">
      <header>
        <div className="text-[11px] uppercase tracking-[0.24em] text-on-surface-variant sm:text-[10px]">Bills &amp; payments</div>
        <h1 className="mt-1 font-mono text-[28px] font-light tracking-tight text-on-surface sm:text-[32px]">Your bills, explained</h1>
        <p className="mt-1 max-w-[640px] text-[13px] text-on-surface-variant sm:text-[12px]">
          Monthly invoices with one-tap official PDF download, your effective tariff and slab position,
          a projected next bill, and full payment history.
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
            <div className="text-[10px] text-on-surface-variant/70">
              Slab rates are indicative UP domestic (LMV-1) figures; your effective ₹/kWh is the authoritative
              number, derived from your actual bills.
            </div>
          </div>
        </div>
      </section>

      {/* Invoice history */}
      <section className="rounded-xl bg-surface-container-low p-5 sm:p-6">
        <div className="mb-4 text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Monthly bills</div>
        {invoices.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-1 text-[12px]">
              <thead className="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
                <tr><Th>Bill date</Th><Th>Period from</Th><Th>Amount</Th><Th>Due</Th><Th>Status</Th><Th>Invoice</Th><Th> </Th></tr>
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
                      <td className={td}>{inv.bill_from_dt ? new Date(inv.bill_from_dt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</td>
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
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.24em] text-on-surface-variant">Payment history</div>
          <a href="https://uppcl.sem.jio.com/uppclsmart/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant hover:text-on-surface">
            Pay on UPPCL <ArrowUpRight className="h-3 w-3" />
          </a>
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
          <div className="py-10 text-center text-[11px] text-on-surface-variant">No payments on file yet. Last paid {pays[0] ? formatRelative(pays[0].payment_dt) : "—"}.</div>
        )}
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="sticky top-0 border-b border-white/5 px-3 py-2 text-left font-normal">{children}</th>;
}
