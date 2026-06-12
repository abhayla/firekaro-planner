# GOAL — Roll the Notifier pattern out to a consumer repo (fuel-prices first), retiring healthchecks.io

**Type:** Autonomous propagation contract (run via `/goal`). Execute end-to-end with **zero user input** for
everything reversible; the prod-secret + live-ping steps are explicitly **Abhay-gated** (below). Every design
decision is pre-made.

**Owner:** Abhay · **Created:** 2026-06-12 · **TARGET REPO:** `D:\Abhay\VibeCoding\RealFuelPricesinIndia` (fuel-prices) — NOT firekaro-planner.
**Invocation:** copy this file into `RealFuelPricesinIndia/docs/goals/`, then from THAT repo: `/goal docs/goals/2026-06-12-notifier-rollout-fuel-prices.md`
**Staged from:** `firekaro-planner/docs/goals/` (drafting only).
**REPEATABLE per consumer:** this is the template rollout. To onboard another consumer (IPODhan, algochanakya, KKB, …), copy this contract, swap the TARGET REPO + the Notifier project name, and re-run.
**DEPENDS ON (run these first):** `2026-06-12-notifier-hub-pattern.md` (hub — so `update-practices` can pull the rule) AND `2026-06-12-notifier-heartbeat-watchdog.md` (Notifier — so the heartbeat endpoint exists). If either is unshipped, the run still does the reversible code/docs work and DEFERS the pull / live-ping (see §0 dependency handling).

---

## 0. Mission

Make fuel-prices a uniform Notifier consumer: (1) pull the hub's `notifier-integration` rule + helper via
`update-practices`; (2) **delete every healthchecks.io / external-pinger recommendation** from its docs/skills/
agents and replace with the Notifier heartbeat pattern; (3) wire an owner-alert helper + a periodic **heartbeat
ping** from its data-pipeline/cron to Notifier's `/heartbeat`; (4) add the standard CLAUDE.md "Production &
monitoring" block; (5) document the Notifier-side project block to add + prod env vars; (6) verify a real test
ping is recorded by Notifier — **Abhay-gated** (needs the prod secret + Notifier reachable). "Done (autonomous
part)" = no stale healthchecks references remain, the heartbeat client + cron hook are wired, the CLAUDE.md
block is present, and the prod-secret + live-ping verification are cleanly handed off.

