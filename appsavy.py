"""
Appsavy (UPPCL 1912 complaint portal) client.

The portal at https://appsavy.com/coreapps/UI/Form?FormId=4235 does complaint
tracking. It's a public anonymous-session form; bootstrap via
    GET /coreapps/UI/Anonymous?PROJECTID=119&FORMID=4235
which sets `.configapps.Session` + antiforgery cookies.

All subsequent API calls to /api/AppsavyServices/* use 5 encrypted headers;
key = iv = literal ASCII "8080808080808080" (AES-128-CBC, PKCS7).
"""
from __future__ import annotations

import base64
import logging
import threading
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import httpx
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.padding import PKCS7

log = logging.getLogger("uppcl.appsavy")

BASE_URL     = "https://appsavy.com"
BOOTSTRAP    = f"{BASE_URL}/coreapps/UI/Anonymous"
API          = f"{BASE_URL}/coreapps/api/AppsavyServices"
PROJECT_ID   = "119"   # UPPCL "Outage Management System" project on Appsavy
FORM_ID      = "4235"  # complaint-tracking form
ROLE_ID      = "883"   # anonymous role
COMPANY_ID   = "64"
EVENT_CONTROL = "38068"  # complaint-detail aggregator event

# Phone-search grid: the grid's Event_Control_Id + the row-aggregator Child.
# From appsavy.com-phone.har: event 38064, child 38068, AC_ID 30065,
# Parent Control 38062 = phone input.
LIST_EVENT_CONTROL      = "38064"
LIST_CHILD_CONTROL      = "38068"
LIST_CHILD_AC_ID        = "30065"
LIST_PARENT_CONTROL     = "38062"   # "mobile number" input field id
SESSION_TTL_S = 20 * 60  # ASP.NET Core session default ≈ 20 min

# AES helpers — cheap, deterministic, no state.
_KEY = _IV = b"8080808080808080"

def _aes_b64(plain: bytes) -> str:
    padder = PKCS7(128).padder()
    padded = padder.update(plain) + padder.finalize()
    enc = Cipher(algorithms.AES(_KEY), modes.CBC(_IV)).encryptor()
    return base64.b64encode(enc.update(padded) + enc.finalize()).decode()


def _encrypted_headers() -> dict[str, str]:
    """The 5 AES-CBC-encoded auth headers — all constant, never rotated."""
    return {
        "appsavylogin": _aes_b64(b"anonymous"),
        "formid":       _aes_b64(FORM_ID.encode()),
        "roleid":       _aes_b64(ROLE_ID.encode()),
        "sourcetype":   _aes_b64(b"WEB"),
        "token":        _aes_b64(b""),   # #xcode hidden input is blank for anon
    }


# ────────────────────────────────────────────────────────────────────────────
# The 39-column schema of the complaint-detail query (Event Control 38068).
# Each entry: Child Control_Id, AC_ID, friendly JSON field name.
# Derived from a real capture + the returned Rowset element names.
# ────────────────────────────────────────────────────────────────────────────
COMPLAINT_FIELDS: list[tuple[int, int, str]] = [
    (52071,  39534,  "customer_account_no"),
    (38886,  30729,  "address"),
    (38802,  30652,  "ae_mobile"),
    (38801,  30649,  "ae_name"),
    (132178, 171344, "assigned_to"),
    (132179, 171345, "base_level"),
    (141575, 196468, "c141575"),
    (52072,  39533,  "subdivision"),
    (52070,  39532,  "substation"),
    (49309,  37796,  "userid"),
    (44465,  33863,  "xen_mobile"),
    (44464,  33861,  "xen_name"),
    (38799,  30650,  "je_label"),
    (141568, 196464, "mobileno"),
    (53818,  41156,  "primary_complaint_no"),
    (143359, 195495, "initial_iuv_login"),
    (141574, 196467, "remarks"),
    (76757,  61895,  "source"),
    (140740, 189709, "consumer_name_a"),
    (141570, 196463, "consumer_name_b"),
    (141566, 196462, "entrydate"),
    (141569, 196465, "c141569"),
    (49308,  37795,  "initial_user"),
    (38800,  30651,  "je_mobile"),
    (38069,  30066,  "complaint_status_short"),
    (141567, 196466, "complaint_status"),
    (38884,  30728,  "com_sub_type_name"),
    (38883,  30727,  "com_type_name"),
    (140741, 189711, "mobileno_b"),
    (141572, 196470, "closingdate"),
    (141573, 196469, "closingremarks"),
    (44941,  33869,  "closedby"),
    (140763, 189749, "data_id"),
    (141571, 196471, "complaint_no"),
    (38070,  30076,  "summary_v1"),
    (83024,  66362,  "summary_v2"),
    (144430, 198595, "c144430"),
    (93222,  81760,  "complaint_no_alt"),
    (38812,  30669,  "c38812"),
]


