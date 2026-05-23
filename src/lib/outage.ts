import { DashboardResponse } from "@/lib/api";
import { mean, toNum } from "@/lib/stats";

export interface OutageContext {
  /** ISO timestamp of the most recent daily-bill usage_date we have. */
  lastReportAt: string | null;
  /** Hours since that timestamp. Usually 24–30 h in normal operation. */
  hoursSinceReport: number;
  /** Yesterday's daily-bill kWh, or null if no bills. */
  yesterdayKwh: number | null;
  /** 7-day trailing average (excluding yesterday), or null. */
  weeklyAvgKwh: number | null;
  /** How much yesterday differed from the 7-d avg, in %. */
  dropPct: number | null;
}

/**
 * Pure context — NO claims about whether power is out.
 *
 * Our upstream exposes only daily totals with a 24–30 h lag, so there is no
 * reliable real-time "meter alive" signal. This helper surfaces the raw facts
 * (last report time, yesterday vs average) for the user to interpret in the
 * Report-Outage panel; we deliberately do not render a banner or claim an
 * outage automatically.
 */
export function outageContext(data: DashboardResponse | undefined): OutageContext {
  if (!data) {
    return {
      lastReportAt: null,
      hoursSinceReport: 0,
      yesterdayKwh: null,
      weeklyAvgKwh: null,
      dropPct: null,
    };
  }
  const billsAsc = [...data.recent_bills].sort(
    (a, b) => new Date(a.billDate).getTime() - new Date(b.billDate).getTime()
  );
  const latestBill = billsAsc[billsAsc.length - 1];
  const lastReport = latestBill?.dailyBill.usage_date ?? data.balance.updated_at ?? null;
  const hoursSinceReport = lastReport
    ? Math.max(0, (Date.now() - new Date(lastReport).getTime()) / 3_600_000)
    : 0;

  const yUnitsRaw = latestBill ? toNum(latestBill.dailyBill.units_billed_daily) : NaN;
  const yesterdayKwh = Number.isFinite(yUnitsRaw) ? yUnitsRaw : null;

  const recent7 = billsAsc.slice(-8, -1).map((b) => toNum(b.dailyBill.units_billed_daily));
  const weeklyAvgKwh = recent7.length ? mean(recent7) : null;
  const dropPct =
    weeklyAvgKwh && weeklyAvgKwh > 0 && yesterdayKwh !== null
      ? Math.round((1 - yesterdayKwh / weeklyAvgKwh) * 100)
      : null;

  return { lastReportAt: lastReport, hoursSinceReport, yesterdayKwh, weeklyAvgKwh, dropPct };
}
