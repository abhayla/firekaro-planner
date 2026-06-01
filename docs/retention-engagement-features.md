# Retention & Engagement — feature backlog

**Created:** 2026-06-01 · **Status:** 🔴 Backlog (not started) · **Owner role:** Growth / Lifecycle &
Retention Engineer (`.claude/rules/engineering-roles.md`) · **Target persona:** urban salaried
accumulator (`v6-fire-planner-product-plan.md` §9).

> **Why this doc exists.** Acquisition gets a user to register; *retention* is what makes FireKaro a
> product instead of a one-time calculator. A FIRE plan is a 10–20-year journey — the value is in
> coming back to see the plan move, not in the first session. This backlog is the Tier-1 "make it
> sticky" workstream.

## Key insight — most of the engine already exists

`src/lib/nudge-engine.ts` already **generates** personalized nudges. What's missing is **delivery**:
a channel + a trigger + a cadence. So these features are mostly "wire the existing nudge output to a
channel," not "build engagement from scratch." That keeps cost low and honours Principle 3 (automate).

## Channels (lowest-friction first)

| Channel | Notes |
|---|---|
| **In-app** (banner / "what changed since last visit" card) | Free, no consent friction, ship first. The nudge-engine output surfaced on the dashboard. |
| **Email** | Weekly/monthly digest. Needs an email provider (transactional — spend) + DPDP marketing consent. |
| **WhatsApp** | **Reuse Wati.io** — Abhay already subscribes for the AP business (5W-GLOSSARY). Principle 4: reuse, don't duplicate. Per-message cost + DPDP consent + Meta template approval. |
| **Web push (PWA)** | Later — requires PWA install; lower reach for now. |

## Feature ideas (Growth lens)

### A. Periodic digest (the original idea, sharpened)
- **Weekly/monthly "your money this week"** — net-worth Δ, savings-rate, **FIRE-date movement** ("your FI date moved 2 months earlier"). The FIRE-date delta is the hook unique to this app.
- **Year-in-review / FY-in-review** — a shareable annual summary (organic growth loop too).

### B. Event-triggered nudges (higher relevance than fixed cadence)
- **Milestone celebrations** — crossed ₹1 Cr, 25%/50%/75% to FIRE, **Coast-FIRE reached**, emergency-fund fully funded.
- **On-track / off-track change** — "your plan slipped off-track" (with the one lever that fixes it).
- **Budget-day / tax-law refresh nudge** — "new FY slabs are in — re-run your plan" (pairs with the Tier-0 tax-staleness guard).
- **Appraisal / salary-hike prompt** — "got a raise? update salary and watch your FIRE date jump" (turns a life event into a re-engagement + a satisfying win).
- **Goal-deadline reminders** — child education, home down-payment approaching.
- **Market-context, calm-the-nerves** — "markets fell X% — here's what it does to *your* plan: nothing, stay the course." Behavioural-coaching is high-trust for FIRE.

### C. Habit / streak loop
- **Monthly check-in** — light prompt to refresh balances; a gentle streak (tasteful, not gamey — it's money).
- **SIP step-up reminder** — annual nudge to increase SIPs with inflation/income.

### D. Re-engagement / win-back
- **Dormant-user win-back** — "your plan's been waiting — here's what changed in the markets/your FI date since you left."

### E. Social / benchmark (privacy-careful)
- **Cohort benchmark** — "households like yours save X%" — **aggregate only**, strict DPDP/anonymisation. Defer until the Privacy role signs off.

## Prioritisation for the wedge

| P | Feature | Rationale |
|---|---|---|
| **P0** | In-app "what changed since last visit" + milestone celebrations | Free, no consent gate, reuses nudge-engine, immediate stickiness. |
| **P1** | Monthly email digest (net-worth Δ + FIRE-date move) | The core retention loop; needs email provider + consent. |
| **P1** | Appraisal / Budget-day / off-track event nudges | Highest-relevance triggers for a salaried accumulator. |
| **P2** | WhatsApp digest via Wati.io | High open-rate, but cost + consent + template approval — do after email proves the loop. |
| **P2** | Streaks, SIP step-up, win-back, year-in-review | Layer on once the base loop retains. |
| **P3** | Cohort benchmark | Privacy-heavy; gated on Analytics + DPDP maturity. |

## Cross-cutting gates (every item)

- **DPDP consent (Privacy/Compliance role)** — outbound marketing comms need lawful consent + an opt-out. This gates ALL email/WhatsApp items; build the consent + preference centre first.
- **Analytics (Data role)** — instrument open/click/return so we can prove a loop retains before scaling it (rule 22 for product).
- **Frequency cap** — one finance app over-messaging = instant unsubscribe. Hard cap + per-user channel preference.
- **Spend + outbound = escalation (`decision-authority.md`)** — standing up email/WhatsApp sending costs money and publishes to users → these flip to **escalate-before-acting**; design freely, but the "turn on real sends" step is Abhay's call.

## TODO(5W) — portfolio/strategic, not repo decisions (L-042)

- `TODO(5W):` Budget for transactional email + WhatsApp (Wati.io) message volume — recurring spend.
- `TODO(5W):` Analytics/telemetry posture for a finance app — what we may collect (privacy stance).
- `TODO(5W):` Whether retention comms cross-promote other 5W Financial products (FireKaro → IPODhan/AP funnel).

## References
- `src/lib/nudge-engine.ts` — existing nudge generation (the reuse target)
- `.claude/rules/engineering-roles.md` — Growth / Data / Privacy(DPDP) roles (added 2026-06-01)
- `docs/v6-fire-planner-product-plan.md` §9 — target persona wedge
- `5W-GLOSSARY.md` — Wati.io (WhatsApp BSP Abhay already subscribes to)