def _build_relational_xml(parent_value: str, children: list[tuple[int, int]]) -> str:
    head = (
        '<?xml version="1.0"?>'
        '<Request VERSION="2" LANGUAGE_ID="" LOCATION="">'
        f'<Company Company_Id="{COMPANY_ID}" />'
        f'<Project Project_Id="{PROJECT_ID}" />'
        '<User User_Id="anonymous" />'
        '<IUVLogin IUVLogin_Id="anonymous" />'
        f'<ROLE ROLE_ID="{ROLE_ID}" />'
        f'<Event Control_Id="{EVENT_CONTROL}" />'
    )
    body = "".join(
        f'<Child Control_Id="{cid}" Report="HTML" AC_ID="{ac}">'
        f'<Parent Control_Id="{EVENT_CONTROL}" Value="{parent_value}" Data_Form_Id=""/>'
        f'</Child>'
        for cid, ac in children
    )
    return head + body + "</Request>"


@dataclass
class AppsavySession:
    client: httpx.Client
    created_at: float = field(default_factory=time.time)

    def expired(self) -> bool:
        return (time.time() - self.created_at) > SESSION_TTL_S


class AppsavyClient:
    """Anonymous-session client for appsavy. Thread-safe, single cached session."""

    def __init__(self) -> None:
        self._session: AppsavySession | None = None
        self._lock = threading.Lock()

    def _bootstrap(self) -> AppsavySession:
        client = httpx.Client(
            timeout=30,
            follow_redirects=True,
            headers={
                "user-agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/147.0.0.0 Safari/537.36"
                ),
            },
        )
        log.info("bootstrapping anonymous appsavy session")
        r = client.get(
            BOOTSTRAP,
            params={"PROJECTID": PROJECT_ID, "FORMID": FORM_ID},
            headers={"accept": "text/html"},
        )
        r.raise_for_status()
        if ".configapps.Session" not in {c.name for c in client.cookies.jar}:
            raise RuntimeError(
                "anonymous bootstrap didn't set .configapps.Session cookie "
                f"(status {r.status_code}, final URL {r.url})"
            )
        return AppsavySession(client=client)

    def _ensure_session(self) -> AppsavySession:
        with self._lock:
            s = self._session
            if s is None or s.expired():
                s = self._bootstrap()
                self._session = s
            return s

    def _post_api(self, method: str, input_xml: str, *, retry_once: bool = True) -> str:
        s = self._ensure_session()
        headers = {
            "accept":           "application/xml, text/xml, */*; q=0.01",
            "content-type":     "application/json",
            "origin":           BASE_URL,
            "referer":          f"{BASE_URL}/coreapps/UI/Form?FormId={FORM_ID}",
            "version":          "1",
            "x-requested-with": "XMLHttpRequest",
            **_encrypted_headers(),
        }
        payload = {
            "inputxml": base64.b64encode(input_xml.encode()).decode(),
            "DocVersion": 1,
        }
        r = s.client.post(f"{API}/{method}", json=payload, headers=headers)
        if r.status_code == 401 and retry_once:
            log.info("appsavy session expired; re-bootstrapping and retrying")
            with self._lock:
                self._session = None
            return self._post_api(method, input_xml, retry_once=False)
        if r.status_code != 200:
            raise RuntimeError(f"appsavy {method} HTTP {r.status_code}: {r.text[:200]}")
        return r.text

    # ─── public methods ────────────────────────────────────────────────────

    def list_by_phone(self, phone: str) -> list[dict[str, Any]]:
        """List all complaints tied to a phone number. Returns list of dicts
        with keys: data_id, complaint_no, type, sub_type, mobile_no, status.
        """
        if not phone or not phone.isdigit():
            raise ValueError("phone must be a non-empty digit-only string")

        xml = (
            '<?xml version="1.0"?>'
            '<Request VERSION="2" LANGUAGE_ID="" LOCATION="">'
            f'<Company Company_Id="{COMPANY_ID}" />'
            f'<Project Project_Id="{PROJECT_ID}" />'
            '<User User_Id="anonymous" />'
            '<IUVLogin IUVLogin_Id="anonymous" />'
            f'<ROLE ROLE_ID="{ROLE_ID}" />'
            f'<Event Control_Id="{LIST_EVENT_CONTROL}" />'
            f'<Child Control_Id="{LIST_CHILD_CONTROL}" Report="HTML" AC_ID="{LIST_CHILD_AC_ID}">'
            f'<Parent Control_Id="{LIST_PARENT_CONTROL}" Value="{phone}" Data_Form_Id=""/>'
            '</Child>'
            '</Request>'
        )
        raw = self._post_api("GetRelationalDataA", xml)

        out: list[dict[str, Any]] = []
        try:
            root = ET.fromstring(raw)
        except ET.ParseError:
            return out
        for res in root.iter("RESULTS"):
            for rs in res.findall("Rowset"):
                row = {el.tag: (el.text or "").strip() for el in rs}
                status = row.get("COMPLAINT_STATUS", "")
                out.append({
                    "data_id":       row.get("DATA_ID"),
                    "complaint_no":  row.get("COMPLAINT_NO"),
                    "type":          row.get("COM_TYPE_NAME"),
                    "sub_type":      row.get("COM_SUB_TYPE_NAME"),
                    "mobile_no":     row.get("MOBILENO"),
                    "status":        status,
                    "is_open":       bool(status) and "CLOSE" not in status.upper(),
                })
        return out

    def get_complaint_detail(self, data_id: str) -> dict[str, Any]:
        """Full detail for a single complaint by its internal DATA_ID."""
        xml = _build_relational_xml(data_id, [(cid, ac) for cid, ac, _ in COMPLAINT_FIELDS])
        raw = self._post_api("GetRelationalDataA", xml)
        return self._parse_complaint_detail(raw)

    def list_with_details(self, phone: str) -> list[dict[str, Any]]:
        """
        Full-detail complaint history for a phone, sorted newest-first.
        Fans out the detail calls in parallel so the client sees one batch.
        """
        summaries = self.list_by_phone(phone)
        if not summaries:
            return []
        with ThreadPoolExecutor(max_workers=min(8, len(summaries))) as ex:
            details = list(ex.map(
                lambda s: self.get_complaint_detail(s["data_id"]),
                summaries,
            ))
        # Newest-first by ENTRYDATE ("18/04/2026 10:56:30 PM").
        def sort_key(d: dict[str, Any]) -> datetime:
            raw = d.get("entry_date") or ""
            for fmt in ("%d/%m/%Y %I:%M:%S %p", "%d-%m-%Y %H:%M:%S", "%d/%m/%Y"):
                try:
                    return datetime.strptime(raw.strip(), fmt)
                except ValueError:
                    continue
            return datetime.min
        details.sort(key=sort_key, reverse=True)
        return details

    def get_relational_data(
        self, parent_value: str, children: list[tuple[int, int]]
    ) -> dict[str, Any]:
        """Escape-hatch: run an arbitrary GetRelationalDataA and return raw rowsets."""
        xml = _build_relational_xml(parent_value, children)
        raw = self._post_api("GetRelationalDataA", xml)
        return {"raw": raw, "blocks": self._parse_all_blocks(raw)}

    # ─── XML parsing ───────────────────────────────────────────────────────

    @staticmethod
    def _parse_all_blocks(raw: str) -> list[dict[str, Any]]:
        """Parse each <RESULTS ...><Rowset>...</Rowset></RESULTS> into a dict."""
        blocks: list[dict[str, Any]] = []
        try:
            root = ET.fromstring(raw)
        except ET.ParseError:
            return blocks
        for res in root.iter("RESULTS"):
            ac = res.get("AC_ID", "")
            child = res.get("CHILDCONTROLID", "")
            rows = []
            for rs in res.findall("Rowset"):
                row = {el.tag: (el.text or "").strip() for el in rs}
                if row:
                    rows.append(row)
            blocks.append({
                "child_control_id": child,
                "ac_id": ac,
                "rows": rows,
            })
        return blocks

    def _parse_complaint_detail(self, raw: str) -> dict[str, Any]:
        """Flatten a 38068-aggregator response into a single-complaint object."""
        by_ac: dict[str, dict[str, str]] = {}
        for block in self._parse_all_blocks(raw):
            rows = block["rows"]
            if not rows:
                continue
            by_ac[block["ac_id"]] = rows[0]

        # First, unify all keys found across all rows (the server returns them
        # alongside the ac_id-specific label, which is useful fallback).
        merged: dict[str, str] = {}
        for row in by_ac.values():
            for k, v in row.items():
                if v and k not in merged:
                    merged[k] = v

        def pick(*names: str) -> str | None:
            for n in names:
                v = merged.get(n)
                if v:
                    return v
            return None

        status_raw = pick("COMPLAINT_STATUS")
        is_open = status_raw and "CLOSE" not in status_raw.upper()

        return {
            "data_id":           pick("DATA_ID"),
            "complaint_no":      pick("COMPLAINT_NO"),
            "status":            status_raw,
            "is_open":           bool(is_open),
            "entry_date":        pick("ENTRYDATE"),
            "closing_date":      pick("CLOSINGDATE"),
            "consumer_name":     pick("CONSUMER_NAME"),
            "mobile_no":         pick("MOBILENO"),
            "address":           pick("ADDRESS"),
            "customer_account":  pick("CUSTOMERACNTNO"),
            "remarks":           pick("REMARKS"),
            "closing_remarks":   pick("CLOSINGREMARKS"),
            "closed_by":         pick("CLOSEDBY"),
            "type":              pick("COM_TYPE_NAME"),
            "sub_type":          pick("COM_SUB_TYPE_NAME"),
            "source":            pick("SRC"),
            "je_name":           pick("JE_NAME"),
            "je_mobile":         pick("JE_MOBILE"),
            "ae_name":           pick("AE_NAME"),
            "ae_mobile":         pick("AE_MOBILE"),
            "xen_name":          pick("XEN_NAME"),
            "xen_mobile":        pick("XEN_MOBILE"),
            "subdivision":       pick("SUBDIVISION"),
            "substation":        pick("SUBSTATION"),
            "assigned_to":       pick("ASSIGNED_TO"),
            "base_level":        pick("BASE_LEVEL"),
            "initial_user":      pick("INITIALUSER"),
            "raw_fields":        merged,   # full bag for debugging / UI overflow
        }


# Module-level singleton; uppcl_api.py imports this.
appsavy = AppsavyClient()
