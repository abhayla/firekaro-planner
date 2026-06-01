
## 2026-06-01 — Self-verification is not independent verification
**Mistake:** Shipped the 80CCD(2) employer-NPS feature (commit 344bba1) after thorough SELF-verification (TDD, unit, type-check, live UI dual-signal, substance round-trip) but did NOT dispatch an independent verification role, and skipped /post-fix-pipeline (which fix-issue mandates).
**What it missed:** An independent code-reviewer-agent + fintech-domain-analyst pass immediately found a real HIGH bug (member-lens leaked household employer-NPS into one earner's tax: ₹591k→₹435k) + an uncapped-80CCD(2) over-claim gap. Author = sole verifier has a structural blind spot.
**Fix/Pattern:** After any non-trivial implementation, dispatch independent reviewers (code-reviewer-agent always; fintech-domain-analyst for tax/FIRE math; quality-gate-evaluator for larger changes) BEFORE declaring done. Self-run rules 24/25/26 are necessary, not sufficient. (Proposed as Rule 29, pending approval.)
