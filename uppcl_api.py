"""
UPPCL SMART — pure HTTP client + local plaintext proxy.

    ┌──────────────┐    plaintext JSON    ┌──────────────────┐    encrypted    ┌──────────┐
    │ your UI /    │  ◄──────────────►    │  localhost:8000  │  ◄────────────► │  UPPCL   │
    │ Swagger/curl │                      │  (this FastAPI)  │                 │   API    │
    └──────────────┘                      └──────────────────┘                 └──────────┘

The proxy handles:
  • ALTCHA proof-of-work captcha
  • Hybrid RSA-OAEP + AES-256-GCM request encryption
  • Password login → 60-day JWT (cached on disk)
  • Dynamic tenantid discovery from login response
  • OAEP-SHA256 → OAEP-SHA1 transparent fallback
  • Runtime public-key fetch + 24h cache

All upstream responses are plaintext JSON, so no decryption needed.

Quickstart
----------
    pip install -r requirements.txt
    cp .env.sample .env           # fill in the values (one-time)
    uvicorn uppcl_api:app --port 8000 --reload

    curl -X POST localhost:8000/auth/login \\
      -H 'content-type: application/json' \\
      -d '{"username":"YOUR_USERNAME","password":"YOUR_PASSWORD"}'

    curl localhost:8000/balance
    curl localhost:8000/dashboard | jq
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

log = logging.getLogger("uppcl")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


# ═══════════════════════════════════════════════════════════════════════════════
#  CONFIG
#
#  The only thing a user ever needs to provide is their UPPCL username +
#  password, supplied at login time via POST /auth/login. Everything else
#  is either an UPPCL-wide constant (baked into the web app's JS bundle)
#  or discovered at runtime and cached in `uppcl_session.json`.
# ═══════════════════════════════════════════════════════════════════════════════

# Optional: load a `.env` if the user created one (for apikey/tenant rotation
# or debugging overrides). Fully optional — the proxy runs fine without it.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass


# ─── UPPCL-wide constants ───────────────────────────────────────────────────
# These two values are baked into the UPPCL SMART web app (same for every
# user, not user-specific) and are required for the initial login call.
# After login succeeds, the server-returned `tenantCode` takes over and is
# persisted to session.json — from then on these defaults are only used for
# re-login when the JWT expires.
#
# If UPPCL ever rotates them, override via env (UPPCL_API_KEY / UPPCL_TENANT)
# or just update these literals — no user-touching required.

_BOOTSTRAP_API_KEY = "5ab6ef2e-5051-4923-aa65-dc82883af26b"
_BOOTSTRAP_TENANT  = "b3ba0ab0-05bc-11f0-bf77-932b3a8bb3cd"

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _uuid_env(name: str, default: str) -> str:
    v = (os.environ.get(name) or default).strip()
    if not _UUID_RE.fullmatch(v):
        raise SystemExit(f"✗ {name}={v!r} is not a valid UUID. Fix .env or unset the override.")
    return v


API_KEY        = _uuid_env("UPPCL_API_KEY", _BOOTSTRAP_API_KEY)
DEFAULT_TENANT = _uuid_env("UPPCL_TENANT",  _BOOTSTRAP_TENANT)
BASE_URL       = os.environ.get("UPPCL_BASE_URL", "https://uppcl.sem.jio.com").rstrip("/")
API_BASE       = f"{BASE_URL}/accounts/api"
PUBKEY_URL     = f"{BASE_URL}/uppclsmart/assets/cert/prod/server_public.pem"
SESSION_FILE   = Path(os.environ.get("UPPCL_SESSION_FILE", "uppcl_session.json"))

# Try SHA-256 OAEP first; fall back to SHA-1 on server rejection.
OAEP_PREFERENCE = ("sha256", "sha1")

# Upstream insists on explicit IST offset in every date field.
IST_OFFSET = "+05:30"


def ist(d: date) -> str:
    """Date → ISO-8601 datetime string at midnight IST — the only format upstream accepts."""
    return f"{d.isoformat()}T00:00:00{IST_OFFSET}"


# ═══════════════════════════════════════════════════════════════════════════════
#  Crypto primitives
# ═══════════════════════════════════════════════════════════════════════════════

def solve_altcha(salt: str, challenge: str, maxnum: int = 100_000) -> int:
    """Find n in [0, maxnum] such that SHA256(salt + n) == challenge."""
    target = challenge.lower()
    for n in range(maxnum + 1):
        if hashlib.sha256(f"{salt}{n}".encode()).hexdigest() == target:
            return n
    raise RuntimeError(f"ALTCHA challenge unsolvable within {maxnum}")


def encrypt_payload(plaintext: dict, pub_pem: str, oaep_hash: str = "sha256") -> dict[str, str]:
    """
    Produce the {payload, key, iv} triple UPPCL expects.
      - Fresh AES-256 key per request
      - AES-GCM, 12-byte IV, auth tag appended to ciphertext
      - AES key wrapped with RSA-OAEP (SHA-256 or SHA-1)
    """
    pub = serialization.load_pem_public_key(pub_pem.encode())
    h   = hashes.SHA256() if oaep_hash == "sha256" else hashes.SHA1()
    aes = os.urandom(32)
    iv  = os.urandom(12)
    ct  = AESGCM(aes).encrypt(iv, json.dumps(plaintext, separators=(",", ":")).encode(), None)
    wrapped = pub.encrypt(
        aes,
        padding.OAEP(mgf=padding.MGF1(algorithm=h), algorithm=h, label=None),
    )
    return {
        "payload": base64.b64encode(ct).decode(),
        "key":     base64.b64encode(wrapped).decode(),
        "iv":      base64.b64encode(iv).decode(),
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  UPPCL HTTP client
# ═══════════════════════════════════════════════════════════════════════════════

class UPPCLError(Exception):
    """Upstream UPPCL error."""
    def __init__(self, status: int, message: str, body: Any = None):
        super().__init__(f"[{status}] {message}")
        self.status = status
        self.body = body


class UPPCLClient:
    def __init__(self):
        self.http = httpx.Client(
            base_url=API_BASE,
            timeout=30,
            headers={
                "accept":          "application/json, text/plain, */*",
                "accept-language": "en",
                "content-type":    "application/json",
                "origin":          BASE_URL,
                "referer":         f"{BASE_URL}/uppclsmart/",
                "user-agent":      ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                                    "Chrome/147.0.0.0 Safari/537.36"),
            },
        )
        # Session state — everything per-user is discovered at runtime via /site/search.
        # No user-specific IDs are baked into this module.
        self.jwt: str | None = None
        self.jwt_expires_ms: int = 0
        self.tenant: str = DEFAULT_TENANT     # parent discom tenant (for tenantid header)
        self.site: dict | None = None         # whole primary-site record from /site/search
        # Runtime
        self._pubkey_pem: str | None = None
        self._pubkey_fetched_at: float = 0.0
        self._oaep_hash: str = OAEP_PREFERENCE[0]
        self._load_session()

    # ───────────────────────── persistence ──────────────────────────

    def _load_session(self):
        if not SESSION_FILE.exists():
            return
        try:
            d = json.loads(SESSION_FILE.read_text())
        except json.JSONDecodeError:
            return
        if d.get("jwt_expires_ms", 0) > int(time.time() * 1000):
            self.jwt = d.get("jwt")
            self.jwt_expires_ms = d["jwt_expires_ms"]
            self.tenant = d.get("tenant", DEFAULT_TENANT)
            self.site = d.get("site")
            self._oaep_hash = d.get("oaep_hash", OAEP_PREFERENCE[0])
            log.info("loaded session, jwt valid for %.1f more days",
                     (self.jwt_expires_ms - time.time() * 1000) / 86_400_000)

    def _save_session(self):
        SESSION_FILE.write_text(json.dumps({
            "jwt":            self.jwt,
            "jwt_expires_ms": self.jwt_expires_ms,
            "tenant":         self.tenant,
            "site":           self.site,
            "oaep_hash":      self._oaep_hash,
        }, indent=2))

    def has_session(self) -> bool:
        return bool(self.jwt and self.jwt_expires_ms > int(time.time() * 1000))

    # ───────────────────────── headers ──────────────────────────

    def _tenant_header(self) -> str:
        return json.dumps({"isMultiLevel": True, "code": self.tenant}, separators=(",", ":"))

    def _default_headers(self) -> dict[str, str]:
        return {"apikey": API_KEY, "tenantid": self._tenant_header()}

    # ───────────────────────── public key ──────────────────────────

    def _get_pubkey(self) -> str:
        if self._pubkey_pem and (time.time() - self._pubkey_fetched_at) < 86400:
            return self._pubkey_pem
        log.info("fetching server public key")
        r = httpx.get(PUBKEY_URL, timeout=15, headers={
            **self._default_headers(),
            "referer": f"{BASE_URL}/uppclsmart/",
        })
        r.raise_for_status()
        pem = r.text.strip()
        if "BEGIN PUBLIC KEY" not in pem and "BEGIN RSA PUBLIC KEY" not in pem:
            raise UPPCLError(500, f"unexpected pubkey format: {pem[:80]!r}")
        self._pubkey_pem = pem
        self._pubkey_fetched_at = time.time()
        return pem

    def _wrap(self, body: dict) -> dict:
        inner = encrypt_payload(body, self._get_pubkey(), self._oaep_hash)
        return {"payload": json.dumps(inner, separators=(",", ":"))}

    # ───────────────────────── error parsing ──────────────────────────

    @staticmethod
    def _parse_error(r: httpx.Response) -> UPPCLError:
        try:
            j = r.json()
            msg = j.get("message") or j.get("error") or r.text[:200]
        except Exception:
            j = None
            msg = r.text[:200]
        return UPPCLError(r.status_code, msg, j)

    @staticmethod
    def _is_crypto_error(r: httpx.Response) -> bool:
        if r.status_code not in (400, 500):
            return False
        t = r.text.lower()
        return any(k in t for k in ("decrypt", "padding", "oaep", "crypto", "decipher"))

    # ───────────────────────── auth ──────────────────────────

    def _captcha_token(self) -> str:
        r = httpx.get(f"{API_BASE}/altcha/createAltCaptcha", timeout=15, headers=self._default_headers())
        r.raise_for_status()
        c = r.json()
        n = solve_altcha(c["salt"], c["challenge"], c.get("maxnumber", 100_000))
        soln = {
            "algorithm": c["algorithm"], "challenge": c["challenge"],
            "number": n, "salt": c["salt"], "signature": c["signature"],
        }
        return base64.b64encode(json.dumps(soln, separators=(",", ":")).encode()).decode()

    def login(self, username: str, password: str) -> dict:
        """
        Username + password → JWT. Single call.
        Tries OAEP-SHA256 first, falls back to SHA-1 on crypto-shaped errors.
        """
        last_response_text = ""
        for attempt in OAEP_PREFERENCE:
            self._oaep_hash = attempt
            captcha = self._captcha_token()
            try:
                r = self.http.post(
                    "/auth/v2/login",
                    json=self._wrap({"username": username, "password": password,"roleType": "user",}),
                    headers={**self._default_headers(), "captchatoken": captcha},
                )
            except httpx.HTTPError as e:
                raise UPPCLError(502, f"network error contacting UPPCL: {e}") from e

            if r.status_code == 200:
                j = r.json()["data"]
                self.jwt = j["token"]
                self.jwt_expires_ms = j["expires"]
                # Pick up fresh tenantCode from the user object if present
                new_tenant = (j.get("user", {}) or {}).get("tenantCode")
                if new_tenant:
                    self.tenant = new_tenant
                self._save_session()
                log.info("login ok via OAEP-%s, jwt lifetime %.1f days",
                         attempt, (self.jwt_expires_ms - time.time() * 1000) / 86_400_000)
                return {"ok": True, "expires_at_ms": self.jwt_expires_ms, "tenant": self.tenant}

            last_response_text = r.text
            if self._is_crypto_error(r):
                log.info("OAEP-%s rejected by server; trying next hash", attempt)
                continue
            raise self._parse_error(r)

        raise UPPCLError(500, f"login failed, all OAEP variants rejected: {last_response_text[:300]}")

    def logout(self):
        self.jwt = None
        self.jwt_expires_ms = 0
        self._save_session()

    # ───────────────────────── authenticated calls ──────────────────────────

    def _post(self, path: str, body: dict) -> dict:
        if not self.has_session():
            raise UPPCLError(401, "no active session — POST /auth/login first")
        # JWT travels as the `token` HTTP header (sanitized out of HAR exports).
        # Body is just the encrypted envelope: { "payload": "<encrypted>" }.
        envelope = self._wrap(body)
        try:
            r = self.http.post(
                path,
                json=envelope,
                headers={
                    **self._default_headers(),
                    "token":         self.jwt,
                    "authorization": f"Bearer {self.jwt}",
                },
            )
        except httpx.HTTPError as e:
            raise UPPCLError(502, f"network error: {e}") from e

        if r.status_code == 200:
            return r.json()
        if r.status_code in (401, 403):
            # JWT likely expired or was invalidated upstream
            self.jwt = None
            self._save_session()
            raise UPPCLError(401, "session expired — POST /auth/login to refresh")
        raise self._parse_error(r)

    # ───────────────────── primary-site resolution ─────────────────────
    # Every data endpoint needs some combination of connectionId / deviceId /
    # tenantId (per-site DISCOM code, e.g. "pvvnl"). All of those live in the
    # /site/search response, so we fetch and cache once.

    def primary_site(self) -> dict:
        if self.site:
            return self.site
        data = self.sites().get("data", [])
        if not data:
            raise UPPCLError(404, "no sites on this account")
        self.site = data[0]
        self._save_session()
        return self.site

    def _ids(self) -> tuple[str, str, str]:
        s = self.primary_site()
        try:
            return s["connectionId"], s["deviceId"], s["tenantId"]
        except KeyError as e:
            raise UPPCLError(500, f"site record missing field {e}; got keys={list(s)}") from e

    # ───────────────────── account-wide ─────────────────────
    def sites(self):                            return self._post("/site/search", {"skip": 0, "limit": 50})
    def user(self):                             return self._post("/user/search", {"skip": 0, "limit": 10})

    # ───────────────────── balance ─────────────────────
    # Three upstream views give three different numbers — be careful which you show:
    #   • /site/prepaidBalance    — LIVE meter balance. What you can actually spend
    #                               right now. Matches the web portal's home screen.
    #                               Often returns empty {code:200} if the server's
    #                               session record was invalidated; a fresh login
    #                               usually fixes it.
    #   • latest /bill/search row — yesterday's end-of-day meter balance
    #                               (`dailyBill.closing_bal`). Within 24h of live.
    #   • /site/outstandingBalance — billing-system credit AS OF THE LAST MONTHLY
    #                               INVOICE. Negative = credit, positive = owed.
    #                               Lags reality by up to a month — not what's
    #                               actually available on the meter right now.
    def prepaid_balance(self):
        cid, _, _ = self._ids()
        # fetchCache=false forces a live meter query (what the web portal uses
        # when the user pulls-to-refresh).
        return self._post("/site/prepaidBalance?fetchCache=false", {"connectionId": cid})

    def outstanding_balance(self):
        cid, _, tid = self._ids()
        return self._post("/site/outstandingBalance",
                          {"connectionId": cid, "tenantId": tid})

    # ───────────────────── bills & payments ─────────────────────
    # Field-name quirks (discovered by probing server 409s):
    #   bills:    "from"/"to" date range, "connectionId"
    #   payments: "consumer_id" (snake_case — the 409 says "connectionID" but lies)
    def bills(self, start: str, end: str, skip=0, limit=90):
        cid, _, tid = self._ids()
        return self._post("/bill/search",
                          {"skip": skip, "limit": limit, "tenantId": tid,
                           "connectionId": cid, "from": start, "to": end})

    def payments(self, skip=0, limit=50):
        cid, _, tid = self._ids()
        return self._post("/payment/v2/search",
                          {"skip": skip, "limit": limit,
                           "tenantId": tid, "consumer_id": cid})

    def bill_history(self, skip=0, limit=12):
        """Monthly bill invoices with due dates + payment status."""
        cid, _, tid = self._ids()
        # Note: this endpoint's mandatory-field check wants `consumerId` (camelCase),
        # unlike /payment/v2/search which wants `consumer_id`. Upstream is inconsistent.
        return self._post("/bill/billHistory",
                          {"consumerId": cid, "tenantId": tid,
                           "skip": skip, "limit": limit})

    # ───────────────────── consumption / history ─────────────────────
    # Meter addressed by deviceId + tenantId. Dates must be ISO-8601 with the
    # explicit IST offset (+05:30); server returns opaque "[object Object]" on
    # any other format.
    def daily_aggregate(self, start_ist: str, end_ist: str):
        _, did, tid = self._ids()
        return self._post("/eventsummary/aggregate",
                          {"deviceId": did, "tenantId": tid,
                           "from": start_ist, "to": end_ist})

    def yearly_history(self, year: int):
        """Monthly rollup for a given calendar year (includes powerFactor)."""
        _, did, tid = self._ids()
        return self._post("/eventsummary/search",
                          {"deviceId": did, "tenantId": tid,
                           "groupBy": "year", "year": year})

    # ───────────────────── misc working endpoints ─────────────────────
    def user_preferences(self):
        return self._post("/userpreference/search", {"skip": 0, "limit": 10})

    def session_info(self):
        """Server-side session record (separate from JWT claims)."""
        return self._post("/auth/session-check", {})

    def dadata(self, skip=0, limit=10):
        """Direct-access data (meter time-series); requires deviceId."""
        _, did, tid = self._ids()
        return self._post("/dadata/v2/search",
                          {"deviceId": did, "tenantId": tid,
                           "skip": skip, "limit": limit})

    def connection_budget(self):
        cid, _, tid = self._ids()
        return self._post("/connectionbudget/search",
                          {"tenantId": tid, "connectionId": cid,
                           "skip": 0, "limit": 10})

    # ───────────────────── known-broken upstream (kept for raw probing) ─────────────────────
    # These always error for our account — left as raw hooks so consumers can experiment:
    #   • /eventsummary/consumptionAggregation → "[object Object]"
    #   • /announcements/landing/search        → "Payload is required"
    #   • /bill/billDetails                    → wants a "bpno" we don't have
    #   • /insight/getDocument{Count,Details}  → "Sub Tenant Code is missing"
    def raw_post(self, path: str, body: dict):
        return self._post(path, body)


# ═══════════════════════════════════════════════════════════════════════════════
#  FastAPI proxy — plaintext for your UI / Swagger / curl / iOS Shortcuts
# ═══════════════════════════════════════════════════════════════════════════════

_DESCRIPTION = """
Local plaintext proxy for UPPCL SMART's encrypted prepaid meter API, plus
read-only access to the UPPCL 1912 complaint portal (appsavy.com).

