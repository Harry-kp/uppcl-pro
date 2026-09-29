/**
 * Client-side session management.
 *
 * JWT and site info live ONLY in sessionStorage — never on the server.
 * When the tab closes, everything is gone. Users can also manually clear
 * via logout().
 *
 * This replaces the Python proxy's uppcl_session.json.
 */

const STORAGE_KEY = "uppcl_session";
const EXPIRED_KEY = "uppcl_session_expired";

export interface Session {
  jwt: string;
  jwtExpiresMs: number;
  tenant: string;
  site?: SiteRecord;
}

export interface SiteRecord {
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
  connectionType: string;
  meterInstallationNumber: string;
  meterPhase: string;
  meterType: string;
  [k: string]: unknown;
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (s.jwtExpiresMs <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  sessionStorage.removeItem(EXPIRED_KEY);
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}


/** Clear the session because UPPCL rejected it, so the login gate can say why. */
export function expireSession(): void {
  clearSession();
  sessionStorage.setItem(EXPIRED_KEY, "1");
}

/** True after expireSession() until the next successful sign-in. */
export function sessionWasExpired(): boolean {
  return typeof window !== "undefined" && sessionStorage.getItem(EXPIRED_KEY) === "1";
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

export function getJwt(): string | null {
  return getSession()?.jwt ?? null;
}

export function getSite(): SiteRecord | null {
  return getSession()?.site ?? null;
}

export function setSite(site: SiteRecord): void {
  const s = getSession();
  if (!s) return;
  s.site = site;
  saveSession(s);
}

export function jwtExpiresInDays(): number | null {
  const s = getSession();
  if (!s) return null;
  return (s.jwtExpiresMs - Date.now()) / 86_400_000;
}
