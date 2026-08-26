# 2026-08-27 — "Quick Number + gap hero" design options

**Reference (owner-picked):** Dezerv "Portfolio Breakdown – Retirement Edition" (YouTube `FbYnFUwdODQ`).
Transcript + feature cross-check: `D:\Abhay\Ventures\transcripts\FbYnFUwdODQ*.md`.
**Style:** GLOBAL.md §3 cobalt-blue clean-fintech (Inter, light, one strong accent, rounded cards, rings);
inputs-left / live results-right; assumptions collapsible; live recompute, no Calculate button.

| File | What it shows |
|---|---|
| `option-a-quick-number-panel.html` | Desktop-first: 10-field left panel → live "need / have / gap / do this" hero + retirement-age slider + transparent "how we got this" + corpus-vs-need chart |
| `option-b-conversational.html` | Mobile-first Dezerv-style: one question per card, "your number so far" grows as you answer, lands on the same gap hero |
| `option-c-merged.html` | **Post-review merge (recommended):** B's one-question intake (lakh inputs, live preview, house-delta hint on the question) → A's honest result (one headline number = target age; pace demoted to an annotation; "how we got this"; chart; editable answers) |
| `fk-mock.js` / `fk-mock.css` | Shared mock math (simplified real-frame; **not** the kernel) + styles |
| `shots/` | Screenshots at 390 / 1280 for review (regenerate: `node shots.mjs`) |

Both options demonstrate the four recommendation items: (1) house/big-purchase goal **counts** in the
FIRE number (hint line shows the age delta), (2) ≤10 inputs, (3) solve-for-required-monthly + gap framing,
(4) retirement-age what-if on the hero. Persona = Amit from the video, in FireKaro's honest defaults
(6% / 12% / 3.5% SWR / step-up 0 / live to 90) — so the numbers differ from Dezerv's ₹38 Cr on purpose.

Blind review 2026-08-27 (context-isolated reviewer): A 6.5 · B 6.0 → 5 fixes applied in C + the hero-contradiction fix back-ported to A/B. Decision: pending Abhay (design gate per GLOBAL.md §6). Not yet in PROJECT-LOG.

## Copy principle learned in owner testing (2026-08-27) — carry into the build spec
A hint that LISTS instruments ("MF + EPF + NPS + PPF + FDs") reads as **exclusive**: Abhay left his stocks out
because stocks were not named. Every "total" question MUST say **ALL** first, name the commonly-forgotten
buckets (stocks, ETFs, gold, crypto, bonds, RDs), and state the ONLY exclusion (the home you live in).
Applies to: total investments, monthly investing, spouse's investments.
