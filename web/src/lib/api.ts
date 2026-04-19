/**
 * Typed client for the local FastAPI proxy (uppcl_api.py).
 * All responses passthrough upstream JSON shape: {code, message, data}.
 */
import useSWR from "swr";

/**
 * Where the FastAPI proxy lives.
 *
 *  - On Pi / production: set NEXT_PUBLIC_UPPCL_PROXY=/api at build time so
 *    requests go through the same-origin reverse proxy (Caddy).
 *  - In dev: default follows the page's own hostname on port 8000. This
 *    avoids the classic "the page is on 127.0.0.1 but the API is on
 *    localhost" IPv6/IPv4-loopback resolution mismatch, which bites
 *    Playwright captures and some older Chromium builds.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_UPPCL_PROXY ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000");

export class ProxyError extends Error {
  status: number;
  upstream?: unknown;
  constructor(status: number, message: string, upstream?: unknown) {
    super(message);
    this.status = status;
    this.upstream = upstream;
  }
}

async function fetcher<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  const text = await r.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!r.ok) {
    const detail =
      typeof body === "object" && body && "detail" in body
        ? (body as { detail: { message?: string; upstream?: unknown } }).detail
        : undefined;
    throw new ProxyError(
      r.status,
      detail?.message || `HTTP ${r.status}`,
      detail?.upstream
    );
  }
  return body as T;
}

/* ── Types ─────────────────────────────────────────────────────── */

export interface UpstreamEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export interface Health {
  ok: boolean;
  authenticated: boolean;
  tenant: string;
  jwt_expires_ms: number;
  jwt_expires_in_days: number | null;
  oaep_hash_in_use: string;
}

export interface Site {
  _id: string;
  connectionId: string;
  deviceId: string;
  tenantId: string;
  tenantCode: string;
  name: string;
  customerName: string;
  address: string;
  pincode: string;
  sanctionedLoad: string;
  connectionType: string;
  meterInstallationNumber: string;
  meterPhase: string;
  meterType: string;
}

export interface BalanceResponse {
  source: "prepaidBalance" | "latest-daily-bill" | "outstandingBalance" | null;
  note: string;
  data:
    | {
        connectionId?: string;
        prepaidBalanceAmount?: string;
        prepaidBalanceUpdateDate?: string;
        meterStatus?: string;
        recharge?: string;
        msi?: string;
        outstandingAmount?: string;
        lastDailyCharge?: string;
      }
    | null;
}

export interface DailyBill {
  _id: string;
  connectionId: string;
  billDate: string;
  dailyBill: {
    consumer_id: string;
    meter_no: string;
    usage_date: string;
    units_billed_daily: string;
    day_end_reading: string;
    opening_bal: string;
    closing_bal: string;
    daily_chg: string;
    daily_en_chg: string;
    daily_fc_chg: string;
    daily_gvt_subsidy: string;
    daily_ed_chg: string;
    daily_rebate_chg: string;
    cum_gvt_subsidy: string;
    max_demand: string;
    fppa_charges: string;
    [k: string]: string | null | undefined;
  };
}

export interface Payment {
  _id: string;
  consumer_id: string;
  installation_no: string;
  status: string;
  payment_dt: string;
  txn_id: string;
  amt: string;
  payment_type: string;
  channel: string;
  msi: string;
  tenantCode: string;
  tenantId: string;
  tenant?: string;
  connectionTransactionId?: string;
}

export interface ConsumptionRow {
  energyImportKWH: { unit: string; value: number | string; measureTime: string };
  energyImportKVAH: { unit: string; value: number | string; measureTime: string };
  energyExportKWH: { unit: string; value: number | string; measureTime: string };
  power: { unit: string; value: number | string; measureTime: string };
  powerKVA?: { unit: string; value: number | string; measureTime: string };
  powerFactor?: { unit: string; value: number | string; measureTime: string };
}

export interface BillInvoice {
  invoice_id: string;
  bill_from_dt: string;
  bill_amt: string;
  due_dt: string;
  bill_dt: string;
  payment_dt: string;
  payment_amt: string;
}

export interface DashboardResponse {
  site: Site;
  balance: {
    inr: number;
    updated_at: string | null;
    meter_status: string | null;
    arrears_inr: number;
    last_recharge: number;
  };
  runway: {
    days: number | null;
    avg_daily_spend: number;
    basis_days: number;
  };
  consumption_30d: {
    kwh: number;
    avg_daily_kwh: number;
    effective_rate: number | null;
    daily: ConsumptionRow[];
  };
  subsidy_ytd_inr: number;
  recharge_lifespans: Array<{ amount: number; lasted_days: number; txn: string }>;
  recent_bills: DailyBill[];
  recent_payments: Payment[];
}

