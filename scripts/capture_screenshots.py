#!/usr/bin/env python3
"""
Capture README-ready screenshots of every dashboard route, in both dark and
light themes. Output: docs/screenshots/<route>-<theme>.png

Usage:
    # one-time
    pip install playwright && playwright install chromium

    # run (assumes proxy on :8000 and dashboard on :3000 are already up)
    python scripts/capture_screenshots.py

    # or let it start them for you
    python scripts/capture_screenshots.py --start

The script waits for SWR to settle before each capture so charts render with
real data. If your session has expired you'll see the "not logged in" state —
log in first.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "screenshots"
OUT_DIR.mkdir(parents=True, exist_ok=True)

REDACTIONS_JS = (Path(__file__).parent / "redactions.js").read_text()

# PII config is gitignored. Fall back to the sample (dummy placeholders)
# if the user hasn't filled theirs in yet — redaction becomes a no-op for
# fields without a real value, which is still safe.
_PII_FILE    = Path(__file__).parent / "pii.json"
_PII_SAMPLE  = Path(__file__).parent / "pii.sample.json"
PII_CONFIG: dict = json.loads((_PII_FILE if _PII_FILE.exists() else _PII_SAMPLE).read_text())

# Routes to capture. Each gets both themes + an optional `settle` callback
# that can open side panels, hover tiles, etc. before the shot.
ROUTES: list[tuple[str, str]] = [
    ("/",            "home"),
    ("/analytics",   "analytics"),
    ("/ledger",      "ledger"),
    ("/recharges",   "recharges"),
    ("/grid-nodes",  "meter"),
    ("/complaints",  "complaints"),
    ("/settings",    "settings"),
]

THEMES = ["dark", "light"]

VIEWPORT = {"width": 1440, "height": 960}  # typical laptop


async def set_theme(page, theme: str) -> None:
    await page.evaluate(
        """(theme) => {
            localStorage.setItem('theme', theme);
            document.documentElement.classList.toggle('dark', theme === 'dark');
            document.documentElement.classList.toggle('light', theme === 'light');
        }""",
        theme,
    )


async def wait_for_content(page, path: str) -> None:
    """
    Wait until the page has real data, not skeleton placeholders.

    `networkidle` is unreliable in Next.js dev mode (HMR websockets keep
    traffic open), so we explicitly wait for at least one data-bearing
    element to render. Every page renders `.animate-count-up` only after
    SWR returns real data.
    """
    try:
        await page.wait_for_selector(".animate-count-up, [data-loaded='true']", timeout=15_000)
    except Exception:
        pass
    # Let charts settle (line-chart path animations, donut count-up, etc.)
    await asyncio.sleep(2.0)
    # Fire one scroll+scroll-back to trigger any IntersectionObserver-based
    # lazy charts, then settle again.
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    await asyncio.sleep(0.5)
    await page.evaluate("window.scrollTo(0, 0)")
    await asyncio.sleep(0.5)


async def apply_redactions(page) -> None:
    """Swap PII values with realistic-looking dummies before capture."""
    await page.evaluate(REDACTIONS_JS)
    await page.evaluate("(pii) => window.__uppclRedact(pii)", PII_CONFIG)


async def capture_all(base_url: str, redact: bool) -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport=VIEWPORT, device_scale_factor=2)
        page = await context.new_page()
        # Preload the theme so the first navigation already uses it.
        await page.goto(base_url, wait_until="domcontentloaded")

        for route, slug in ROUTES:
            for theme in THEMES:
                await set_theme(page, theme)
                url = f"{base_url.rstrip('/')}{route}"
                print(f"  → {slug:<14} {theme:<6} {url}")
                await page.goto(url, wait_until="domcontentloaded")
                await set_theme(page, theme)  # re-apply after navigation
                await wait_for_content(page, route)
                if redact:
                    await apply_redactions(page)
                    # Give the DOM a tick to settle after mutations.
                    await asyncio.sleep(0.2)
                out = OUT_DIR / f"{slug}-{theme}.png"
                await page.screenshot(path=str(out), full_page=True)
                print(f"     saved {out.relative_to(ROOT)}")

        await browser.close()


def _wait_port(url: str, timeout_s: int = 30) -> bool:
    import urllib.request
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def _start_servers() -> tuple[subprocess.Popen, subprocess.Popen]:
    print("▸ starting proxy on :8000")
    venv_py = ROOT / "venv" / "bin" / "python"
    py = str(venv_py if venv_py.exists() else "python3")
    proxy = subprocess.Popen(
        [py, "-m", "uvicorn", "uppcl_api:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if not _wait_port("http://127.0.0.1:8000/health"):
        proxy.terminate()
        sys.exit("× proxy failed to start on :8000")

    print("▸ starting dashboard on :3000")
    web_cmd = ["bun", "run", "dev"] if (ROOT / "web" / "bun.lock").exists() else ["npm", "run", "dev"]
    web = subprocess.Popen(
        web_cmd, cwd=ROOT / "web",
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if not _wait_port("http://127.0.0.1:3000", timeout_s=45):
        proxy.terminate()
        web.terminate()
        sys.exit("× dashboard failed to start on :3000")
    return proxy, web


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", action="store_true",
                    help="Start the proxy + dashboard for the duration of the capture")
    ap.add_argument("--url", default=os.environ.get("DASHBOARD_URL", "http://127.0.0.1:3000"),
                    help="Where the dashboard is reachable (default: http://127.0.0.1:3000)")
    ap.add_argument("--no-redact", action="store_true",
                    help="Disable PII redaction (captures raw values — for your eyes only)")
    args = ap.parse_args()

    proxy = web = None
    try:
        if args.start:
            proxy, web = _start_servers()
        asyncio.run(capture_all(args.url, redact=not args.no_redact))
    finally:
        for p in (web, proxy):
            if p and p.poll() is None:
                p.send_signal(signal.SIGTERM)
                try: p.wait(timeout=5)
                except subprocess.TimeoutExpired: p.kill()

    print(f"\n✓ {len(ROUTES) * len(THEMES)} screenshots written to {OUT_DIR.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
