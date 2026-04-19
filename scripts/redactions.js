// DOM-redaction helper injected before each Playwright screenshot.
//
// This file contains ZERO actual PII — only the *shape* of the
// replacements. The real values (your connection ID, phone, address,
// officer names, etc.) live in scripts/pii.json, which is gitignored.
// capture_screenshots.py loads that config and calls window.__uppclRedact
// with it as an argument.
//
// The map is one-way + deterministic: the same source value always maps
// to the same dummy so screenshots stay coherent across pages. Bills,
// consumption numbers, rates, recharge amounts, dates etc. are NOT
// touched — they don't identify anyone personally.

window.__uppclRedact = function redact(pii) {
    if (!pii) return; // no config → no-op (see scripts/pii.sample.json)

    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const lit = (s) => new RegExp("\\b" + esc(s) + "\\b", "g");
    const re  = (src, flags = "g") => new RegExp(src, flags);
    const rules = [];

    // ─── account identifiers ───────────────────────────────────────────
    if (pii.connectionId)  rules.push([lit(pii.connectionId), "1234567890"]);
    if (pii.deviceId)      rules.push([lit(pii.deviceId),     "CA1234567"]);
    if (pii.meterInstall)  rules.push([lit(pii.meterInstall), "123456789012"]);
    if (pii.phone)         rules.push([lit(pii.phone),        "9000000001"]);
    if (pii.pincode)       rules.push([lit(pii.pincode),      "110001"]);
    if (pii.consumerName)  rules.push([lit(pii.consumerName), "Alex"]);

    // ─── address (flattened as one string in the UI) ───────────────────
    if (pii.addressFragmentRegex)
        rules.push([re(pii.addressFragmentRegex, "gi"),
                    "42 Demo Street, Northville, 110001 Springfield IN"]);
    if (pii.addressAreaRegex) rules.push([re(pii.addressAreaRegex + "[^<\"]*", "gi"), "Northville"]);
    if (pii.addressCity)      rules.push([re("\\b" + esc(pii.addressCity) + "\\b[^<\"]*", "gi"), "Springfield"]);
    if (pii.subDivision)      rules.push([lit(pii.subDivision),                "EDSD-Northville"]);
    if (pii.substationRegex)  rules.push([re(pii.substationRegex, "g"),        "Central Substation"]);

    // ─── tenantCode (per-site UUID) ────────────────────────────────────
    if (pii.tenantCode)
        rules.push([re(esc(pii.tenantCode), "gi"),
                    "11111111-2222-3333-4444-555555555555"]);

    // ─── complaint identifiers ─────────────────────────────────────────
    (pii.complaintNumbers || []).forEach((pv, i) => {
        rules.push([lit(pv), `PV1000000000${i + 1}`]);
    });
    (pii.complaintDataIds || []).forEach((id, i) => {
        rules.push([lit(id), `1000000${i + 1}`]);
    });

    // ─── transaction / invoice identifiers ─────────────────────────────
    // Recharge txn IDs have the shape "CHD" + 11 uppercase alphanumerics.
    // Bill invoice IDs are 12-digit numbers starting with the DISCOM code.
    rules.push([/\bCHD[A-Z0-9]{11}\b/g,  "CHD00000000001"]);
    rules.push([/\b657\d{9}\b/g,          "100000000001"]);

    // ─── field officers (names + phones + IDs) ─────────────────────────
    (pii.officers || []).forEach(({ pattern, replacement }) => {
        rules.push([re(pattern, "g"), replacement]);
    });
    (pii.officerPhonePatterns || []).forEach(({ pattern, replacement }) => {
        rules.push([re(pattern, "g"), replacement]);
    });

    // ─── per-transaction MSI UUIDs + user/site _ids ────────────────────
    if (pii.userId) rules.push([lit(pii.userId), "1234567890abcdef12345678"]);
    if (pii.siteId) rules.push([lit(pii.siteId), "abcdef1234567890abcdef12"]);
    // Any other UUID (msi changes per call — mask defensively, keep shape)
    rules.push([
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        "deadbeef-1234-5678-9abc-def012345678",
    ]);

    const walk = (n) => {
        if (n.nodeType === 3) {
            let t = n.nodeValue;
            for (const [rex, repl] of rules) t = t.replace(rex, repl);
            if (t !== n.nodeValue) n.nodeValue = t;
        } else if (n.nodeType === 1 &&
                   n.tagName !== "SCRIPT" && n.tagName !== "STYLE") {
            for (const attr of ["title", "aria-label", "alt", "value", "placeholder"]) {
                const v = n.getAttribute && n.getAttribute(attr);
                if (!v) continue;
                let mv = v;
                for (const [rex, repl] of rules) mv = mv.replace(rex, repl);
                if (mv !== v) n.setAttribute(attr, mv);
            }
            n.childNodes.forEach(walk);
        }
    };
    walk(document.body);
};
