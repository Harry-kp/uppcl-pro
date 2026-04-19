#!/usr/bin/env python3
"""
Scan every committable file in the repo for personal identifiers that
shouldn't leak into an open-source release.

Exits non-zero if anything matches — CI and `make check-pii` use this.

The PII patterns are loaded from `scripts/pii.json` (gitignored — fill
in your own values from `scripts/pii.sample.json`). This file itself
contains ZERO PII, so it's safe to commit.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", "venv", ".venv", ".next", "out",
    "docs/screenshots",  # they're screenshots — grep won't catch the pixels
}
SKIP_FILES = {
    ".env", "uppcl_session.json",
    # This script trivially wouldn't match its own content (no PII
    # literals here any more), but keep these self-exclusions for the
    # other config-bearing files.
    "pii.json",
    "pii.sample.json",
    # redactions.js is parameterized by pii.json at runtime — it no
    # longer embeds literals, so scanning is safe. Listed here in case
    # someone re-hardcodes values during debugging.
    "redactions.js",
}
SKIP_EXTS = {".har", ".png", ".jpg", ".jpeg", ".ico", ".woff", ".woff2", ".ttf"}

PII_FILE = Path(__file__).parent / "pii.json"


def _load_patterns() -> dict[str, str]:
    """
    Build a `{label: regex}` map from pii.json.

    Keeps the script's own source tree free of any real PII — every value
    comes from the gitignored config. Returns an empty map (with a
    warning) if the file is missing, so first-time contributors don't
    get a surprise false-positive wall.
    """
    if not PII_FILE.exists():
        print(f"⚠ {PII_FILE.relative_to(ROOT)} not found — copy pii.sample.json "
              "and fill it in, or scans will be a no-op.")
        return {}

    p = json.loads(PII_FILE.read_text())
    patterns: dict[str, str] = {}

    def _literal(label: str, value: str | None):
        if value:
            patterns[label] = r"\b" + re.escape(value) + r"\b"

    def _regex(label: str, source: str | None, flags: str = ""):
        if source:
            patterns[label] = source

    _literal("connectionId",          p.get("connectionId"))
    _literal("deviceId",              p.get("deviceId"))
    _literal("meter installation #",  p.get("meterInstall"))
    _literal("phone (primary)",       p.get("phone"))
    _literal("pincode",               p.get("pincode"))
    _literal("tenantCode UUID",       p.get("tenantCode"))
    _literal("user _id",              p.get("userId"))
    _literal("site _id",              p.get("siteId"))
    _literal("consumer name",         p.get("consumerName"))
    _literal("author tag",            p.get("authorTag"))
    _literal("employer",              p.get("employer"))
    _literal("invoice id",            p.get("invoiceId"))

    _literal("subdivision",           p.get("subDivision"))
    _literal("address city",          p.get("addressCity"))
    _regex  ("address area",          p.get("addressAreaRegex"))
    _regex  ("substation",            p.get("substationRegex"))
    _regex  ("address fragment",      p.get("addressFragmentRegex"))

    for i, pv in enumerate(p.get("complaintNumbers") or []):
        _literal(f"complaint #{i+1}",         pv)
    for i, did in enumerate(p.get("complaintDataIds") or []):
        _literal(f"complaint DATA_ID #{i+1}", did)
    for i, txn in enumerate(p.get("txnIds") or []):
        _literal(f"txn id #{i+1}",            txn)

    for i, o in enumerate(p.get("officers") or []):
        _regex(f"officer #{i+1}",             o.get("pattern"))
    for i, op in enumerate(p.get("officerPhonePatterns") or []):
        _regex(f"officer phone #{i+1}",       op.get("pattern"))

    return patterns


PATTERNS = _load_patterns()


def _should_scan(path: Path) -> bool:
    try:
        rel = path.relative_to(ROOT)
    except ValueError:
        return False
    for part in rel.parts:
        if part in SKIP_DIRS:
            return False
    if rel.name in SKIP_FILES:
        return False
    if path.suffix.lower() in SKIP_EXTS:
        return False
    return path.is_file()


def main() -> int:
    if not PATTERNS:
        print("✓ 0 patterns to scan for (pii.json empty or missing).")
        return 0

    hits: list[tuple[Path, list[str]]] = []
    scanned = 0
    for p in ROOT.rglob("*"):
        if not _should_scan(p):
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except (OSError, UnicodeDecodeError):
            continue
        scanned += 1
        found = [name for name, pat in PATTERNS.items() if re.search(pat, text, re.I)]
        if found:
            hits.append((p.relative_to(ROOT), found))

    if not hits:
        print(f"✓ {scanned} files scanned against {len(PATTERNS)} patterns. No PII matched.")
        return 0

    print(f"⚠ {len(hits)} file(s) contain personal identifiers:\n")
    for rel, names in hits:
        print(f"  {rel}")
        for n in names:
            print(f"    · {n}")
    print("\nRun `make check-pii` after scrubbing, then retry.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