### Dependency handling (do NOT block the whole run)
- If the hub rule isn't published yet → SKIP the `update-practices` pull, do the healthchecks-removal + client wiring from this contract's own spec (it's self-contained), and DEFER the pull with a note.
- If Notifier's `/heartbeat` isn't shipped yet → wire the client + cron anyway (it's a no-op until the endpoint + project apiKey exist, same fail-open discipline) and DEFER the live-ping verification.

---

## 0.1 WORKTREE ISOLATION (first action, before §0.2)

> Dedicated worktree, never fuel-prices' primary checkout. `git worktree add ../RealFuelPricesinIndia-goal-notifier-rollout -b feat/notifier-rollout` (confirm the real default branch first). Claim the lock only if a `.githooks/pre-commit` `.goal-active.lock` check exists; else rely on the worktree. Release on exit. **Self-cleanup ON SUCCESS ONLY** (merge `--no-ff` → default + push + lock release → `cd <primary-root> && git worktree remove --force … ; git branch -D feat/notifier-rollout ; git worktree prune`; Windows `Invalid argument` benign). DEFER/HALT keeps the worktree.

---

## 0.2 PREFLIGHT — idempotency · NO duplication (first numbered action)

> 1. No formal ledger — code + docs + git log is truth.
> 2. Before each item: `grep -rinE 'healthcheck|uptimerobot|cron.?ping|dead.?man' . --include=*.md --include=*.ts --include=*.js --include=*.py --include=*.yaml --include=*.yml` (the live stale-reference set — known files: `.claude/agents/data-pipeline-agent.md`, `.claude/agents/deploy-agent.md`, `.claude/skills/hostinger-vps-setup/SKILL.md`, `.claude/skills/nextjs-static-export/SKILL.md`, `CLAUDE.md`, `docs/02-PRD-v1.1.md`, `docs/03-decisions-log.md`); `grep -rn 'NOTIFIER_URL\|notifyOwner\|/heartbeat' .` (existing wiring); `git log --oneline -20 | grep -i notifier`. Items already done → SKIP, verify-only. **Do NOT rewrite `.remember/` history files** — those are dated session logs, left as-is (historical record); only normative docs/skills/agents/CLAUDE.md/PRD get updated.
> 3. Record skips in the final report.

---

## 0.3 PROGRESS LOG — live, cross-session-trackable

> Append-only `docs/goals/.run/notifier-rollout-fuel-prices-PROGRESS.md` in THIS worktree (`.run/` gitignored — confirm/add). First line: slug · branch · worktree · start time · contract · mission. ≤2-line entries at stage boundaries + DEFECT/EVENT/DECISION/RECOVERY/BLOCKER + final. Run-end: AUTO error→fix→lessons (+gate-gap, dedup-grep) to `.claude/tasks/lessons.md`; PROPOSE skill/rule learnings in the final report. SUMMARY (DONE/PENDING/BLOCKED/NEXT) in final entry + report.

---

## 1. Context you need (read first — DISCOVER the runtime)

| Thing | Path | Why it matters |
|---|---|---|
| Stale references | the 7 normative files in §0.2 | the healthchecks.io prose to remove + replace. |
| Data pipeline | `.claude/agents/data-pipeline-agent.md` + the actual pipeline code/cron (DISCOVER — grep for the scheduled fetch/scrape job) | the thing that must stay alive → the heartbeat sender. **Discover its language/runtime** (Node/TS vs Python vs shell cron) to pick the right helper template. |
| Deploy | `deploy/terraform/` + `.claude/skills/hostinger-vps-setup/SKILL.md` | where prod env vars live; how the VPS/cron is provisioned (Next.js static export + a data pipeline). |
| Hub helper | the hub's `core/.claude/templates/owner-notify.ts` / `owner_notify.py` (pulled via `update-practices`, or copied from the spec if the hub pull is deferred) | the client to adapt. |
| FireKaro reference | `D:\Abhay\VibeCoding\firekaro-planner\server\src\lib\owner-notify.ts` (read-only) | the proven contract if the hub pull is deferred. |
| Notifier contract | Notifier `config.example.yaml` (the `projects:` + `heartbeats:` block shape) | the project block to document for the Notifier side. |

**Gotchas:** (1) fuel-prices is a **Next.js static export** — there may be no long-running server; the heartbeat sender is the **data-pipeline cron** (the component that can silently die), not the static site. Wire the heartbeat where the cron runs. (2) Match the helper language to the pipeline's runtime (Python pipeline → `owner_notify.py`; Node → `owner-notify.ts`). (3) `NOTIFIER_URL`/`NOTIFIER_KEY` unset = the helper no-ops (fail-open) — so wiring it is safe even before the prod secret lands. (4) Adding fuel-prices to Notifier's `config.yaml` (`projects.realfuelprices` with an `apiKey` + `heartbeats:`) is a **Notifier-repo + secret change** — this contract DOCUMENTS it; applying the secret + deploying Notifier is Abhay-gated.

---

## 2. STAGE A — pull the hub pattern

**Action:** run `update-practices` (or the hub's pull mechanism) to fetch `rules/notifier-integration.md` + the `owner-notify` templates + the CLAUDE.md "Production & monitoring" block into fuel-prices' `.claude/`. If the hub rule isn't published (dependency unmet) → SKIP + DEFER, and proceed using this contract's self-contained spec.

### Acceptance: `notifier-integration.md` present in fuel-prices `.claude/rules/` (or DEFERRED-with-reason).

---

## 3. STAGE B — remove healthchecks.io, replace with Notifier (docs/skills/agents)

**Files:** the 7 normative files in §0.2 (edit). **Keep untouched:** `.remember/*` history.

### Pre-made design decisions (do NOT deviate)
1. In each file, replace healthchecks.io / UptimeRobot / external-pinger guidance with the Notifier directive: "Owner alerts + uptime heartbeats go to the **Notifier** gateway (`NOTIFIER_URL`/`NOTIFIER_KEY`); the data pipeline sends a periodic heartbeat to Notifier's `/heartbeat`; if it lapses, Notifier's watchdog alerts the owner. Do NOT use healthchecks.io / external pingers." Cross-reference `.claude/rules/notifier-integration.md`.
2. `docs/02-PRD-v1.1.md` + `docs/03-decisions-log.md`: don't rewrite history — append a dated decision note ("2026-06-12: monitoring standardized on Notifier; healthchecks.io retired — see notifier-integration rule") rather than silently editing the original requirement text.
3. After edits, the §0.2 grep for healthchecks/uptimerobot/external-pinger over normative files returns **clean** (only `.remember/` historical hits may remain — acceptable).

### Acceptance: grep clean over normative files; each replacement points at the Notifier pattern.

---

## 4. STAGE C — wire the heartbeat (+ owner-alert) client into the data pipeline

**Files:** add the helper (`owner_notify.py` or `owner-notify.ts`, matching the pipeline runtime) into the pipeline's source; hook a `heartbeat("data-pipeline")` call at the END of each successful pipeline run (the cron). Optionally wire `notify_owner("P1", "fuel-prices pipeline failed", …)` on a caught pipeline failure. **Keep untouched:** the pipeline's data logic.

### Pre-made design decisions (do NOT deviate)
1. Adapt the hub helper (or FireKaro's reference): env-gated no-op on missing `NOTIFIER_URL`/`NOTIFIER_KEY`, short timeout, swallow-and-log, never raise — so it's safe in prod even before the secret lands and can NEVER break the pipeline.
2. `project: "realfuelprices"` (match the Notifier-side block name documented in STAGE D). Heartbeat `name: "data-pipeline"`.
3. Place the heartbeat call where a successful run completes (so a dead/failing cron stops pinging → Notifier watchdog catches it). A failure-path `notify_owner` is a bonus, not required.

### Acceptance: helper added; heartbeat call wired at run-success; pipeline build/lint/test still green; helper no-ops cleanly with env unset (unit-test or manual-confirm the no-op).

---

## 5. STAGE D — CLAUDE.md block + document the Notifier-side wiring (hand-off)

**Files:** fuel-prices `CLAUDE.md` (add the "Production & monitoring" block); `docs/` (a short "Notifier wiring" note). **Keep untouched:** unrelated CLAUDE.md sections.

### Pre-made design decisions (do NOT deviate)
1. Paste the hub's "Production & monitoring" block, filled for fuel-prices (deployed URL/host; owner-alerts wired: yes; heartbeat every N min: yes; live registry: `projects.realfuelprices` in Notifier).
2. Document, for the **Abhay-gated** hand-off (these are NOT done by this run — they're a prod-secret + Notifier-repo + deploy change):
   - Add to Notifier's `config.yaml`: `projects.realfuelprices: { apiKey: "${NOTIFIER_KEY_REALFUELPRICES}", telegram/email/whatsapp targets, heartbeats: [{name: "data-pipeline", everyMinutes: <pipeline cadence>, graceMinutes: 10, severity: P1}] }`.
   - Set the prod env on fuel-prices' VPS/cron: `NOTIFIER_URL=http://127.0.0.1:3300` (same box) + `NOTIFIER_KEY=<the new apiKey>`; add the secret to Notifier's `.env` as `NOTIFIER_KEY_REALFUELPRICES`.
   - Redeploy Notifier (PM2 restart) so the new project + heartbeats load.

### Acceptance: CLAUDE.md block present + accurate; the hand-off steps documented precisely enough for Abhay to execute without re-deriving.

---

## 6. STAGE E — verify a test ping (Abhay-gated; auto-DEFER if prod wiring absent)

1. **If** Notifier is reachable from the run's env AND a `realfuelprices` apiKey is configured (i.e. Abhay already did STAGE D's hand-off): POST a test heartbeat — `curl -sS -X POST "$NOTIFIER_URL/heartbeat" -H "X-Api-Key: $NOTIFIER_KEY" -H 'Content-Type: application/json' -d '{"project":"realfuelprices","name":"data-pipeline"}'` — and confirm it's recorded via `GET /admin/heartbeats` (admin key) OR by reading Notifier's `state/heartbeats.json`. This is a **safe** ping (records liveness; triggers NO owner-alert send).
2. **Else** (the common case on this autonomous run — the prod secret/Notifier wiring is Abhay-gated): **DEFER** with the note "live test-ping pending Abhay's STAGE-D hand-off (Notifier project block + prod secret + redeploy)". Do NOT fabricate a successful ping.

### Acceptance: either a recorded test ping confirmed, or a clean DEFER with the precise unblock step.

---

## 7. Verification gates (adapted — docs + a small client wiring)

| Rule / check | Applies? | Action |
|---|---|---|
| **Static** | YES | fuel-prices' own gate — `npm run build`/`lint`/`test` (Next.js) + the pipeline's test if any. Green before commit. |
| **Rule 29** (independent review) | YES | `code-reviewer-agent` (fresh context) on the client-wiring + docs diff: helper is fail-open/no-throw, heartbeat at run-success, no stale healthchecks refs left, CLAUDE.md block accurate, hand-off steps correct. NO `fintech-domain-analyst`. |
| **Rule 26** (consistency) | YES | grep proves no stale healthchecks/pinger refs in normative files; CLAUDE.md block ↔ documented Notifier project block agree on name/cadence/env vars. |
| **Rule 24 / 25 / 32** | **n/a** | `skipped: no app-UI/write-path/interactive change` (monitoring wiring + docs only — the static site UI is untouched). |
| **Rule 31** (plausibility) | **n/a** | `skipped: no user-facing value`. |
| **API behavioral test** | partial | the STAGE-E test ping IS the behavioral check for the `/heartbeat` contract — run it if unblocked, else DEFER. |
| **Rule 33** (blind re-verify) | YES if a verdict produced | blind-re-check the grep-clean + test-ping verdict against raw evidence. |
| **Rule 15 / 17 / 20 / 23** | YES | failures → skills; root-cause; no fabricated ping; finish the reversible DoD, hand off the gated part. |

---

## 8. Commit + push

- Conventional commits (scope `monitoring` or `notifier`):
  1. `chore(monitoring): pull notifier-integration pattern from hub` (if STAGE A ran)
  2. `docs(monitoring): retire healthchecks.io, standardize on Notifier`
  3. `feat(pipeline): send heartbeat + owner-alerts to Notifier`
  4. `docs: add Production & monitoring block + Notifier wiring hand-off`
- Stage only changed files (NEVER `git add -A`; no secrets). Co-author trailer per repo convention.
- On success (reversible part complete + gated part cleanly deferred): merge `--no-ff` → default branch, push, self-clean (§0.1.4).

---

## 9. Definition of Done

**Build/change:**
- [ ] hub pattern pulled (or DEFERRED-with-reason if hub unshipped).
- [ ] zero stale healthchecks.io / UptimeRobot / external-pinger refs in normative files (grep clean; `.remember/` history exempt).
- [ ] heartbeat (+ optional failure-alert) client wired into the data pipeline, runtime-matched, fail-open/no-throw, no-op-with-env-unset confirmed.
- [ ] CLAUDE.md "Production & monitoring" block present + accurate; Notifier-side project block + prod env vars + redeploy documented for the Abhay hand-off.
**Static:** fuel-prices build/lint/test green.
**Rule 29:** `code-reviewer-agent` ran; blockers/HIGH cleared.
**Rule 26:** grep-clean + CLAUDE.md ↔ documented Notifier block coherent.
**Rule 33:** any verdict blind-re-checked; concur.
**STAGE E:** test ping recorded by Notifier, OR cleanly DEFERRED with the precise unblock step (no fabricated success).
**Other gates:** skipped-with-reason per §7.
**Ship:**
- [ ] commits pushed to default branch; on success merged `--no-ff` + pushed + worktree/branch self-cleaned (§0.1.4).
- [ ] `docs/goals/.run/notifier-rollout-fuel-prices-DEFERRED.md` logs the Abhay-gated STAGE-D/E items.
- [ ] PROGRESS.md maintained; SUMMARY (DONE/PENDING/BLOCKED/NEXT) in final entry + report; a notable lesson appended to `.claude/tasks/lessons.md`.

---

## 10. Final report (required)

Open with **SUMMARY — DONE / PENDING / BLOCKED / NEXT** (the BLOCKED line names the Abhay-gated STAGE-D
hand-off + STAGE-E live ping). Then: commit SHAs + gate results; grep-clean proof; Rule-29 verdict; the
test-ping result or DEFER; preflight skips; DoD tally. Plus **LEARNINGS TO FOLD BACK** (proposals; route per
`baked-in-rules.md` §0.3 step 5; one-line `lessons.md` auto-write only). Note the **repeatable** nature: the
same contract onboards the next consumer with TARGET REPO + project name swapped.

---

## 11. Guardrails (hard stops)

- **`RealFuelPricesinIndia` repo only.** Never write into the hub, Notifier, firekaro-planner, or `5Wealths\`. (Adding the `realfuelprices` block to Notifier's `config.yaml` is DOCUMENTED here for Abhay, NOT done by this run — that's a Notifier-repo + secret change.)
- **No new dependencies** beyond what the heartbeat client needs (a stdlib/already-present HTTP client — no new package if one exists).
- **Prod env + secret + Notifier redeploy = Abhay-gated** (prod change, `decision-authority.md`) — document + DEFER, never apply a prod secret or restart prod from this run.
- **No fabrication (rule 20):** never claim a test ping succeeded that didn't; DEFER honestly.
- **Don't rewrite `.remember/` history;** append decision notes to PRD/decisions-log rather than editing original requirement text.
- **Stop only on a true blocker;** context-budget is not one.
- **Strategic/portfolio items → `TODO(5W):` notes.**

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | First consumer | fuel-prices (has the live stale healthchecks.io prompt) |
| 2 | Pull mechanism | `update-practices` from the hub; self-contained fallback if hub unshipped |
| 3 | healthchecks refs | removed from normative files; `.remember/` history left intact; PRD/decisions get an append note |
| 4 | Heartbeat sender | the data-pipeline cron (the component that can silently die), runtime-matched helper |
| 5 | Notifier-side block + prod secret + redeploy | DOCUMENTED for Abhay (gated), NOT applied by the run |
| 6 | Live test-ping | run if unblocked; else honest DEFER with the unblock step |
| 7 | Repeatability | this contract is the per-consumer template (swap repo + project name) |

---

## References

- The two sibling contracts (dependencies): `2026-06-12-notifier-hub-pattern.md`, `2026-06-12-notifier-heartbeat-watchdog.md`
- Hub: `core/.claude/rules/notifier-integration.md` + `core/.claude/templates/owner-notify.*` (pulled via `update-practices`)
- Notifier: `config.example.yaml` (project + heartbeats block shape)
- `.claude/rules/claude-behavior.md` (rules 15/17/20/23/26/29/33), `decision-authority.md` (prod gating) — if synced; mandates stated inline
- Skills this contract drives: `update-practices`, `/fix-loop`, `code-reviewer-agent`