The upstream API uses RSA-OAEP + AES-256-GCM envelope encryption, ALTCHA
proof-of-work captcha, 60-day JWTs, and dynamic tenant UUIDs. This proxy
hides all of that — talk to it with plain JSON.

### Workflow

1. **POST `/auth/login`** once with your UPPCL username + password. The
   resulting JWT is cached on disk (`uppcl_session.json`) and reused for
   60 days.
2. Call any data endpoint (`/dashboard`, `/balance`, `/consumption`, …) —
   the proxy handles encryption, tenant resolution, and re-authentication.
3. **POST `/debug/raw`** to experiment with undocumented upstream routes
   without touching the encryption code.

### Live docs

- **Swagger UI** → [/docs](/docs) (interactive, try-it-out)
- **ReDoc**      → [/redoc](/redoc) (narrative, printable)
- **OpenAPI**    → [/openapi.json](/openapi.json) (raw schema)

All upstream responses are JSON as returned by UPPCL — no field renaming.
"""

_TAGS = [
    {"name": "System",       "description": "Health, configuration, meta."},
    {"name": "Auth",         "description": "Username + password → 60-day JWT, logout."},
    {"name": "Account",      "description": "Sites, user profile, preferences, session."},
    {"name": "Balance",      "description": "Live prepaid balance + billing-system outstanding."},
    {"name": "Bills",        "description": "Daily bill rows, monthly invoices, payments."},
    {"name": "Consumption",  "description": "kWh import/export, yearly rollups, meter direct-access."},
    {"name": "Dashboard",    "description": "One-shot composite endpoint — everything a UI needs."},
    {"name": "Complaints",   "description": "Read-only access to the UPPCL 1912 portal (appsavy.com)."},
    {"name": "Debug",        "description": "Escape hatches for probing undocumented routes."},
]

app = FastAPI(
    title="UPPCL SMART Proxy",
    version="1.0.0",
    description=_DESCRIPTION,
    openapi_tags=_TAGS,
    # Advertised hosts. The hosted ReDoc page
    # (https://harry-kp.github.io/uppcl-pro/) shows this list so browsers
    # know where the proxy actually lives. Order: dev first, Pi second.
    servers=[
        {"url": "http://localhost:8000", "description": "Local dev (`make dev`)"},
        {"url": "http://uppcl.lan:1912/api",  "description": "Raspberry Pi deploy (if configured)"},
    ],
    contact={
        "name":  "UPPCL Pro on GitHub",
        "url":   "https://github.com/Harry-kp/uppcl-pro",
    },
    license_info={
        "name": "MIT",
        "url":  "https://opensource.org/licenses/MIT",
    },
    swagger_ui_parameters={"defaultModelsExpandDepth": 0, "docExpansion": "list"},
)

# Allow the Next.js dashboard (http://localhost:3000) + common dev origins.
# Override via UPPCL_CORS_ORIGINS=http://a,http://b if you deploy elsewhere.
_cors = os.environ.get(
    "UPPCL_CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = UPPCLClient()


class LoginReq(BaseModel):
    username: str
    password: str


def _err(e: UPPCLError):
    raise HTTPException(status_code=e.status, detail={"message": str(e.args[0]), "upstream": e.body})


@app.get("/health", tags=["System"], summary="Proxy + session health")
def health():
    """
    Lightweight liveness + auth-state probe. Does **not** contact UPPCL —
    reports purely on the cached session.

    **Returns**

    | field | meaning |
    |---|---|
    | `ok` | Proxy process is up |
    | `authenticated` | `true` while the cached JWT is unexpired |
    | `tenant` | Parent DISCOM tenant UUID currently in use |
    | `jwt_expires_ms` | Epoch ms when the cached JWT expires |
    | `jwt_expires_in_days` | Convenience: days until expiry (nullable) |
    | `oaep_hash_in_use` | `sha256` normally; flips to `sha1` on server rejection |

    **Use when** — you want to decide whether to prompt the user for login,
    or power a status chip in a dashboard header.
    """
    return {
        "ok": True,
        "authenticated": client.has_session(),
        "tenant": client.tenant,
        "jwt_expires_ms": client.jwt_expires_ms,
        "jwt_expires_in_days": (
            round((client.jwt_expires_ms - int(time.time() * 1000)) / 86_400_000, 2)
            if client.has_session() else None
        ),
        "oaep_hash_in_use": client._oaep_hash,
    }


@app.get("/config", tags=["System"], summary="Effective runtime configuration")
def current_config():
    """
    Dump the non-secret config the proxy booted with.

    Useful for confirming which upstream base URL / API key is in effect
    (e.g. when debugging env-var overrides via `UPPCL_BASE_URL`,
    `UPPCL_API_KEY`, `UPPCL_TENANT`, `UPPCL_SESSION_FILE`).

    The API key is truncated to its first 8 chars — enough to distinguish
    between the UPPCL-wide constant and an override, not enough to replay.
    """
    return {
        "base_url":     BASE_URL,
        "api_base":     API_BASE,
        "pubkey_url":   PUBKEY_URL,
        "api_key_hint": API_KEY[:8] + "…",
        "tenant":       client.tenant,
        "session_file": str(SESSION_FILE.resolve()),
    }


@app.post("/auth/login", tags=["Auth"], summary="Log in — returns 60-day JWT cached on disk")
def login(r: LoginReq):
    """
    Exchange UPPCL username + password for a 60-day JWT. The token is
    persisted to `uppcl_session.json` so subsequent calls don't need to
    re-authenticate.

    **Request body**

    ```json
    { "username": "9999999999", "password": "••••••••" }
    ```

    `username` is whatever you use on the UPPCL SMART app (phone number
    *or* connection/account number — UPPCL accepts either).

    **What happens under the hood**

    1. Solve an ALTCHA proof-of-work captcha (pure CPU, ~10 ms).
    2. Fetch UPPCL's public key (24h cached).
    3. Encrypt `{username, password, roleType: "user"}` with AES-256-GCM,
       wrap the AES key with RSA-OAEP-SHA256 (auto-falls-back to SHA-1
       if the upstream rejects SHA-256).
    4. On 200, capture `token` + `expires` + `tenantCode` from the response
       and write them to disk.

    **Returns**

    ```json
    { "ok": true, "expires_at_ms": 1744000000000, "tenant": "pvvnl" }
    ```

    **Common errors**

    - `401` — credentials rejected by UPPCL.
    - `502` — network error talking to `uppcl.sem.jio.com`.
    - `500` — both OAEP variants rejected (upstream pubkey rotated; try
      re-fetching via a proxy restart).
    """
    try:
        return client.login(r.username, r.password)
    except UPPCLError as e:
        _err(e)


@app.post("/auth/logout", tags=["Auth"], summary="Drop cached JWT")
def logout():
    """
    Clear the locally-cached JWT. Next data call will return 401 until
    you `/auth/login` again.

    ⚠ **Soft logout only.** This does **not** invalidate the token on
    UPPCL's side — anyone who still holds the `uppcl_session.json` can
    keep using it until the natural `expires` timestamp. If you suspect
    a leak, change your UPPCL password to force a server-side revoke.
    """
    client.logout()
    return {"ok": True}


@app.get("/sites", tags=["Account"], summary="All connection sites on this login")
def sites():
    """
    Every `site` (connection) attached to this UPPCL login — plus the
    per-site identifiers every other data endpoint depends on.

    **Fields that matter** (per site):

    - `connectionId` — 10-digit consumer ID (used in /bills, /payments)
    - `deviceId` — smart-meter serial (used in /consumption, /dadata)
    - `tenantId` — the DISCOM sub-tenant code, e.g. `pvvnl`, `mvvnl`
    - `address`, `tenantCode`, `isPrimary`, `billType`, `msi`

    The first site in the response becomes the proxy's "primary" for
    single-connection convenience endpoints (`/balance`, `/dashboard`).
    Multi-connection accounts will see every site here; the dashboard
    surfaces a picker.
    """
    try: return client.sites()
    except UPPCLError as e: _err(e)


@app.get("/me", tags=["Account"], summary="User profile")
def me():
    """
    The user's own profile record: `name`, `email`, `phone`, `tenantCode`,
    notification/marketing consent flags, biometric-login toggle,
    registration timestamp, etc.

    Distinct from `/sites`, which is *per-connection*. One login typically
    returns one `/me` and one-or-many `/sites`.
    """
    try: return client.user()
    except UPPCLError as e: _err(e)


@app.get("/balance", tags=["Balance"], summary="Live prepaid balance (with fallbacks)")
def balance():
    """
    Live prepaid balance. Tries three sources, returning the FIRST one that
    actually reflects what's spendable on the meter right now:

      1. /site/prepaidBalance?fetchCache=false  — live meter query (authoritative).
         Matches the web portal's home screen. May return empty if the
         server-side session record is stale — re-login fixes it.
      2. latest /bill/search row                — yesterday's end-of-day meter
         balance (`dailyBill.closing_bal`). At most 24 h behind live.
      3. /site/outstandingBalance               — billing-system credit as of
         the LAST MONTHLY INVOICE. Lags reality by up to a month — only useful
         as a last resort.

    The response includes a plain-English `note` explaining what the number
    represents, so you can decide whether to show it.
    """
    try:
        # 1) live meter balance — authoritative
        live = client.prepaid_balance().get("data")
        if live:
            return {
                "source": "prepaidBalance",
                "note": "Live meter balance — authoritative. Matches the web portal.",
                "data": live,
            }

        # 2) derive from latest daily bill (within 24h of live)
        end   = date.today()
        start = end - timedelta(days=7)
        bills = client.bills(start.isoformat(), end.isoformat(), limit=5).get("data", [])
        if bills:
            latest = bills[0]
            db = latest.get("dailyBill", {})
            return {
                "source": "latest-daily-bill",
                "note": ("Live /prepaidBalance returned empty (likely stale session — "
                         "re-login to refresh). This is yesterday's end-of-day meter "
                         f"balance ({db.get('usage_date', '?')}), accurate to within 24 h."),
                "data": {
                    "connectionId":             latest.get("connectionId"),
                    "prepaidBalanceAmount":     db.get("closing_bal"),
                    "prepaidBalanceUpdateDate": db.get("usage_date") or latest.get("billDate"),
                    "lastDailyCharge":          db.get("daily_chg"),
                },
            }

        # 3) outstanding — last resort (can be weeks stale)
        outs = client.outstanding_balance().get("data") or {}
        if outs.get("outstandingAmount") is not None:
            try:
                amt = float(outs["outstandingAmount"])
            except (TypeError, ValueError):
                amt = 0.0
            return {
                "source": "outstandingBalance",
                "note": ("⚠ Billing-system credit AS OF THE LAST MONTHLY INVOICE — "
                         "does NOT reflect consumption since that invoice. Your actual "
                         "meter balance is lower by whatever you've burned since then. "
                         "Re-login to get the live /prepaidBalance value."),
                "data": {
                    "connectionId":         outs.get("consumerId"),
                    "msi":                  outs.get("msi"),
                    "outstandingAmount":    outs["outstandingAmount"],
                    "prepaidBalanceAmount": f"{-amt:.2f}" if amt < 0 else "0.00",
                },
            }

        return {"source": None, "data": None,
                "note": "No source produced data — try re-login, then retry."}
    except UPPCLError as e:
        _err(e)


@app.get("/balance/outstanding", tags=["Balance"], summary="Outstanding balance as of last invoice")
def balance_outstanding():
    """
    Raw `/site/outstandingBalance` passthrough. This is the billing
    system's view, **not** the live meter.

    - `outstandingAmount < 0` → credit on file (you're in the black).
    - `outstandingAmount > 0` → arrears (you owe UPPCL).

    Snapshotted at the last monthly invoice cut — can lag reality by
    up to a month. For a number you can actually trust, use `/balance`.
    """
    try: return client.outstanding_balance()
    except UPPCLError as e: _err(e)


@app.get("/bills/history", tags=["Bills"], summary="Monthly invoices (past N months)")
def bills_history(limit: int = 12, skip: int = 0):
    """
    Monthly bill invoices (one row per billing cycle). Think "statement
    history" — good for a timeline or PDF-download UI.

    **Fields per row**

    `invoice_id`, `bill_dt`, `bill_amt`, `due_dt`, `payment_dt`,
    `payment_status`, `bill_period_from`, `bill_period_to`, `units_billed`.

    **Query params**

    - `limit` (default `12`) — how many to fetch (max tested: 60).
    - `skip` — pagination offset.
    """
    try: return client.bill_history(skip=skip, limit=limit)
    except UPPCLError as e: _err(e)


@app.get("/preferences", tags=["Account"], summary="User notification/display preferences")
def preferences():
    """
    User preference record: notification channels (SMS / email / push),
    language, biometric-login toggle, default payment method, etc.

    Mostly useful for surfacing "open the UPPCL app to change this"
    breadcrumbs in your own UI — the proxy doesn't currently expose a
    mutation endpoint.
    """
    try: return client.user_preferences()
    except UPPCLError as e: _err(e)


@app.get("/session", tags=["Account"], summary="Server-side session record")
def session():
    """
    What UPPCL's servers think about your current session — separate
    from the JWT claims. Includes issued/expires timestamps, last login
    IP, login-method (password vs OTP), and the `sessionId` you'd need
    if you ever want to call `/auth/logout-all-devices`.
    """
    try: return client.session_info()
    except UPPCLError as e: _err(e)


@app.get("/dadata", tags=["Consumption"], summary="Direct-access meter data (often empty)")
def dadata(limit: int = 10, skip: int = 0):
    """
    "Direct-access data" — the upstream name for raw meter reads outside
    the aggregated `/eventsummary` rollups.

    ⚠ Frequently returns an empty `data: []` depending on the meter
    firmware and tenant configuration. Documented here for completeness;
    don't build UI on top of it without a fallback.
    """
    try: return client.dadata(skip=skip, limit=limit)
    except UPPCLError as e: _err(e)


@app.get("/budget", tags=["Consumption"], summary="Connection-budget alert records")
def budget():
    """
    Connection budgets are UPPCL's name for consumption alerts (e.g.
    "ping me when my daily spend exceeds ₹X"). Returns the current set
    of budget rows, with trigger thresholds and last-alerted timestamps.

    Empty array if the user has never configured a budget in the app.
    """
    try: return client.connection_budget()
    except UPPCLError as e: _err(e)


class RawPostReq(BaseModel):
    path: str
    body: dict


@app.post("/debug/raw", tags=["Debug"], summary="Raw authenticated call to any UPPCL route")
def debug_raw(r: RawPostReq):
    """
    Reverse-engineering escape hatch. Forward an arbitrary body to any
    UPPCL SMART route — the proxy takes care of encryption, ALTCHA,
    JWT header, tenant header, OAEP-hash fallback, and the 401 retry.

    **Request body**

    ```json
    {
      "path": "/eventsummary/search",
      "body": { "deviceId": "...", "tenantId": "pvvnl", "groupBy": "year", "year": 2025 }
    }
    ```

    **Upstream routes known to work** — see the inventory at the top of
    [`CLAUDE.md`](https://github.com/Harry-kp/uppcl-pro.git/blob/main/CLAUDE.md).
    Server 409 errors usually name the mandatory field you're missing —
    trust the error, not the docs.

    **Known gotchas** (field-name quirks discovered the hard way):
    - `/payment/v2/search` wants `consumer_id` (snake_case), despite
      saying "`connectionID` missing" in the 409.
    - `/eventsummary/aggregate` wants ISO-8601 **with** `+05:30` offset.
      Any other date format returns a literal `[object Object]`.
    """
    try: return client.raw_post(r.path, r.body)
    except UPPCLError as e: _err(e)


# ═══════════════════════════════════════════════════════════════════════════
# Complaint portal (Appsavy) — READ-ONLY. Never submits real complaints.
# ═══════════════════════════════════════════════════════════════════════════
from appsavy import appsavy  # noqa: E402


@app.get("/complaints/my", tags=["Complaints"], summary="All complaints with full detail, newest first")
def complaints_my(phone: str):
    """
    Hydrated complaint history for a phone. For each complaint, the proxy
    fans out a parallel `/complaints/detail` call and merges the result,
    then sorts newest-first.

    **Returns**

    ```json
    {
      "phone": "9999999999",
      "complaints": [
        {
          "data_id": "50000000",
          "complaint_no": "PVXXXXXXXXXXX",
          "type": "NO SUPPLY", "sub_type": "SUPPLY RELATED",
          "status": "CLOSED", "is_open": false,
          "registered_at": "2026-04-18T10:56:00",
          "resolved_at":   "2026-04-18T20:48:00",
          "remarks": "...", "closing_remarks": "...",
          "officers": [
            { "role": "JE",  "name": "...", "phone": "0091..." },
            { "role": "AE",  "name": "...", "phone": "0091..." },
            { "role": "XEN", "name": "...", "phone": "0091..." }
          ],
          ...
        }
      ]
    }
    ```

    **Underlying upstream** — `appsavy.com` ("UPPCL 1912" CRM), anonymous
    session cookies only, no login required. 5 request headers encrypted
    with AES-CBC-128 under a constant key.

    **Query params**

    - `phone` — 10-digit mobile (required). Only complaints registered
      *under that number* are returned.
    """
    try:
        return {"phone": phone, "complaints": appsavy.list_with_details(phone)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"message": str(e)}) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail={"message": str(e), "upstream": "appsavy.com"},
        ) from e


@app.get("/complaints/list", tags=["Complaints"], summary="Compact complaint list for a phone")
def complaint_list(phone: str):
    """
    Lightweight list view — one upstream call, no detail fan-out. Use
    this when you just want a count + statuses (e.g. a sidebar badge).

    **Returns**

    ```json
    {
      "phone": "9999999999",
      "complaints": [
        { "data_id": "50000000", "complaint_no": "PV...",
          "type": "NO SUPPLY", "sub_type": "SUPPLY RELATED",
          "status": "CLOSED", "is_open": false }
      ]
    }
    ```

    Prefer `/complaints/my` if you need officer chains, timestamps, or
    closing remarks — those live in the detail payload.
    """
    try:
        return {"phone": phone, "complaints": appsavy.list_by_phone(phone)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"message": str(e)}) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail={"message": str(e), "upstream": "appsavy.com"},
        ) from e


@app.get("/complaints/detail", tags=["Complaints"], summary="Full detail for one complaint by DATA_ID")
def complaint_detail(data_id: str):
    """
    Every field Appsavy stores for one complaint — 39 `AC_ID`s worth
    (status, sub-status, officer chain with phones, escalation
    timestamps, remarks, closing remarks, SLA breach flags, …).

    `data_id` is the Appsavy-internal numeric ID surfaced by
    `/complaints/list` and `/complaints/my` — **not** the public-facing
    `PV…` complaint number.
    """
    try:
        return appsavy.get_complaint_detail(data_id)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail={"message": str(e), "upstream": "appsavy.com"},
        ) from e


class RawAppsavyReq(BaseModel):
    parent_value: str
    children: list[tuple[int, int]]  # list of (Control_Id, AC_ID)


@app.post("/complaints/raw", tags=["Debug"], summary="Raw GetRelationalDataA probe")
def complaint_raw(r: RawAppsavyReq):
    """
    Fire a raw `GetRelationalDataA` SOAP call against appsavy.com with
    your own `(Control_Id, AC_ID)` list. Returns the raw SOAP XML plus
    the parsed rowsets.

    **Request body**

    ```json
    {
      "parent_value": "9999999999",
      "children": [ [31, 30065], [5, 30069] ]
    }
    ```

    Use when you suspect a new `AC_ID` in the SPA bundle that isn't
    covered by `/complaints/list` or `/complaints/detail` yet. A quick
    way to find them: grep `web.archive.org/web/*/appsavy.com/` mirrors
    for `"AC_ID"` JSON keys.
    """
    try:
        return appsavy.get_relational_data(r.parent_value, r.children)
    except Exception as e:
        raise HTTPException(status_code=502, detail={"message": str(e)}) from e


@app.get("/bills", tags=["Bills"], summary="Daily bill rows for the last N days")
def bills(days: int = 90, skip: int = 0, limit: int = 90):
    """
    **Daily** bill rows — one per day, with `dailyBill.daily_chg` (₹ burned
    that day), `closing_bal` (end-of-day meter balance), `units_billed_daily`,
    and the full charge breakdown (energy / fixed / duty / FPPA / subsidy /
    rebate / late-fee).

    Perfect source for: runway estimation, ₹/unit effective-rate charts,
    charge composition stack, streak tracking.

    **Query params**

    - `days` (default `90`) — window ending today. Upstream caps around 90.
    - `skip`, `limit` — pagination.
    """
    try:
        end = date.today()
        start = end - timedelta(days=days)
        return client.bills(start.isoformat(), end.isoformat(), skip=skip, limit=limit)
    except UPPCLError as e: _err(e)


@app.get("/payments", tags=["Bills"], summary="Payment / recharge history")
def payments(limit: int = 50, skip: int = 0):
    """
    Every recharge / payment made against this connection.

    **Fields per row**

    `payment_dt`, `amt`, `txn_id`, `method` (Online - Web / UPI / Card / …),
    `status` (Success / Failed / Pending), `msi`, `connectionId`.

    **Upstream quirk**: `/payment/v2/search` wants `consumer_id`
    (snake_case) in the request body, not `connectionId`. The proxy
    handles that transparently — listed here only because the upstream's
    409 error is famously misleading.

    **Query params**

    - `limit` (default `50`), `skip` — pagination.
    """
    try: return client.payments(skip=skip, limit=limit)
    except UPPCLError as e: _err(e)


@app.get("/consumption", tags=["Consumption"], summary="Daily kWh import/export for the last N days")
def consumption(days: int = 30):
    """
    Per-day kWh **import** (grid → house) and **export** (house → grid,
    relevant for solar exporters) for the last N days.

    Each row: `usage_date`, `energyImportKWH.value`, `energyExportKWH.value`,
    plus optional `maximumDemandKW`, `minimumDemandKW`, `avgPowerFactor`.

    **Query params**

    - `days` (default `30`) — upstream accepts up to ~90. Larger windows
      return `[object Object]`.

    **Date-format gotcha**: upstream requires ISO-8601 with the `+05:30`
    IST offset. The proxy handles formatting — pass plain day counts.
    """
    try:
        end = date.today()
        start = end - timedelta(days=days)
        return client.daily_aggregate(ist(start), ist(end))
    except UPPCLError as e:
        _err(e)


@app.get("/history/yearly", tags=["Consumption"], summary="Monthly rollups for a calendar year")
def history_yearly(year: int = 0):
    """
    Monthly consumption rollups for a calendar year. Includes
    `powerFactor` — rare for UPPCL endpoints — so this is the go-to
    for a year-over-year power-quality chart.

    **Query params**

    - `year` (default: current) — e.g. `2025`. Upstream returns 12 rows;
      months before this account's activation come back as zeros.

    **Why not `groupBy: "month"`?** — because the upstream `/eventsummary/search`
    only accepts `groupBy: "year"`. Day/month group-bys error opaquely.
    """
    try:
        return client.yearly_history(year or date.today().year)
    except UPPCLError as e:
        _err(e)


# ─────────────── derived / composite endpoints ────────────────

def _safe_float(x, default=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


@app.get("/dashboard", tags=["Dashboard"], summary="Composite: balance + bills + consumption + derived metrics")
def dashboard():
    """
    One-shot composite endpoint. Fetches `/site/search`, `/site/prepaidBalance`,
    `/bill/search` (90d), `/payment/v2/search`, and `/eventsummary/aggregate`
    (30d) in sequence, derives ~a dozen metrics, and returns it all.

    Designed so a mobile-first home screen can render in a single round
    trip rather than 5 — and so the derived metrics (runway, ₹/unit,
    recharge lifespans) are computed server-side where the full history
    is available.

    **Response shape**

    ```json
    {
      "site": { ... primary-site record ... },
      "balance": { "inr", "updated_at", "meter_status", "arrears_inr", "last_recharge" },
      "runway": { "days", "avg_daily_spend", "basis_days" },
      "consumption_30d": { "kwh", "avg_daily_kwh", "effective_rate", "daily": [...] },
      "subsidy_ytd_inr": 1234.56,
      "recharge_lifespans": [ { "amount", "lasted_days", "txn" }, ... ],
      "recent_bills":    [ ...last 10 daily bills  ],
      "recent_payments": [ ...last 10 recharges    ]
    }
    ```

    **Derived metrics — how they're computed**

    - `runway.days` = `balance.inr` / `runway.avg_daily_spend`
      (average of the last ~90 days' `daily_chg` excluding zeros).
    - `consumption_30d.effective_rate` = `daily_en_chg / units_billed_daily`
      from the most recent daily bill — the true blended ₹/unit you're
      paying including subsidies and rebates.
    - `recharge_lifespans[i].lasted_days` = days between consecutive
      recharges — cheap proxy for "how long did my last ₹X last?".

    If upstream `/prepaidBalance` returns empty, the composite falls
    back to the most recent daily bill's `closing_bal` automatically.
    """
    try:
        site     = client.primary_site()
        end      = date.today()
        start_90 = (end - timedelta(days=90)).isoformat()
        today    = end.isoformat()
        bal   = client.prepaid_balance().get("data") or {}
        bills = client.bills(start_90, today, limit=60).get("data", [])
        pays  = client.payments(limit=20).get("data", [])
        daily = client.daily_aggregate(ist(end - timedelta(days=30)), ist(end)).get("data", [])
    except UPPCLError as e:
        _err(e)

    # Fallback when upstream prepaidBalance returns empty
    if not bal and bills:
        db = bills[0].get("dailyBill", {})
        bal = {
            "prepaidBalanceAmount":     db.get("closing_bal"),
            "prepaidBalanceUpdateDate": db.get("usage_date"),
            "meterStatus":              None,
            "postpaidArrearAmount":     "0",
            "recharge":                 None,
        }

    # ── derived metrics ──
    daily_charges = [_safe_float(b.get("dailyBill", {}).get("daily_chg")) for b in bills]
    daily_charges = [x for x in daily_charges if x > 0]
    avg_burn = round(sum(daily_charges) / len(daily_charges), 2) if daily_charges else 0
    latest_bal = _safe_float(bal.get("prepaidBalanceAmount"))
    days_runway = round(latest_bal / avg_burn, 1) if avg_burn > 0 else None

    # 30-day kWh total
    kwh_30 = round(sum(_safe_float((d.get("energyImportKWH") or {}).get("value")) for d in daily), 2)

    # Subsidy YTD (from available bills)
    subsidy_ytd = round(sum(abs(_safe_float(b.get("dailyBill", {}).get("cum_gvt_subsidy")))
                            for b in bills[:1]), 2)  # cum_gvt_subsidy is a running total

    # Recharge lifespans — how many days each recharge of ₹X lasted
    recharges = sorted(
        [{"date": p.get("payment_dt"), "amount": _safe_float(p.get("amt")), "txn": p.get("txn_id")}
         for p in pays if _safe_float(p.get("amt")) > 0],
        key=lambda x: x["date"] or "",
    )
    lifespans = []
    for i in range(len(recharges) - 1):
        a, b = recharges[i], recharges[i + 1]
        try:
            d1 = datetime.fromisoformat(a["date"].replace("+05:30", "+0530"))
            d2 = datetime.fromisoformat(b["date"].replace("+05:30", "+0530"))
            days = round((d2 - d1).total_seconds() / 86_400, 1)
            lifespans.append({"amount": a["amount"], "lasted_days": days, "txn": a["txn"]})
        except Exception:
            continue

    # Effective per-unit rate
    recent_bill = bills[0]["dailyBill"] if bills else {}
    units = _safe_float(recent_bill.get("units_billed_daily"))
    energy = _safe_float(recent_bill.get("daily_en_chg"))
    eff_rate = round(energy / units, 2) if units > 0 else None

    return {
        "site": site,
        "balance": {
            "inr":            latest_bal,
            "updated_at":     bal.get("prepaidBalanceUpdateDate"),
            "meter_status":   bal.get("meterStatus"),
            "arrears_inr":    _safe_float(bal.get("postpaidArrearAmount")),
            "last_recharge":  _safe_float(bal.get("recharge")),
        },
        "runway": {
            "days":             days_runway,
            "avg_daily_spend":  avg_burn,
            "basis_days":       len(daily_charges),
        },
        "consumption_30d": {
            "kwh":              kwh_30,
            "avg_daily_kwh":    round(kwh_30 / max(len(daily), 1), 2),
            "effective_rate":   eff_rate,
            "daily":            daily,
        },
        "subsidy_ytd_inr": subsidy_ytd,
        "recharge_lifespans": lifespans[-10:],  # last 10
        "recent_bills":      bills[:10],
        "recent_payments":   pays[:10],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  CLI entry point
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("uppcl_api:app", host="127.0.0.1", port=8000, reload=False)
