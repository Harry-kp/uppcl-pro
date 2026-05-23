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

export interface Session {
  jwt: string;
  jwtExpiresMs: number;
  tenant: string;
  oaepHash: "SHA-256" | "SHA-1";
  site?: SiteRecord;
}

export interface SiteRecord {
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
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

export function getJwt(): string | null {
  return getSession()?.jwt ?? null;
}

export function getOaepHash(): "SHA-256" | "SHA-1" {
  return getSession()?.oaepHash ?? "SHA-256";
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
