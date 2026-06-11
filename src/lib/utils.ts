import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function rupees(n: number | string | null | undefined, opts: { decimals?: number; sign?: boolean } = {}) {
  const { decimals = 2, sign = false } = opts;
  if (n === null || n === undefined || n === "") return "—";
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(v)) return "—";
  const s = v.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return sign && v > 0 ? `+${s}` : s;
}

export function kwh(n: number | string | null | undefined, decimals = 2) {
  if (n === null || n === undefined || n === "") return "—";
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/**
 * UPPCL smart-meter billing period for a given bill date.
 * Rule (from the official bill): the cycle is the FIRST→LAST day of the
 * *previous* calendar month — i.e. the bill dated early June covers May.
 * `bill_dt`/`bill_from_dt` from the API is the generation date, NOT the period.
 */
export function billingPeriod(billDt: string | Date): { label: string; from: Date; to: Date } {
  const d = typeof billDt === "string" ? new Date(billDt) : billDt;
  const to = new Date(d.getFullYear(), d.getMonth(), 1);        // 1st of the bill month
  const from = new Date(d.getFullYear(), d.getMonth() - 1, 1);  // 1st of the previous month
  const label = from.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return { label, from, to };
}

export function formatRelative(d: string | Date): string {
  const da = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  const diffMs = now.getTime() - da.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) {
    const hrs = Math.floor(diffMs / 3_600_000);
    if (hrs < 1) return "just now";
    return `${hrs} h ago`;
  }
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} d ago`;
  const months = Math.floor(days / 30);
  return `${months} mo ago`;
}
