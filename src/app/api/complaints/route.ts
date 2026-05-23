/**
 * Appsavy (UPPCL 1912) complaint portal proxy.
 *
 * This is the ONE server-side route that does actual work (not just forwarding),
 * because Appsavy uses anonymous sessions with server-set cookies that browsers
 * can't manage cross-origin.
 *
 * No user credentials are involved — Appsavy is fully anonymous. The only
 * user-provided input is a phone number (query param).
 *
 * Ported from appsavy.py.
 */
import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://appsavy.com";
const BOOTSTRAP = `${BASE_URL}/coreapps/UI/Anonymous`;
const API = `${BASE_URL}/coreapps/api/AppsavyServices`;
const PROJECT_ID = "119";
const FORM_ID = "4235";
const ROLE_ID = "883";
const COMPANY_ID = "64";
const EVENT_CONTROL = "38068";
const LIST_EVENT_CONTROL = "38064";
const LIST_CHILD_CONTROL = "38068";
const LIST_CHILD_AC_ID = "30065";
const LIST_PARENT_CONTROL = "38062";

// AES-128-CBC with constant key/iv (same as Python)
const AES_KEY = new TextEncoder().encode("8080808080808080");
const AES_IV = new TextEncoder().encode("8080808080808080");

async function aesB64(plain: string): Promise<string> {
  // Web Crypto AES-CBC adds PKCS7 padding automatically — do NOT pad manually
  const data = new TextEncoder().encode(plain);
  const key = await crypto.subtle.importKey("raw", AES_KEY, "AES-CBC", false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv: AES_IV }, key, data);
  return btoa(String.fromCharCode(...new Uint8Array(ct)));
}

async function encryptedHeaders(): Promise<Record<string, string>> {
  return {
    appsavylogin: await aesB64("anonymous"),
    formid: await aesB64(FORM_ID),
    roleid: await aesB64(ROLE_ID),
    sourcetype: await aesB64("WEB"),
    token: await aesB64(""),
  };
}

// ─── Session management (server-side, anonymous) ──────────────────────────────

let _cookies: string | null = null;
let _cookiesAt = 0;
const SESSION_TTL = 15 * 60 * 1000; // 15 min (conservative)

/**
 * Bootstrap an anonymous appsavy session by manually following redirects
 * and accumulating Set-Cookie headers at each hop. Node.js fetch doesn't
 * have a cookie jar, so we do it ourselves.
 */
