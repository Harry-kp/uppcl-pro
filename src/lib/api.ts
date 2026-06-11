/**
 * UPPCL SMART API client — runs entirely in the browser.
 *
 * JWT lives in sessionStorage — the server never sees or stores it.
 * The Next.js API route at /api/uppcl/* is a stateless CORS-bypass pipe.
 *
 * UPPCL dropped RSA-OAEP + AES-GCM encryption — all endpoints accept
 * plaintext JSON now. Only ALTCHA proof-of-work is still needed for login.
 */
import useSWR, { mutate as globalMutate } from "swr";
import { solveAltcha, type AltchaChallenge } from "./crypto";
import {
  getSession,
  saveSession,
  clearSession,
  isAuthenticated,
  getJwt,

  getSite,
  setSite,
  jwtExpiresInDays,
  type SiteRecord,
} from "./session";

// ─── Constants ────────────────────────────────────────────────────────────────

// NOT a secret — this is a public client ID baked into UPPCL's own JavaScript
// bundle at uppcl.sem.jio.com. Every user of the official UPPCL SMART website
// sends this same key. It identifies the app, not the user.
const UPPCL_API_KEY = "5ab6ef2e-5051-4923-aa65-dc82883af26b";
const DEFAULT_TENANT = "b3ba0ab0-05bc-11f0-bf77-932b3a8bb3cd";
const IST_OFFSET = "+05:30";

function ist(d: Date): string {
  return `${d.toISOString().split("T")[0]}T00:00:00${IST_OFFSET}`;
}

/** End-of-day IST timestamp — UPPCL's eventsummary `to` wants 23:59:59, not 00:00:00. */
function istEnd(d: Date): string {
  return `${d.toISOString().split("T")[0]}T23:59:59${IST_OFFSET}`;
}

