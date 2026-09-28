# Owner questions parked overnight — 2026-09-29 (read first thing)

Abhay went to sleep ~00:30 IST with the direction "implement whatever is clear and possible tonight, ask the rest in the morning". Everything below is a fork I did NOT decide. Status lines are updated as the night's work lands.

## Questions (one line each, recommended answer first)

1. **Apply the `ActivationEvent` migration + deploy PR #190 in tonight's or tomorrow's prod window?** Recommended: tomorrow 21:00–23:30 IST window, after you read the PR. Nothing is applied to any DB until you say so (one-deploy-a-day rule R6).
2. **#185 step 4 — change the kernel so salary growth feeds the headline?** Recommended: yes, after steps 2–3 land tonight and you read the ADR's cited wage-growth default. This moves every user's headline FIRE age; it is Tier A and needs your explicit go.
3. **Item c — rewrite `engineering-roles.md` + `claude-behavior.md` to rules+pointers?** Recommended: yes. A draft PR is prepared for you to read the diff; nothing merged.
4. **Public /quick share previews:** crawlers see the generic site OG tags, not the person's number (single-page-app limit). Recommended: accept for now; per-result previews need server rendering, file as good-to-have. Say no if the personalised preview is the whole point of sharing.

## Overnight queue (authorised) — status
- [ ] PR #190 public /quick + counters: review fixes → merge
- [ ] #176 endYear honesty bug: fix + FinTech review → PR
- [ ] #185 steps 2–3 (ADR + seeds + invariants, red on main) → PR
- [ ] Item c draft PR for morning read