async function ensureSession(): Promise<string> {
  if (_cookies && Date.now() - _cookiesAt < SESSION_TTL) return _cookies;

  const allCookies: Map<string, string> = new Map();
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

  let url: string = `${BOOTSTRAP}?PROJECTID=${PROJECT_ID}&FORMID=${FORM_ID}`;
  let hops = 0;
  const MAX_HOPS = 5;

  while (hops < MAX_HOPS) {
    hops++;
    const cookieHeader = [...allCookies.values()].join("; ");

    const r = await fetch(url, {
      headers: {
        accept: "text/html",
        "user-agent": ua,
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
      redirect: "manual", // don't follow — we collect cookies ourselves
      cache: "no-store",
    });

    // Collect Set-Cookie from this response
    const sc = r.headers.getSetCookie?.() ?? [];
    for (const raw of sc) {
      const nameVal = raw.split(";")[0]; // "name=value"
      const eqIdx = nameVal.indexOf("=");
      if (eqIdx > 0) {
        const name = nameVal.slice(0, eqIdx).trim();
        allCookies.set(name, nameVal);
      }
    }

    // Follow redirect if 3xx
    if (r.status >= 300 && r.status < 400) {
      const location = r.headers.get("location");
      if (!location) break;
      url = location.startsWith("http") ? location : `${BASE_URL}${location}`;
      continue;
    }

    // Done — either 200 or error
    break;
  }

  if (allCookies.size === 0) {
    throw new Error("Appsavy bootstrap returned no cookies after " + hops + " hops");
  }

  const cookieStr = [...allCookies.values()].join("; ");
  // Session ready
  _cookies = cookieStr;
  _cookiesAt = Date.now();
  return _cookies;
}

async function postApi(method: string, inputXml: string, retryOnce = true): Promise<string> {
  const cookies = await ensureSession();
  const enc = await encryptedHeaders();

  const payload = {
    inputxml: btoa(inputXml),
    DocVersion: 1,
  };

  const r = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: {
      accept: "application/xml, text/xml, */*; q=0.01",
      "content-type": "application/json",
      origin: BASE_URL,
      referer: `${BASE_URL}/coreapps/UI/Form?FormId=${FORM_ID}`,
      version: "1",
      "x-requested-with": "XMLHttpRequest",
      cookie: cookies,
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      ...enc,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (r.status === 401 && retryOnce) {
    // Session expired — reset cookies and retry once with fresh session
    _cookies = null;
    _cookiesAt = 0;
    return postApi(method, inputXml, false);
  }
  if (!r.ok) {
    throw new Error(`appsavy ${method} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  return r.text();
}

// ─── XML parsing (minimal, no external deps) ─────────────────────────────────

interface XmlRow {
  [key: string]: string;
}

function parseRowsets(raw: string): Array<{ ac_id: string; rows: XmlRow[] }> {
  const blocks: Array<{ ac_id: string; rows: XmlRow[] }> = [];
  // Match each <RESULTS ...>...</RESULTS>
  const resultsRe = /<RESULTS[^>]*AC_ID="(\d+)"[^>]*>([\s\S]*?)<\/RESULTS>/gi;
  let m: RegExpExecArray | null;
  while ((m = resultsRe.exec(raw)) !== null) {
    const acId = m[1];
    const inner = m[2];
    const rows: XmlRow[] = [];
    const rowsetRe = /<Rowset>([\s\S]*?)<\/Rowset>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowsetRe.exec(inner)) !== null) {
      const row: XmlRow = {};
      // Fields have attributes: <DATA_ID TYPE="TEXT" CAPTION="...">value</DATA_ID>
      // Match tag name, skip attributes, capture content
      const fieldRe = /<(\w+)\b[^>]*>([\s\S]*?)<\/\1>/g;
      let fm: RegExpExecArray | null;
      while ((fm = fieldRe.exec(rm[1])) !== null) {
        row[fm[1]] = fm[2].trim();
      }
      if (Object.keys(row).length > 0) rows.push(row);
    }
    blocks.push({ ac_id: acId, rows });
  }
  return blocks;
}

// ─── Complaint field schema (from appsavy.py COMPLAINT_FIELDS) ────────────────

const COMPLAINT_FIELDS: Array<[number, number, string]> = [
  [52071, 39534, "customer_account_no"], [38886, 30729, "address"],
  [38802, 30652, "ae_mobile"], [38801, 30649, "ae_name"],
  [132178, 171344, "assigned_to"], [132179, 171345, "base_level"],
  [141575, 196468, "c141575"], [52072, 39533, "subdivision"],
  [52070, 39532, "substation"], [49309, 37796, "userid"],
  [44465, 33863, "xen_mobile"], [44464, 33861, "xen_name"],
  [38799, 30650, "je_label"], [141568, 196464, "mobileno"],
  [53818, 41156, "primary_complaint_no"], [143359, 195495, "initial_iuv_login"],
  [141574, 196467, "remarks"], [76757, 61895, "source"],
  [140740, 189709, "consumer_name_a"], [141570, 196463, "consumer_name_b"],
  [141566, 196462, "entrydate"], [141569, 196465, "c141569"],
  [49308, 37795, "initial_user"], [38800, 30651, "je_mobile"],
  [38069, 30066, "complaint_status_short"], [141567, 196466, "complaint_status"],
  [38884, 30728, "com_sub_type_name"], [38883, 30727, "com_type_name"],
  [140741, 189711, "mobileno_b"], [141572, 196470, "closingdate"],
  [141573, 196469, "closingremarks"], [44941, 33869, "closedby"],
  [140763, 189749, "data_id"], [141571, 196471, "complaint_no"],
  [38070, 30076, "summary_v1"], [83024, 66362, "summary_v2"],
  [144430, 198595, "c144430"], [93222, 81760, "complaint_no_alt"],
  [38812, 30669, "c38812"],
];

function buildRelationalXml(parentValue: string, children: Array<[number, number]>): string {
  const head =
    '<?xml version="1.0"?>' +
    '<Request VERSION="2" LANGUAGE_ID="" LOCATION="">' +
    `<Company Company_Id="${COMPANY_ID}" />` +
    `<Project Project_Id="${PROJECT_ID}" />` +
    '<User User_Id="anonymous" />' +
    '<IUVLogin IUVLogin_Id="anonymous" />' +
    `<ROLE ROLE_ID="${ROLE_ID}" />` +
    `<Event Control_Id="${EVENT_CONTROL}" />`;

  const body = children
    .map(
      ([cid, ac]) =>
        `<Child Control_Id="${cid}" Report="HTML" AC_ID="${ac}">` +
        `<Parent Control_Id="${EVENT_CONTROL}" Value="${parentValue}" Data_Form_Id=""/>` +
        `</Child>`
    )
    .join("");

  return head + body + "</Request>";
}

function parseComplaintDetail(raw: string): Record<string, unknown> {
  const blocks = parseRowsets(raw);
  const merged: Record<string, string> = {};
  for (const block of blocks) {
    for (const row of block.rows) {
      for (const [k, v] of Object.entries(row)) {
        if (v && !merged[k]) merged[k] = v;
      }
    }
  }

  const pick = (...names: string[]): string | null => {
    for (const n of names) if (merged[n]) return merged[n];
    return null;
  };

  const statusRaw = pick("COMPLAINT_STATUS");
  const isOpen = statusRaw ? !statusRaw.toUpperCase().includes("CLOSE") : false;

  return {
    data_id: pick("DATA_ID"),
    complaint_no: pick("COMPLAINT_NO"),
    status: statusRaw,
    is_open: isOpen,
    entry_date: pick("ENTRYDATE"),
    closing_date: pick("CLOSINGDATE"),
    consumer_name: pick("CONSUMER_NAME"),
    mobile_no: pick("MOBILENO"),
    address: pick("ADDRESS"),
    customer_account: pick("CUSTOMERACNTNO"),
    remarks: pick("REMARKS"),
    closing_remarks: pick("CLOSINGREMARKS"),
    closed_by: pick("CLOSEDBY"),
    type: pick("COM_TYPE_NAME"),
    sub_type: pick("COM_SUB_TYPE_NAME"),
    source: pick("SRC"),
    je_name: pick("JE_NAME"),
    je_mobile: pick("JE_MOBILE"),
    ae_name: pick("AE_NAME"),
    ae_mobile: pick("AE_MOBILE"),
    xen_name: pick("XEN_NAME"),
    xen_mobile: pick("XEN_MOBILE"),
    subdivision: pick("SUBDIVISION"),
    substation: pick("SUBSTATION"),
    assigned_to: pick("ASSIGNED_TO"),
    base_level: pick("BASE_LEVEL"),
    initial_user: pick("INITIALUSER"),
    raw_fields: merged,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action") ?? "list";
  const phone = searchParams.get("phone");
  const dataId = searchParams.get("data_id");

  try {
    if (action === "detail" && dataId) {
      // Single complaint detail
      const xml = buildRelationalXml(
        dataId,
        COMPLAINT_FIELDS.map(([cid, ac]) => [cid, ac])
      );
      const raw = await postApi("GetRelationalDataA", xml);
      return NextResponse.json(parseComplaintDetail(raw));
    }

    if (action === "my" && phone) {
      // List + details (parallel fan-out)
      const list = await listByPhone(phone);
      const details = await Promise.all(
        list.map(async (item) => {
          const xml = buildRelationalXml(
            item.data_id as string,
            COMPLAINT_FIELDS.map(([cid, ac]) => [cid, ac])
          );
          const raw = await postApi("GetRelationalDataA", xml);
          return parseComplaintDetail(raw);
        })
      );
      // Sort newest-first by entry_date
      details.sort((a, b) => {
        const da = parseEntryDate(a.entry_date as string);
        const db = parseEntryDate(b.entry_date as string);
        return db.getTime() - da.getTime();
      });
      return NextResponse.json({ phone, complaints: details });
    }

    if (phone) {
      // Simple list
      const list = await listByPhone(phone);
      return NextResponse.json({ phone, complaints: list });
    }

    return NextResponse.json({ error: "phone query param required" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, upstream: "appsavy.com" },
      { status: 502 }
    );
  }
}

async function listByPhone(phone: string) {
  const xml =
    '<?xml version="1.0"?>' +
    '<Request VERSION="2" LANGUAGE_ID="" LOCATION="">' +
    `<Company Company_Id="${COMPANY_ID}" />` +
    `<Project Project_Id="${PROJECT_ID}" />` +
    '<User User_Id="anonymous" />' +
    '<IUVLogin IUVLogin_Id="anonymous" />' +
    `<ROLE ROLE_ID="${ROLE_ID}" />` +
    `<Event Control_Id="${LIST_EVENT_CONTROL}" />` +
    `<Child Control_Id="${LIST_CHILD_CONTROL}" Report="HTML" AC_ID="${LIST_CHILD_AC_ID}">` +
    `<Parent Control_Id="${LIST_PARENT_CONTROL}" Value="${phone}" Data_Form_Id=""/>` +
    "</Child>" +
    "</Request>";

  const raw = await postApi("GetRelationalDataA", xml);
  const blocks = parseRowsets(raw);
  const out: Array<Record<string, unknown>> = [];
  for (const block of blocks) {
    for (const row of block.rows) {
      const status = row.COMPLAINT_STATUS ?? "";
      out.push({
        data_id: row.DATA_ID,
        complaint_no: row.COMPLAINT_NO,
        type: row.COM_TYPE_NAME,
        sub_type: row.COM_SUB_TYPE_NAME,
        mobile_no: row.MOBILENO,
        status,
        is_open: !!status && !status.toUpperCase().includes("CLOSE"),
      });
    }
  }
  return out;
}

function parseEntryDate(raw: string | null | undefined): Date {
  if (!raw) return new Date(0);
  for (const fmt of [
    // "18/04/2026 10:56:30 PM" style
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i,
  ]) {
    const m = fmt.exec(raw.trim());
    if (m) {
      let h = parseInt(m[4]);
      if (m[7]?.toUpperCase() === "PM" && h < 12) h += 12;
      if (m[7]?.toUpperCase() === "AM" && h === 12) h = 0;
      return new Date(
        parseInt(m[3]),
        parseInt(m[2]) - 1,
        parseInt(m[1]),
        h,
        parseInt(m[5]),
        parseInt(m[6])
      );
    }
  }
  return new Date(0);
}