/* ── SWR hooks ─────────────────────────────────────────────────── */

const swrOpts = {
  revalidateOnFocus: false,
  revalidateIfStale: false,
  dedupingInterval: 15_000,
};

export const useHealth = () =>
  useSWR<Health>("/health", fetcher, { ...swrOpts, refreshInterval: 60_000 });

export const useDashboard = () =>
  useSWR<DashboardResponse>("/dashboard", fetcher, swrOpts);

export const useBalance = () =>
  useSWR<BalanceResponse>("/balance", fetcher, swrOpts);

/** Upstream /site/outstandingBalance — reliable source for `msi`. */
export const useOutstanding = () =>
  useSWR<UpstreamEnvelope<{ consumerId: string; outstandingAmount: string; msi: string }>>(
    "/balance/outstanding",
    fetcher,
    swrOpts
  );

export const useSites = () =>
  useSWR<UpstreamEnvelope<Site[]>>("/sites", fetcher, swrOpts);

export interface MeUser {
  _id: string;
  phone: string;
  phoneCountryCode: string;
  username: string;
  name?: string;
}

export const useMe = () =>
  useSWR<UpstreamEnvelope<MeUser[]>>("/me", fetcher, swrOpts);

export const useBills = (days = 90) =>
  useSWR<UpstreamEnvelope<DailyBill[]>>(`/bills?days=${days}&limit=${days}`, fetcher, swrOpts);

export const useBillHistory = (limit = 12) =>
  useSWR<UpstreamEnvelope<BillInvoice[]>>(`/bills/history?limit=${limit}`, fetcher, swrOpts);

export const usePayments = (limit = 50) =>
  useSWR<UpstreamEnvelope<Payment[]>>(`/payments?limit=${limit}`, fetcher, swrOpts);

export const useConsumption = (days = 30) =>
  useSWR<UpstreamEnvelope<ConsumptionRow[]>>(`/consumption?days=${days}`, fetcher, swrOpts);

export const useYearlyHistory = (year?: number) =>
  useSWR<UpstreamEnvelope<ConsumptionRow[]>>(
    year ? `/history/yearly?year=${year}` : "/history/yearly",
    fetcher,
    swrOpts
  );

/* ── Complaint portal (appsavy) ───────────────────────────────── */

export interface ComplaintSummary {
  data_id: string;
  complaint_no: string;
  type: string;
  sub_type: string;
  mobile_no: string;
  status: string;
  is_open: boolean;
}

export interface ComplaintDetail {
  data_id: string;
  complaint_no: string;
  status: string;
  is_open: boolean;
  entry_date: string | null;
  closing_date: string | null;
  consumer_name: string | null;
  mobile_no: string | null;
  address: string | null;
  customer_account: string | null;
  remarks: string | null;
  closing_remarks: string | null;
  closed_by: string | null;
  type: string | null;
  sub_type: string | null;
  source: string | null;
  je_name: string | null;
  je_mobile: string | null;
  ae_name: string | null;
  ae_mobile: string | null;
  xen_name: string | null;
  xen_mobile: string | null;
  subdivision: string | null;
  substation: string | null;
  assigned_to: string | null;
  base_level: string | null;
  initial_user: string | null;
  raw_fields: Record<string, string>;
}

export const useComplaintList = (phone: string | null) =>
  useSWR<{ phone: string; complaints: ComplaintSummary[] }>(
    phone ? `/complaints/list?phone=${phone}` : null,
    fetcher,
    { ...swrOpts, revalidateOnFocus: true }
  );

/** Batched: list + all details in one call, newest-first. For dashboard use. */
export const useMyComplaints = (phone: string | null | undefined) =>
  useSWR<{ phone: string; complaints: ComplaintDetail[] }>(
    phone ? `/complaints/my?phone=${phone}` : null,
    fetcher,
    { ...swrOpts, revalidateOnFocus: true }
  );

export const useComplaintDetail = (dataId: string | null) =>
  useSWR<ComplaintDetail>(
    dataId ? `/complaints/detail?data_id=${dataId}` : null,
    fetcher,
    swrOpts
  );

/* ── Commands (used by the command palette) ───────────────────── */

export async function login(username: string, password: string) {
  const r = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const text = await r.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!r.ok) {
    const detail =
      typeof body === "object" && body && "detail" in body
        ? (body as { detail: { message?: string; upstream?: unknown } }).detail
        : undefined;
    throw new ProxyError(
      r.status,
      detail?.message || (r.status === 401 ? "Invalid username or password" : `Login failed (HTTP ${r.status})`),
      detail?.upstream
    );
  }
  return body;
}

export async function logout() {
  await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
}
