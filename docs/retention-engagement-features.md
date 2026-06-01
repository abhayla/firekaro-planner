# Retention & Engagement Features Backlog

Status: In Progress  
Owner: Growth / Lifecycle & Retention Engineer (role defined in engineering-roles.md)  
Updated: 2026-06-01  

---

## Executive Summary

FireKaro is LIVE at https://firekaro.com (2026-06-01). The v6 backend ships and Google OAuth works. User activation is high (users compute their FIRE number on day 1), but retention is unmeasured.

This backlog defines the minimal lifecycle/retention loop:

1. Activation — confirm user computed their FIRE number
2. Digests + Nudges — weekly/monthly recaps + event-triggered reminders (reuse nudge-engine.ts)
3. Onboarding templates — pre-fill Abhay's financial profile as exemplar
4. Data import — Form16/CAS parsing to bootstrap income section (future, AA-gated)

All outbound sends (email/WhatsApp) require DPDP-Act-2023 lawful consent and are spend-gated.

---

## Feature Tiers

### Tier 1: Activation + Engagement Loop (Q2–Q3 2026)

Weekly Digest (Email) - Summarize net worth change, savings rate, goal progress. Uses nudge-engine.ts + Resend/SendGrid. Requires consent at onboarding, editable in preferences. DPDP gate required.

Milestone Nudge (In-App + Email) - Triggered at 25%/50%/75%/100% FIRE mark, first ₹10L saved, goal creation, savings-rate milestone. Toast + optional email if opted-in.

Churn Win-Back (Email) - User inactive 60+ days offered "your FIRE number changed" + incentive. Batch job triggered. DPDP consent required.

Monthly Summary Card - Dashboard card showing month-over-month change in corpus, savings, goals.

Nudge-Engine Delivery - Extend nudge-engine.ts with email/WhatsApp/SMS channels and cadence (immediate, daily digest, weekly batch).

---

## Design Principles

### Reuse nudge-engine.ts

The nudge engine in src/lib/nudge-engine.ts generates nudges (trigger + template). Missing layer: delivery (email HTML via Resend, WhatsApp via Twilio, push via FCM).

Action: Extract trigger logic into scheduler. Extend with nudgeDelivery table for sent/read/clicked tracking.

### DPDP-First Consent Gate

India's DPDP Act 2023 requires:
- Purpose declaration
- User consent (opt-in at onboarding, edit in preferences)
- Consent records (userId, purpose, channel, timestamps)
- Data minimisation (send only required data)

### Privacy-First Telemetry

Track anonymousUserId, eventName, eventTime, context. No financial values in events.

### A/B Testing Framework

Assign users to treatment/control on signup. Randomize feature gates 50/50. Measure outcome. Declare winner after N users or 2 weeks.

---

## Blockers

Hard Blockers:
- DPDP Consent Framework (TODO(5W): email-only vs email+WhatsApp+push)
- Email Provider Contract (SendGrid vs Resend, DKIM setup)
- GDPR/CCPA Parity (defer or build now?)

Soft Blockers:
- No user identifier token for external sends
- No scheduled job queue (need Bull or cron)

---

## Proposed Sequencing

Phase 1A: In-App Activation (No Spend, 2 weeks)
- Extend nudge-engine to track triggers
- Render toast notifications on dashboard
- Track activation funnel

Phase 1B: Weekly Digest (Email, Spend-Gated, 3 weeks)
- DPDP approval
- Consent table + preferences UI
- Resend integration
- Batch job for sends
- Measure opens/clicks

Phase 1C: Churn Win-Back (Email, parallel)
- 60+ days inactive detection
- Re-engagement messaging

Phase 2: Onboarding + Import (Q3 2026)
- Persona templates
- Form16 parser
- AA integration

Phase 3: Measurement + Optimization (Always-On)
- Cohort analysis
- A/B testing
- Churn prediction

---

## Success Metrics

Activation Rate: Target >70% (computed FIRE number by day 1)
Day-1 Return: Target >40%
Week-2 Return: Target >25%
Digest Open Rate: Target >30%
Churn (30-day inactive): Target <20%
Feature Adoption: Form16 import >30% of power users

---

## Ownership

Growth / Lifecycle & Retention Eng - Feature ownership, loop design, messaging
Data / Analytics & Experimentation Eng - Instrumentation, funnel views, A/B harness
Privacy / Compliance (DPDP) Eng - Consent framework, legal review
Frontend Eng - Notification UX, consent UI, onboarding screens
Full-Stack Eng - Nudge delivery, Form16 parser, AA integration
QA / Test Automation - E2E tests, parser accuracy, funnel tracking

---

## TODO(5W)

DPDP Posture Decision: Email-only vs email+WhatsApp+push
Analytics Posture: What events to track? Which BI tool?
Growth Spend Budget: Email provider cost, WhatsApp cost
Account Aggregator Partnership: Which player? Contract? Timeline?

Portfolio-strategic items; surface in 5Wealths governance session.