/** Human date like "01 Jun 2025" — the format bill/billHistory expects for from/to. */
function humanDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function tenantHeader(tenant: string): string {
  return JSON.stringify({ isMultiLevel: true, code: tenant });
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class ProxyError extends Error {
  status: number;
  upstream?: unknown;
  constructor(status: number, message: string, upstream?: unknown) {
    super(humanizeError(status, message));
    this.status = status;
    this.upstream = upstream;
  }
}

/** Map developer-facing upstream errors to messages a normal user can act on. */
function humanizeError(status: number, raw: string): string {
  const lower = raw.toLowerCase();
  if (status === 401 || status === 403) return "Session expired. Please sign in again.";
  if (lower.includes("tenant id is missing")) return "Could not load your data. Try signing out and back in.";
  if (lower.includes("missing login params")) return "Login failed. Please check your credentials.";
  if (lower.includes("wrong captcha")) return "Verification failed. Please try again.";
  if (lower.includes("invalid credentials") || lower.includes("invalid username")) return "Invalid username or password.";
  if (lower.includes("network") || lower.includes("fetch failed")) return "Network error — check your internet connection.";
  if (lower.includes("timeout")) return "Request timed out. UPPCL servers may be slow — try again.";
  if (status === 502 || status === 503 || status === 504) return "UPPCL servers are temporarily unavailable. Try again in a few minutes.";
  if (status === 409) return "Request rejected by UPPCL. Try signing out and back in.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status >= 500) return "Something went wrong on UPPCL's end. Try again later.";
  return raw;
}

// ─── Core: POST to UPPCL via our CORS-proxy route ────────────────────────────
// UPPCL dropped encryption — all endpoints accept plaintext JSON now.

/**
 * POST to a UPPCL API base via our CORS-proxy route.
 * `base` selects the upstream: "uppcl" → /accounts/api, "bootstrap" → /bootstrap/api.
 * `extraHeaders` lets callers add e.g. `subtenantcode` (needed by bill/download, insight).
 */
async function proxy_post(
  base: "uppcl" | "bootstrap",
  path: string,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Promise<unknown> {
  const jwt = getJwt();
  if (!jwt) throw new ProxyError(401, "No active session — sign in first");

  const session = getSession()!;

  const r = await fetch(`/api/${base}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: UPPCL_API_KEY,
      tenantid: tenantHeader(session.tenant),
      token: jwt,
      authorization: `Bearer ${jwt}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (r.status === 200) {
    return r.json();
  }

  if (r.status === 401 || r.status === 403) {
    clearSession();
    // Immediately tell Shell to show the login gate (don't wait for 60s poll)
    globalMutate("/health");
    throw new ProxyError(401, "Session expired — sign in again");
  }

  const text = await r.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  const msg = typeof parsed === "object" && parsed && "message" in parsed
    ? (parsed as { message: string }).message
    : text.slice(0, 200);
  throw new ProxyError(r.status, msg, parsed);
}

async function uppcl_post(
  path: string,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Promise<unknown> {
  return proxy_post("uppcl", path, body, extraHeaders);
}

/** GET against /accounts/api (a few endpoints — e.g. downtime — are GET-only). */
async function uppcl_get(path: string): Promise<unknown> {
  const jwt = getJwt();
  if (!jwt) throw new ProxyError(401, "No active session — sign in first");
  const session = getSession()!;

  const r = await fetch(`/api/uppcl/${path}`, {
    headers: {
      apikey: UPPCL_API_KEY,
      tenantid: tenantHeader(session.tenant),
      token: jwt,
      authorization: `Bearer ${jwt}`,
    },
    cache: "no-store",
  });

  if (r.status === 200) return r.json();
  if (r.status === 401 || r.status === 403) {
    clearSession();
    globalMutate("/health");
    throw new ProxyError(401, "Session expired — sign in again");
  }
  const text = await r.text();
  throw new ProxyError(r.status, text.slice(0, 200));
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(username: string, password: string): Promise<void> {
  // 1. Fetch ALTCHA challenge
  const altchaR = await fetch(`/api/uppcl/altcha/createAltCaptcha`, {
    headers: { apikey: UPPCL_API_KEY, tenantid: tenantHeader(DEFAULT_TENANT) },
    cache: "no-store",
  });
  if (!altchaR.ok) throw new ProxyError(altchaR.status, "Failed to fetch ALTCHA challenge");
  const challenge: AltchaChallenge = await altchaR.json();

  // 2. Solve proof-of-work
  const captchaToken = await solveAltcha(challenge);

  // 3. Send plaintext login (UPPCL login endpoint does not use encryption)
  const r = await fetch("/api/uppcl/auth/v2/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: UPPCL_API_KEY,
      tenantid: tenantHeader(DEFAULT_TENANT),
      captchatoken: captchaToken,
    },
    body: JSON.stringify({ username, password, roleType: "user" }),
    cache: "no-store",
  });

  if (r.status === 200) {
    const json = await r.json();
    const data = json.data;
    saveSession({
      jwt: data.token,
      jwtExpiresMs: data.expires,
      tenant: data.user?.tenantCode ?? DEFAULT_TENANT,

    });
    return;
  }

  const text = await r.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  const msg =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>).message ?? (parsed as Record<string, unknown>).error
      : null;
  throw new ProxyError(
    r.status,
    r.status === 401
      ? "Invalid username or password"
      : msg ? `${msg}` : `Login failed (HTTP ${r.status})`,
    parsed
  );
}

export async function logout(): Promise<void> {
  clearSession();
}

/**
 * Resolve the official bill PDF download link for a monthly invoice.
 * Requires the `subtenantcode` header (= site.tenantCode) plus billNo + date + discom.
 * Returns a tokenized URL on UPPCL's consumer portal. See RE doc §7.
 */
export async function billDownloadLink(invoice: { invoice_id: string; bill_dt: string }): Promise<string> {
  const site = await primarySite();
  const date = (invoice.bill_dt ?? "").split("T")[0]; // YYYY-MM-DD
  const resp = (await uppcl_post(
    "bill/download",
    {
      billNo: invoice.invoice_id,
      connectionId: site.connectionId,
      tenantId: site.tenantId,
      date,
      discom: site.discom,
    },
    { subtenantcode: site.tenantCode }
  )) as { data?: string };
  if (!resp.data) throw new ProxyError(404, "Bill download link unavailable");
  return resp.data;
}

// ─── Data fetchers (mirror the old Python proxy endpoints) ────────────────────

async function sites(): Promise<unknown> {
  return uppcl_post("site/search", { skip: 0, limit: 50 });
}

async function primarySite(): Promise<SiteRecord> {
  const cached = getSite();
  if (cached) return cached;
  const resp = (await sites()) as { data: SiteRecord[] };
  if (!resp.data?.length) throw new ProxyError(404, "No sites on this account");
  const site = resp.data[0];
  setSite(site);
  return site;
}

function ids(site: SiteRecord): { cid: string; did: string; tid: string } {
  return { cid: site.connectionId, did: site.deviceId, tid: site.tenantId };
}

// ─── SWR fetcher ──────────────────────────────────────────────────────────────

/**
 * SWR fetcher keyed by a string tag. Calls the appropriate UPPCL endpoint
 * with encryption, or the complaints API route.
 */
async function fetcher<T>(key: string): Promise<T> {
  // Complaints go to our server-side route (anonymous, no user creds)
  if (key.startsWith("/complaints")) {
    const r = await fetch(`/api${key}`, { cache: "no-store" });
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      throw new ProxyError(r.status, body?.error ?? `HTTP ${r.status}`, body);
    }
    return r.json() as Promise<T>;
  }

  // Health is client-side only
  if (key === "/health") {
    return {
      ok: true,
      authenticated: isAuthenticated(),
      tenant: getSession()?.tenant ?? DEFAULT_TENANT,
      jwt_expires_ms: getSession()?.jwtExpiresMs ?? 0,
      jwt_expires_in_days: jwtExpiresInDays(),

    } as T;
  }

  // Everything else requires auth
  if (!isAuthenticated()) {
    throw new ProxyError(401, "Not authenticated");
  }

  const site = await primarySite();
  const { cid, did, tid } = ids(site);
  const today = new Date();

  // Route to the correct UPPCL endpoint
  if (key === "/dashboard") return fetchDashboard(site, cid, did, tid) as Promise<T>;
  if (key === "/sites") return sites() as Promise<T>;
  if (key === "/me") return uppcl_post("user/search", { skip: 0, limit: 10 }) as Promise<T>;
  if (key === "/balance") return fetchBalance(cid, tid) as Promise<T>;
  if (key === "/balance/outstanding") return uppcl_post("site/outstandingBalance", { connectionId: cid, tenantId: tid }) as Promise<T>;
  if (key === "/preferences") return uppcl_post("userpreference/search", { skip: 0, limit: 10 }) as Promise<T>;
  if (key === "/session") return uppcl_post("auth/session-check", {}) as Promise<T>;

  // Parameterized endpoints
  const url = new URL(key, "http://x");
  const params = url.searchParams;

  if (key.startsWith("/bills/history")) {
    const limit = parseInt(params.get("limit") ?? "12");
    return uppcl_post("bill/billHistory", { consumerId: cid, tenantId: tid, skip: 0, limit }) as Promise<T>;
  }

  if (key.startsWith("/bills")) {
    const days = parseInt(params.get("days") ?? "90");
    const limit = parseInt(params.get("limit") ?? String(days));
    const start = daysAgo(days).toISOString().split("T")[0];
    const end = today.toISOString().split("T")[0];
    return uppcl_post("bill/search", { skip: 0, limit, tenantId: tid, connectionId: cid, from: start, to: end }) as Promise<T>;
  }

  if (key.startsWith("/payments")) {
    const limit = parseInt(params.get("limit") ?? "50");
    return uppcl_post("payment/v2/search", { skip: 0, limit, tenantId: tid, consumer_id: cid }) as Promise<T>;
  }

  if (key.startsWith("/consumption/stats")) {
    // Avg / max consumption + peak power for a month (eventsummary/consumptionAggregation).
    const month = params.get("month") ?? pad2(today.getMonth() + 1);
    const year = params.get("year") ?? String(today.getFullYear());
    return uppcl_post("eventsummary/consumptionAggregation", { deviceId: did, tenantId: tid, groupBy: "month", uom: "KWH", month, year }) as Promise<T>;
  }

  if (key.startsWith("/consumption")) {
    const days = parseInt(params.get("days") ?? "30");
    const uom = params.get("uom") ?? "KWH";
    return uppcl_post("eventsummary/aggregate", { deviceId: did, tenantId: tid, from: ist(daysAgo(days)), to: istEnd(today), uom }) as Promise<T>;
  }

  if (key.startsWith("/history/yearly")) {
    const year = parseInt(params.get("year") ?? String(today.getFullYear()));
    return uppcl_post("eventsummary/search", { deviceId: did, tenantId: tid, groupBy: "year", year: String(year), uom: "KWH" }) as Promise<T>;
  }

  // ── Postpaid bills (monthly invoices) ──────────────────────────────
  if (key.startsWith("/bills/latest")) {
    // Single latest monthly invoice (fetchLatestBill:true → object, not array).
    const from = humanDate(daysAgo(13 * 31));
    const to = humanDate(today);
    return uppcl_post("bill/billHistory", { type: "monthlyBill", from, to, tenantId: tid, fetchLatestBill: true, consumerId: cid }) as Promise<T>;
  }

  if (key.startsWith("/bills/invoices")) {
    // Full monthly invoice history (no fetchLatestBill → array). See RE doc §7.
    const monthsBack = parseInt(params.get("months") ?? "18");
    const from = humanDate(daysAgo(monthsBack * 31));
    const to = humanDate(today);
    return uppcl_post("bill/billHistory", { type: "monthlyBill", from, to, tenantId: tid, consumerId: cid }) as Promise<T>;
  }

  // ── Power-quality / usage stats, alarms, alerts, native tickets ────
  if (key.startsWith("/alarms")) {
    return uppcl_post("alarms/search", { connectionId: cid, tenantId: tid, startDate: daysAgo(30).toISOString(), endDate: today.toISOString() }) as Promise<T>;
  }

  if (key.startsWith("/alerts")) {
    return uppcl_post("alert/search", { userId: String(site.userId ?? ""), startDate: daysAgo(30).toISOString(), endDate: today.toISOString() }) as Promise<T>;
  }

  if (key.startsWith("/tickets")) {
    const status = params.get("status") ?? "open";
    return uppcl_post("ticket/search", { status, userId: String(site.userId ?? "") }) as Promise<T>;
  }

  if (key.startsWith("/tips")) {
    const appliance = params.get("appliance") ?? "others";
    return uppcl_post("savingTip/getOne", { appliance }) as Promise<T>;
  }

  if (key === "/tenant-preferences") {
    return proxy_post("bootstrap", "tenant/searchPreference", { tenantId: tid }) as Promise<T>;
  }

  if (key === "/downtime") {
    return uppcl_get("announcements/activeDowntimeAnnouncement") as Promise<T>;
  }

  if (key.startsWith("/appliances")) {
    // Appliance-level disaggregation ("DaData"). Empty until UPPCL's model has data.
    const start = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-01`;
    const end = today.toISOString().split("T")[0];
    return uppcl_post("dadata/v2/search", { deviceId: did, compare: "month", fromDate: start, toDate: end, tenantId: tid }) as Promise<T>;
  }

  if (key.startsWith("/dadata")) {
    const limit = parseInt(params.get("limit") ?? "10");
    return uppcl_post("dadata/v2/search", { deviceId: did, tenantId: tid, skip: 0, limit }) as Promise<T>;
  }

  if (key === "/budget") {
    return uppcl_post("connectionbudget/search", { tenantId: tid, connectionId: cid, skip: 0, limit: 10 }) as Promise<T>;
  }

  throw new ProxyError(404, `Unknown key: ${key}`);
}

// ─── Balance with fallback chain ──────────────────────────────────────────────

async function fetchBalance(cid: string, tid: string): Promise<unknown> {
  // 1) Live meter balance
  const live = (await uppcl_post("site/prepaidBalance?fetchCache=false", { connectionId: cid })) as { data?: unknown };
  if (live.data) {
    return { source: "prepaidBalance", note: "Live meter balance — authoritative.", data: live.data };
  }

  // 2) Latest daily bill
  const end = new Date().toISOString().split("T")[0];
  const start = daysAgo(7).toISOString().split("T")[0];
  const bills = (await uppcl_post("bill/search", { skip: 0, limit: 5, tenantId: tid, connectionId: cid, from: start, to: end })) as { data?: Array<{ dailyBill?: Record<string, string>; billDate?: string }> };
  if (bills.data?.length) {
    const latest = bills.data[0];
    const db = latest.dailyBill ?? {};
    return {
      source: "latest-daily-bill",
      note: "Derived from yesterday's bill closing balance.",
      data: {
        connectionId: cid,
        prepaidBalanceAmount: db.closing_bal,
        prepaidBalanceUpdateDate: db.usage_date ?? latest.billDate,
        lastDailyCharge: db.daily_chg,
      },
    };
  }

  // 3) Outstanding
  const outs = (await uppcl_post("site/outstandingBalance", { connectionId: cid, tenantId: tid })) as { data?: { outstandingAmount?: string; consumerId?: string; msi?: string } };
  if (outs.data?.outstandingAmount != null) {
    const amt = parseFloat(outs.data.outstandingAmount) || 0;
    return {
      source: "outstandingBalance",
      note: "Billing-system credit as of last invoice — may be stale.",
      data: {
        connectionId: outs.data.consumerId,
        msi: outs.data.msi,
        outstandingAmount: outs.data.outstandingAmount,
        prepaidBalanceAmount: amt < 0 ? (-amt).toFixed(2) : "0.00",
      },
    };
  }

  return { source: null, data: null, note: "No source produced data — try re-login." };
}

// ─── Dashboard composite ──────────────────────────────────────────────────────

function safeFloat(x: unknown, def = 0): number {
  const n = parseFloat(String(x));
  return isNaN(n) ? def : n;
}

async function fetchDashboard(
  site: SiteRecord,
  cid: string,
  did: string,
  tid: string
): Promise<unknown> {
  const today = new Date();
  const start90 = daysAgo(90).toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];

  const [balResp, billsResp, paysResp, dailyResp] = await Promise.all([
    uppcl_post("site/prepaidBalance?fetchCache=false", { connectionId: cid }).catch(() => ({ data: null })) as Promise<{ data: unknown }>,
    uppcl_post("bill/search", { skip: 0, limit: 60, tenantId: tid, connectionId: cid, from: start90, to: todayStr }) as Promise<{ data: Array<Record<string, unknown>> }>,
    uppcl_post("payment/v2/search", { skip: 0, limit: 20, tenantId: tid, consumer_id: cid }) as Promise<{ data: Array<Record<string, unknown>> }>,
    uppcl_post("eventsummary/aggregate", { deviceId: did, tenantId: tid, from: ist(daysAgo(30)), to: ist(today) }) as Promise<{ data: Array<Record<string, unknown>> }>,
  ]);

  let bal: Record<string, unknown> = (balResp.data ?? {}) as Record<string, unknown>;
  const bills = billsResp.data ?? [];
  const pays = paysResp.data ?? [];
  const daily = dailyResp.data ?? [];

  // Fallback when prepaidBalance returns empty
  if (!bal || Object.keys(bal).length === 0) {
    if (bills.length) {
      const db = (bills[0] as Record<string, unknown>).dailyBill as Record<string, string> | undefined ?? {};
      bal = {
        prepaidBalanceAmount: db.closing_bal,
        prepaidBalanceUpdateDate: db.usage_date,
        meterStatus: null,
        postpaidArrearAmount: "0",
        recharge: null,
      };
    }
  }

  // Derived metrics
  const dailyCharges = bills
    .map((b) => safeFloat(((b as Record<string, unknown>).dailyBill as Record<string, string>)?.daily_chg))
    .filter((x) => x > 0);
  const avgBurn = dailyCharges.length ? Math.round((dailyCharges.reduce((a, b) => a + b, 0) / dailyCharges.length) * 100) / 100 : 0;
  const latestBal = safeFloat(bal.prepaidBalanceAmount);
  const daysRunway = avgBurn > 0 ? Math.round((latestBal / avgBurn) * 10) / 10 : null;

  const kwh30 = Math.round(
    daily.reduce((sum, d) => sum + safeFloat(((d as Record<string, unknown>).energyImportKWH as Record<string, unknown>)?.value), 0) * 100
  ) / 100;

  // Subsidy YTD
  const subsidyYtd = bills.length
    ? Math.round(Math.abs(safeFloat((bills[0] as Record<string, unknown>).dailyBill && ((bills[0] as Record<string, unknown>).dailyBill as Record<string, string>).cum_gvt_subsidy)) * 100) / 100
    : 0;

  // Recharge lifespans
  const recharges = pays
    .filter((p) => safeFloat(p.amt) > 0)
    .map((p) => ({ date: p.payment_dt as string, amount: safeFloat(p.amt), txn: p.txn_id as string }))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const lifespans: Array<{ amount: number; lasted_days: number; txn: string }> = [];
  for (let i = 0; i < recharges.length - 1; i++) {
    try {
      const d1 = new Date(recharges[i].date);
      const d2 = new Date(recharges[i + 1].date);
      const days = Math.round(((d2.getTime() - d1.getTime()) / 86_400_000) * 10) / 10;
      lifespans.push({ amount: recharges[i].amount, lasted_days: days, txn: recharges[i].txn });
    } catch { /* skip */ }
  }

  // Effective rate
  const recentBill = bills[0] ? ((bills[0] as Record<string, unknown>).dailyBill as Record<string, string>) : {};
  const units = safeFloat(recentBill?.units_billed_daily);
  const energy = safeFloat(recentBill?.daily_en_chg);
  const effRate = units > 0 ? Math.round((energy / units) * 100) / 100 : null;

  return {
    site,
    balance: {
      inr: latestBal,
      updated_at: bal.prepaidBalanceUpdateDate ?? null,
      meter_status: bal.meterStatus ?? null,
      arrears_inr: safeFloat(bal.postpaidArrearAmount),
      last_recharge: safeFloat(bal.recharge),
    },
    runway: {
      days: daysRunway,
      avg_daily_spend: avgBurn,
      basis_days: dailyCharges.length,
    },
    consumption_30d: {
      kwh: kwh30,
      avg_daily_kwh: Math.round((kwh30 / Math.max(daily.length, 1)) * 100) / 100,
      effective_rate: effRate,
      daily,
    },
    subsidy_ytd_inr: subsidyYtd,
    recharge_lifespans: lifespans.slice(-10),
    recent_bills: bills.slice(0, 10),
    recent_payments: pays.slice(0, 10),
  };
}

/* ── Types (unchanged from original) ──────────────────────────── */

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

}

export interface Site {
  _id: string;
  connectionId: string;
  deviceId: string;
  tenantId: string;
  tenantCode: string;
  discom: string;
  userId: string;
  name: string;
  customerName: string;
  address: string;
  pincode: string;
  sanctionedLoad: string;
  connectionType: "prepaid" | "postpaid" | string;
  meterInstallationNumber: string;
  meterPhase: string;
  meterType: string;
}

export interface BalanceResponse {
  source: "prepaidBalance" | "latest-daily-bill" | "outstandingBalance" | null;
  note: string;
  data: {
    connectionId?: string;
    prepaidBalanceAmount?: string;
    prepaidBalanceUpdateDate?: string;
    meterStatus?: string;
    recharge?: string;
    msi?: string;
    outstandingAmount?: string;
    lastDailyCharge?: string;
  } | null;
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

export interface MeUser {
  _id: string;
  phone: string;
  phoneCountryCode: string;
  username: string;
  name?: string;
}

/* ── SWR hooks (unchanged signatures — pages don't need to change) ── */

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

export const useOutstanding = () =>
  useSWR<UpstreamEnvelope<{ consumerId: string; outstandingAmount: string; msi: string }>>(
    "/balance/outstanding", fetcher, swrOpts
  );

export const useSites = () =>
  useSWR<UpstreamEnvelope<Site[]>>("/sites", fetcher, swrOpts);

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
    year ? `/history/yearly?year=${year}` : "/history/yearly", fetcher, swrOpts
  );

/* ── Postpaid + cross-meter feature hooks (reverse-engineered, see docs) ── */

export interface MonthlyInvoice {
  invoice_id: string;
  bill_from_dt: string;
  bill_amt: string;      // negative = credit / advance balance
  due_dt: string;
  bill_dt: string;
  payment_dt: string;
  payment_amt: string;
}

export interface UsageStats {
  averageConsumption: string;
  maximumConsumption: string;
  maximumPower: string;
}

export interface MeterAlarm { [k: string]: unknown }
export interface Notification { [k: string]: unknown }
export interface Ticket { [k: string]: unknown }
export interface SavingTip { _id: string; tipEnglish?: string; tipHindi?: string; appliance?: string }

/** Latest monthly invoice (postpaid). Single object, not an array. */
export const useLatestInvoice = () =>
  useSWR<UpstreamEnvelope<MonthlyInvoice>>("/bills/latest", fetcher, swrOpts);

/** Full monthly invoice history (postpaid). */
export const useInvoices = (months = 18) =>
  useSWR<UpstreamEnvelope<MonthlyInvoice[]>>(`/bills/invoices?months=${months}`, fetcher, swrOpts);

/** Avg/max consumption + peak power for a month. */
export const useUsageStats = (month?: string, year?: string) =>
  useSWR<UpstreamEnvelope<UsageStats>>(
    `/consumption/stats${month && year ? `?month=${month}&year=${year}` : ""}`, fetcher, swrOpts
  );

export const useMeterAlarms = () =>
  useSWR<UpstreamEnvelope<MeterAlarm[]>>("/alarms", fetcher, swrOpts);

export const useNotifications = () =>
  useSWR<UpstreamEnvelope<Notification[]>>("/alerts", fetcher, swrOpts);

export const useTickets = (status: "open" | "closed" | "all" = "open") =>
  useSWR<UpstreamEnvelope<Ticket[]>>(`/tickets?status=${status}`, fetcher, swrOpts);

/** Localized energy-saving tips for an appliance (fridge|geyser|washing_machine|nightbaseload|others). */
export const useSavingTip = (appliance: string) =>
  useSWR<UpstreamEnvelope<SavingTip[]>>(appliance ? `/tips?appliance=${appliance}` : null, fetcher, swrOpts);

export interface DiscomDetails {
  address?: string;
  customerCareNumber?: string;
  helplineNumber?: string;
  whatsappNumber?: string;
  email?: string;
  alias?: string;
  title?: string;
  logo?: string;
  playStoreLink?: string;
}

export interface TenantPreferences {
  discomDetails?: DiscomDetails;
  [k: string]: unknown;
}

export interface DowntimeAnnouncement {
  body?: string;
  title?: string;
  [k: string]: unknown;
}

export interface ApplianceRow { [k: string]: unknown }

/** UPPCL's feature-flag + discom config tree (bootstrap API). */
export const useTenantPreferences = () =>
  useSWR<UpstreamEnvelope<TenantPreferences>>("/tenant-preferences", fetcher, swrOpts);

/** Active maintenance / downtime announcement (null when none). */
export const useDowntime = () =>
  useSWR<UpstreamEnvelope<DowntimeAnnouncement | null>>("/downtime", fetcher, swrOpts);

/** Appliance-level disaggregation (empty until UPPCL's model has enough data). */
export const useApplianceData = () =>
  useSWR<UpstreamEnvelope<ApplianceRow[]>>("/appliances", fetcher, swrOpts);

/* ── Complaint hooks (same signatures, different backend route) ── */

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
    phone ? `/complaints?phone=${phone}` : null,
    fetcher,
    { ...swrOpts, revalidateOnFocus: true }
  );

export const useMyComplaints = (phone: string | null | undefined) =>
  useSWR<{ phone: string; complaints: ComplaintDetail[] }>(
    phone ? `/complaints?action=my&phone=${phone}` : null,
    fetcher,
    { ...swrOpts, revalidateOnFocus: true }
  );

export const useComplaintDetail = (dataId: string | null) =>
  useSWR<ComplaintDetail>(
    dataId ? `/complaints?action=detail&data_id=${dataId}` : null,
    fetcher,
    swrOpts
  );

// Re-export API_BASE for backward compat (LoginGate uses it for display)
export const API_BASE = typeof window !== "undefined" ? window.location.origin : "";
