# UPPCL Pro — product vision: beating the official app

**Thesis.** UPPCL's own app shows raw numbers behind feature flags. Our edge is **intelligence
and proactivity** — forecasts, warnings, optimization, and a clean unified experience — that works
equally well for **prepaid and postpaid**. The official app makes you read; ours tells you what to do.

Grounded in `docs/api-reverse-engineering.md` (what data exists) and the existing Kinetic Vault
design system (`src/app/globals.css`, `src/components/viz/*`).

---

## What UPPCL offers (their feature catalog, from `tenant/searchPreference`)

balance/arrears · view+download bill · payment history · prepaid ledger · monthly summary ·
usage (energy, daily avg, last month, **max demand**, voltage, PF, load) · **carbon emission** ·
**appliance-level trends + saving tips** · **solar calculator** · budget · alerts + meter alerts ·
announcements/outage · myTariff · autopay · charges & adjustments · service requests · native
tickets · EV charging · multi-connection · offline payment centers · chatbot/FAQ.

We already beat them on: runway forecasting, anomaly detection, recharge sweet-spot, cost
composition, meter-integrity analytics. We're **missing**: postpaid support, bill PDFs, PF/demand
intelligence, carbon, appliance view, tips, tariff/slab optimization, solar, native tickets, support hub.

---

## Step 2 — Features (prioritized by value × feasibility)

### Tier 1 — Foundation & parity (must-have)
1. **Adaptive prepaid/postpaid dashboard.** Detect `site.connectionType`. Prepaid hero =
   balance + runway (current). Postpaid hero = **amount due + bill-cycle countdown + this-month
   projection**. Everything below adapts. *Data: outstandingBalance, billHistory(monthlyBill).*
2. **Bill vault.** Full invoice history timeline + one-tap **official PDF download**. Credits
   (negative `bill_amt`) shown as "in advance." *Data: billHistory (array), bill/download.*

### Tier 2 — Intelligence that UPPCL lacks (the differentiators)
3. **Power-quality intelligence.** PF dial (penalty risk if <0.9) + **max-demand vs sanctioned
   load (4 kW)** gauge with "you hit 92% of sanctioned load" warning + load-enhancement advice.
   *Data: eventsummary power/powerKVA/powerFactor, site.sanctionedLoad.*
4. **Tariff & next-bill engine.** Derive effective ₹/kWh from bills; project current cycle's bill
   from live daily kWh; "you're ₹X / Y units from the next slab." Due-date countdown for postpaid.
   *Data: billHistory + eventsummary kWh + derived rate.*
5. **Carbon footprint tracker.** kWh × 0.71 kg CO₂; monthly trend + relatable equivalents
   (trees, km driven). *Derived from eventsummary.*
6. **Contextual saving tips.** Not generic — triggered by signals: low PF → PF tip; high night
   base load → nightbaseload tip; spike → relevant appliance. Localized en/hi.
   *Data: savingTip/getOne by appliance.*

### Tier 3 — Reach & retention
7. **Appliance disaggregation** ("where your power goes"). Auto-activates when `dadata/v2/search`
   returns data; until then a "learning your usage" state. *Data: dadata/v2/search.*
8. **Unified alerts & tickets.** Meter alarms + native UPPCL tickets + 1912 complaints in one feed;
   raise/track from the app. *Data: alarms/search, ticket/search+create, existing complaints.*
9. **Usage budgets with smart alerts.** Set a ₹/kWh budget; combine with projection: "you'll exceed
   ₹X by the 22nd." *Data: connectionbudget/create+search.*
10. **Solar what-if.** Payback calculator from consumption + roof size; show export earnings if
    solar present. *Data: eventsummary export + derived.*
11. **Support hub & outage.** One-tap call 1912 / WhatsApp (+917859804803) / email; live downtime
    banner. *Data: discomDetails, announcements/activeDowntimeAnnouncement.*

---

## Step 3 — UX principles

- **Adaptive, not duplicated.** One dashboard that reshapes by `connectionType`. No separate apps.
- **Proactive insight strip.** Top-of-home row of *actions*, not charts: "Recharge ₹500 by Jun 18",
  "PF dropped to 0.88 — penalty risk", "92% of sanctioned load on Jun 9", "Bill due in 13 days,
  projected ₹1,980". Each links to the relevant drill-in. This is the core "beats UPPCL" moment.
- **Progressive disclosure.** Hero → KPI tiles → click-to-drill `SidePanel` (existing pattern).
- **Bilingual everywhere.** Extend next-intl from login to the whole dashboard (en/hi).
- **Honest empty states.** "Learning your usage" (appliance), "in advance" (credit) — never blank.
- **Mobile-first.** The recent mobile-UX pass (commit c86a16a) is the baseline; new viz must collapse.

---

## Step 4 — UI (reuse Kinetic Vault; new pieces listed)

Reuse: `Tile`, `SidePanel`, `Donut`, `RunwayGauge`, `LineChart`, `Sparkline`, `CalendarHeatmap`,
`StackedBar`, `EventTimeline`, `Toast`, the surface/`--color-chart-*` tokens, `animate-count-up`.

New components (same SVG-first, no chart lib):
- `viz/RadialGauge` — generalize `RunwayGauge` for PF (0–1) and max-demand-vs-sanctioned (0–100%).
- `viz/BillCycleRing` — postpaid cycle progress + projected amount in center.
- `viz/SlabBar` — tariff-slab position with "distance to next slab" marker.
- `viz/CarbonCounter` — animated CO₂ value + equivalence chips.
- `InsightStrip` — the proactive action row (horizontal scroll on mobile).
- `BillVault` — invoice timeline rows with download buttons (extends `EventTimeline`).
- `ApplianceBreakdown` — donut + per-appliance rows (with learning state).
- `SupportHub` — call/WhatsApp/email/outage card.

Home layout (adaptive):
```
[ InsightStrip — proactive actions ]
[ Hero: prepaid(balance+runway) | postpaid(amountDue+BillCycleRing+projection) ]
[ KPI tiles: kWh today · this-month kWh · PF · max demand · carbon · effective ₹/kWh ]
[ Power-quality + Tariff/slab panels ]   [ Saving tips (contextual) ]
[ Bill vault preview ]                    [ Alerts/tickets feed ]
```

---

## Build roadmap

- **Phase 0 (foundation, this PR):** `connectionType` + `userId` in session/types; adaptive
  fetchers in `src/lib/api.ts` (postpaid balance/bill, full billHistory, eventsummary `uom`/year,
  PF/demand, tips); `/bootstrap/api` proxy route; new hooks. Non-breaking, additive.
- **Phase 1:** Adaptive home + InsightStrip + postpaid hero (Tier 1).
- **Phase 2:** Power-quality + tariff/next-bill + carbon (Tier 2).
- **Phase 3:** Tips, appliance, alerts/tickets, budgets, solar, support hub (Tier 3).
- **Cross-cutting:** extend next-intl to dashboard strings as each phase lands.
</content>
