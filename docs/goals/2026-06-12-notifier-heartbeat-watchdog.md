# GOAL — Add a missed-heartbeat watchdog to Notifier (replaces healthchecks.io / external uptime pingers)

**Type:** Autonomous build contract (run via `/goal`). Execute end-to-end with **zero user input**. Every
design decision is pre-made below — do not pause to ask; make the call the contract specifies and keep going
until the Definition of Done is fully met.

**Owner:** Abhay · **Created:** 2026-06-12 · **TARGET REPO:** `D:\Abhay\VibeCoding\Notifier` — NOT firekaro-planner.
**Invocation:** copy this file into `Notifier/docs/goals/` (create the dir), then from THAT repo: `/goal docs/goals/2026-06-12-notifier-heartbeat-watchdog.md`
**Staged from:** `firekaro-planner/docs/goals/` (drafting only — the build runs in Notifier).
**Sibling contracts:** `2026-06-12-notifier-hub-pattern.md` (hub — independent, can run in parallel) · `2026-06-12-notifier-rollout-fuel-prices.md` (consumers — DEPENDS on this contract's `/heartbeat` endpoint shipping first).

---

## 0. Mission

Give Notifier a **dead-man's-switch watchdog** so it can replace healthchecks.io / UptimeRobot for every
project: a project POSTs a periodic **heartbeat**; if an expected heartbeat does not arrive within its
configured interval + grace, Notifier fires an owner alert through its EXISTING notify pipeline (so it routes
/dedupes/digests like any other event). Heartbeat liveness is also exposed so Notifier's admin config + state
is the **authoritative live registry of which projects are linked and alive**. "Done" = a `POST /heartbeat`
endpoint + a per-project `heartbeats:` config block + a once-a-minute watchdog tick + heartbeat liveness
visible via the admin surface, all TDD-built (red-first), vitest green, API-behaviorally tested, and the
watchdog miss/recovery logic proven with a **fake clock + mock adapter (NO real sends in the autonomous
run)**. The reuse mandate: route alerts through the **existing** `notify`/`router`/`dedupe`/adapter pipeline —
do NOT build a parallel send path.

---

## 0.1 WORKTREE ISOLATION (first action, before §0.2)

> **First action, before any stage. Non-negotiable.** Dedicated worktree, never Notifier's primary checkout.
> 1. `root=$(git rev-parse --show-toplevel)`; if primary, `git worktree add ../Notifier-goal-heartbeat-watchdog -b feat/heartbeat-watchdog` and run every stage from there. Confirm Notifier's actual default branch (`git branch --show-current` on primary) — do not assume `main`.
> 2. Claim the lock only if Notifier has a `.githooks/pre-commit` `.goal-active.lock` check (`ls .githooks/`); else note its absence and rely on the worktree for isolation. Do NOT fabricate a hook.
> 3. Release the lock (if written) on exit.
> 4. **Self-cleanup ON SUCCESS ONLY:** after merge `--no-ff` → default branch + push + lock release, `cd <primary-root> && git worktree remove --force ../Notifier-goal-heartbeat-watchdog ; git branch -D feat/heartbeat-watchdog ; git worktree prune` (Windows `Invalid argument` is benign; `prune` finalises). DEFER/HALT: keep worktree + branch.

---

## 0.2 PREFLIGHT — idempotency · NO duplication (first numbered action)

> **First action, before any stage. Non-negotiable.**
> 1. No formal gap ledger — the code + git log is the source of truth.
> 2. Before building, confirm the feature isn't already present: `ls src/heartbeat*.ts src/heartbeat*.spec.ts state/heartbeats.json 2>/dev/null`; `grep -rn 'heartbeat\|/heartbeat\|watchdog' src/ config.example.yaml`; `git log --oneline -20 | grep -i heartbeat`. If present + matching → SKIP, verify-only. If partial → build the delta. If absent → build.
> 3. Record skips in the final report.

---

## 0.3 PROGRESS LOG — live, cross-session-trackable

> Append-only `docs/goals/.run/notifier-heartbeat-watchdog-PROGRESS.md` in THIS worktree (`.run/` gitignored — confirm/add). First line: slug · branch · worktree · start time (`date "+%Y-%m-%d %H:%M"`) · contract · mission. ≤2-line entry at each stage start/done (+gate result), every DEFECT/EVENT/DECISION/RECOVERY/BLOCKER, final result. Run-end: AUTO-append notable error→fix→lessons (+gate-gap line, dedup-grep first) to `.claude/tasks/lessons.md`; PROPOSE skill/rule learnings in the final report. Final entry + report carry **SUMMARY: DONE/PENDING/BLOCKED/NEXT**.

---

## 1. Context you need (read first)

| Thing | Path | Why it matters |
|---|---|---|
| Boot + tick model | `src/index.ts` | the `setInterval(runDigestTick, 60_000)` is the EXACT model for the watchdog tick — add the heartbeat check on the same minute cadence (or a sibling interval). Note `process.loadEnvFile(".env")` + `loadConfig`. |
| App wiring | `src/server.ts` (`createApp(config, deps)`) | where routes mount + `PipelineDeps` is injected; add the `/heartbeat` route + a `HeartbeatStore` dep here. Study `src/server.spec.ts` for the test harness (mock adapters, how `/notify` is tested). |
| Notify pipeline | `src/notify.ts` (+ `notify.spec.ts`), `src/router.ts` | the watchdog MUST dispatch misses through THIS pipeline (build a `NotifyEvent` and run it), so routing/dedupe/digest/adapters all apply. Do NOT call adapters directly. |
| Event contract | `src/types.ts` (`NotifyEvent`, `Severity`, `DispatchOutcome`) | the miss alert is a `NotifyEvent` (`{project, severity, title, body?, dedupeKey?, type:"heartbeat-miss"}`). |
| Config shape | `src/config.ts` (+ `config.spec.ts`), `config.example.yaml`, `config.yaml` (gitignored) | add the per-project `heartbeats:` block + parse/validate it in `loadConfig` (fail-fast on bad config, like the rest). |
| State persistence | `src/dedupe.ts` (`DedupeStore` → `state/dedupe.json`), `src/settings.ts` (`SettingsStore` → `state/settings.json`) | the EXACT pattern to mirror for `HeartbeatStore` → `state/heartbeats.json` (load on construct, write on mutate, JSON file). |
| Admin surface | `src/settings.ts`, `public/`, the `/admin` API + `GET /` in `server.ts` | where to expose heartbeat liveness (the "alive" half of the live registry). |
| Dedupe/cooldown | `src/dedupe.ts`, `defaults.cooldownMinutes` | reuse for miss-alert suppression so a down project doesn't re-page every minute. |

**Gotchas:** (1) tsx/node need `process.loadEnvFile` — already handled in `index.ts`; the watchdog tick lives in `index.ts` next to the digest tick. (2) `state/*.json` files are the persistence layer — `HeartbeatStore` mirrors `DedupeStore`/`SettingsStore` exactly (no DB). (3) Tests use **mock `ChannelAdapter`s** (see `notify.spec.ts`/`server.spec.ts`) — the watchdog tests assert a `NotifyEvent` was dispatched, they do **NOT** send real messages. (4) `config.yaml` is gitignored — update **`config.example.yaml`** (committed) with the new `heartbeats:` block + add it to the local `config.yaml` for local runs. (5) Time: the watchdog needs a **clock seam** — inject `now()` (default `Date.now`) so the fake-clock unit test can advance time. Do NOT use a literal `Date.now()` inside the check logic.

---

## 2. STAGE A — config: per-project `heartbeats:` block (TDD red-first)

**Files:** `src/config.ts` + `src/config.spec.ts` (edit). **Keep untouched:** unrelated config keys.

### Pre-made design decisions (do NOT deviate)
1. Per-project optional `heartbeats:` = a list of expected heartbeats, each: `name` (string, e.g. `"data-pipeline"`), `everyMinutes` (number, expected cadence), `graceMinutes` (number, default 5), `severity` (`P0|P1|P2|info`, default `P1`). Absent block = project has no watchdog (back-compat: existing `firekaro` block keeps working untouched).
2. Validate in `loadConfig` with the same fail-fast style as the rest (a bad `everyMinutes` throws at boot). Add to `config.example.yaml` under `firekaro:` as a commented example:
   ```yaml
   #   heartbeats:
   #     - { name: "api", everyMinutes: 15, graceMinutes: 5, severity: P1 }
   ```
3. Red-first: write `config.spec.ts` cases (valid block parses; missing block = no heartbeats; invalid `everyMinutes` throws) BEFORE editing `config.ts`.

### Stage A acceptance: red→green on the new config specs; existing config specs still pass.

---

## 3. STAGE B — `HeartbeatStore` + `POST /heartbeat` (TDD red-first)

**Files:** `src/heartbeat.ts` + `src/heartbeat.spec.ts` (create); `src/server.ts` (+ `server.spec.ts`) to mount the route + inject the store. **Keep untouched:** the notify/digest pipeline internals.

### Pre-made design decisions (do NOT deviate)
1. **`HeartbeatStore`** mirrors `DedupeStore`: constructor `(path = "state/heartbeats.json")`, loads on construct, persists on mutate. State shape: `{ "<project>:<name>": { lastSeen: ISOString, missed: boolean, missedAlertedAt?: ISOString } }`. Methods: `record(project, name)` (set `lastSeen=now`, clear `missed`, return whether this is a RECOVERY i.e. was `missed`); `due(config, now)` → list of `{project, name, severity}` that are overdue and not yet alerted; `markMissed(project,name,now)`; `markRecovered(project,name)`.
2. **`POST /heartbeat`** mounted in `createApp`, **same `X-Api-Key` auth as `/notify`** (per-project `apiKey`; reject unknown project/wrong key with the same error envelope `/notify` uses). Body: `{ project, name? }` (`name` defaults to `"default"`). On valid ping: `store.record(project, name)`; if it was a recovery AND the project's config wants recovery notices, dispatch an `info` "recovered" event through the notify pipeline (dedupeKey `${project}:heartbeat-recover:${name}`). Respond with Notifier's standard success envelope (match `/notify`'s response shape exactly).
3. **Unknown heartbeat name** (pinged but not in config) → record it anyway (so an un-configured ping is still visible in liveness) but it can't be "missed" (only configured heartbeats are watched). Mirrors `/notify`'s "unknown type auto-registers" behavior.
4. Red-first: `heartbeat.spec.ts` (record/recovery/due-calculation with injected clock) + `server.spec.ts` route cases (200 + envelope on valid; 401/403 on bad key; unknown-project rejected) BEFORE implementing.

### Stage B acceptance: red→green; `/heartbeat` auth-gated exactly like `/notify`; store round-trips to `state/heartbeats.json`.

---

## 4. STAGE C — the watchdog tick + miss/recovery alerting (TDD red-first)

**Files:** `src/heartbeat-watchdog.ts` + `src/heartbeat-watchdog.spec.ts` (create); wire the tick into `src/index.ts`. **Keep untouched:** `runDigestTick` (sibling, not replaced).

### Pre-made design decisions (do NOT deviate)
1. **`runHeartbeatTick(config, deps, now)`** (clock injected): for each project's configured heartbeat, compute overdue = `now - lastSeen > (everyMinutes + graceMinutes) * 60_000`. Baseline rule for **never-pinged**: a configured heartbeat with no `lastSeen` is considered overdue only once `now - <storeCreatedAt/serverBoot> > (everyMinutes+graceMinutes)` — pass a `bootAt` so a project that died before its first ping is still caught, but a just-booted Notifier doesn't false-alarm. (Record `bootAt` in `index.ts` at startup and pass it in.)
2. **On overdue + not already missed-alerted:** build a `NotifyEvent` `{project, severity: <config>, title: "⚠️ <project> heartbeat '<name>' missed", body: "No heartbeat for >Xm (expected every Ym, grace Zm). Last seen: <ts|never>.", type: "heartbeat-miss", dedupeKey: "<project>:heartbeat-miss:<name>"}` and **dispatch it through the existing notify pipeline** (`deps`/`dispatch` — the same function `/notify` calls). Then `store.markMissed`. The dedupeKey + `defaults.cooldownMinutes` prevent re-paging every minute.
3. **On recovery** (handled in STAGE B's `/heartbeat` record path): clear `missed`; optional `info` "recovered" event. Watchdog tick only fires misses.
4. **Wire into `index.ts`:** add `setInterval(() => void runHeartbeatTick(config, deps, Date.now()).catch(err => console.error("[notifier] heartbeat tick error:", err)), 60_000)` next to the digest tick. Inject `bootAt = Date.now()` captured at boot.
5. Red-first: `heartbeat-watchdog.spec.ts` with a **fake clock + a mock `ChannelAdapter`/dispatch spy**: (a) a heartbeat seen then time advanced past interval+grace → exactly ONE miss `NotifyEvent` dispatched with the right severity/dedupeKey; (b) within cooldown a second tick dispatches NOTHING (dedupe); (c) a ping arriving after a miss → recovery path clears `missed`; (d) never-pinged + boot older than grace → miss; just-booted → no miss. **NO real adapter — assert on the dispatch spy.**

### Stage C acceptance: red→green; the four watchdog scenarios pass with the fake clock; no real send occurs in any test.

---

## 5. STAGE D — expose heartbeat liveness on the admin surface (the "alive" registry view)

**Files:** the `/admin` API in `src/server.ts` (+ `server.spec.ts`); `public/` admin UI if it renders status. **Keep untouched:** existing admin toggles.

### Pre-made design decisions (do NOT deviate)
1. Add `GET /admin/heartbeats` (admin-key auth, like the other `/admin` routes) returning, per project, each configured + observed heartbeat with `{name, lastSeen, alive: boolean, everyMinutes, graceMinutes}` (`alive` = not overdue). This is the **authoritative live "who's linked and alive" registry** the initiative promised — queryable, not hand-maintained.
2. If `public/` has an admin status page, add a small read-only "Heartbeats" panel listing project → heartbeat → last-seen → ALIVE/MISSED. If the admin UI is purely API-driven (no server-rendered status to extend), the `GET /admin/heartbeats` API satisfies this stage — note that and skip the UI panel.

### Stage D acceptance: `GET /admin/heartbeats` returns correct liveness (admin-gated); if a UI panel was added, it renders the data (Rule 24/32 — STAGE gate).

---

## 6. Verification gates (adapted to a Hono/TS service)

> **All rules in Notifier's `.claude/rules/claude-behavior.md` are operative** (if synced; the MANDATES below
> are stated inline so the contract is self-contained). Gate by blast radius:

| Rule / check | Applies? | Action |
|---|---|---|
| **Static** | YES | `npm run type-check` (`tsc --noEmit`) + `npm run lint` if present + `npm test`/`vitest run` — all green before each stage commit. |
| **TDD red-first (rule 17)** | YES | every stage writes the failing spec BEFORE the impl; the failing test is the proof the behavior is real. |
| **API behavioral test** | YES | for `POST /heartbeat` + `GET /admin/heartbeats`: assert status code, success/error **envelope shape (match `/notify`'s exactly)**, **auth-gate** (missing/wrong `X-Api-Key` → same rejection as `/notify`; admin key for `/admin/*`), unknown-project rejection. Reuse `server.spec.ts`'s harness. |
| **Watchdog logic** | YES | the fake-clock + mock-adapter unit tests (STAGE C) — the load-bearing proof; assert on the dispatch spy, never a real send. |
| **Rule 29** (independent review) | YES | dispatch `code-reviewer-agent` (fresh context) on the full diff: check the watchdog reuses the notify pipeline (no parallel send path), the clock seam exists (no literal `Date.now()` in logic), dedupe prevents re-paging, auth matches `/notify`, config validation fails fast, `state/heartbeats.json` mirrors the store pattern. NO `fintech-domain-analyst` (no math). Act on blockers/HIGH before commit. |
| **Rule 26** (consistency) | YES | heartbeat state (`/admin/heartbeats`) is coherent with what was recorded; config block ↔ watchdog ↔ admin all agree on the heartbeat names/intervals. |
| **Rule 24 / 32** (UI) | **only if STAGE D added a `public/` panel** | drive Playwright against the admin UI at `http://127.0.0.1:3300/` (admin key) → screenshot + ARIA + console; exercise it loads/refreshes liveness. Else `skipped: no UI change (API-only admin)`. |
| **Rule 31** (plausibility) | **n/a** | `skipped: no user-facing financial value`. |
| **Rule 33** (blind re-verify) | YES | a separate context-blind agent re-checks the test verdicts (watchdog + API + any UI) against raw evidence — coverage + correctness; reconcile dissents. |
| **Rule 15 / 20 / 23** | YES | failures → `/fix-loop`/`/systematic-debugging`; no fabricated test passes; finish the full DoD. |

### ⚠️ Live-delivery confirmation is ABHAY-GATED, NOT auto-run (spend + outward-facing)
A real missed-heartbeat producing a real WhatsApp/Telegram message is a **spend + outward-facing send → an
escalation gate** (`decision-authority.md`), and the fail-closed allowlist limits real WhatsApp to
`<owner-test-number — see GLOBAL.md>`. The autonomous run **MUST NOT trigger real sends** — it proves the watchdog with mock
adapters. The channels themselves were already proven live yesterday for `/notify` (the heartbeat reuses the
SAME pipeline, so the only new risk surface is the tick/store logic, fully covered by mocks). Add a final
**MANUAL VERIFICATION (Abhay-run)** note to the final report: "to confirm end-to-end live delivery, register a
1-min heartbeat for a throwaway project, stop pinging, and confirm one real alert arrives to <owner-test-number — see GLOBAL.md> —
Abhay's call, not auto-run."

---

## 7. Commit + push

- Conventional commits (scope `heartbeat` or `notifier`), one logical change each:
  1. `feat(config): per-project heartbeats block + validation`
  2. `feat(heartbeat): HeartbeatStore + POST /heartbeat endpoint`
  3. `feat(heartbeat): missed-heartbeat watchdog tick + miss/recovery alerting`
  4. `feat(admin): expose heartbeat liveness via GET /admin/heartbeats`
- Stage only the files each commit changed (NEVER `git add -A` — `state/*.json` runtime files + `config.yaml` stay UNstaged; only `config.example.yaml` is committed). Co-author trailer per repo convention.
- On success: merge `--no-ff` → default branch, push, self-clean (§0.1.4).

---

## 8. Definition of Done (all MUST be true)

**Build:**
- [ ] `heartbeats:` config block parses + validates fail-fast; `config.example.yaml` documents it; existing `firekaro` config untouched + still valid.
- [ ] `POST /heartbeat` records to `state/heartbeats.json`, auth-gated exactly like `/notify`, returns the standard envelope; recovery path works.
- [ ] `runHeartbeatTick` dispatches a single dedup-suppressed miss alert through the EXISTING notify pipeline when a configured heartbeat lapses (interval+grace), with an injected clock; never-pinged + boot>grace is caught; just-booted is not.
- [ ] `GET /admin/heartbeats` returns per-project liveness (admin-gated); UI panel added OR API-only noted.
- [ ] watchdog tick wired into `index.ts` next to the digest tick (60s).

**Static / TDD:** type-check 0 errors · lint clean · `vitest run` all green · every stage was red-first.
**API behavioral test:** `/heartbeat` + `/admin/heartbeats` status + envelope + auth-gate + unknown-project asserted.
**Watchdog logic:** the 4 fake-clock + mock-adapter scenarios pass; **zero real sends** in the suite.
**Rule 29:** `code-reviewer-agent` ran on the diff (pipeline-reuse, clock-seam, dedupe, auth-parity confirmed); blockers/HIGH cleared.
**Rule 26:** heartbeat state ↔ admin liveness ↔ config coherent.
**Rule 24/32:** admin UI panel verified via Playwright at `127.0.0.1:3300` (or `skipped: API-only admin`).
**Rule 31:** `skipped: no user-facing financial value`.
**Rule 33:** every test verdict blind-re-checked; concur.

**Ship:**
- [ ] up to 4 conventional commits pushed to the default branch.
- [ ] On success: merged `--no-ff`, pushed, worktree+branch self-cleaned (§0.1.4). (DEFER/HALT keeps the worktree.)
- [ ] Deferrals logged in `docs/goals/.run/notifier-heartbeat-watchdog-DEFERRED.md` with reason.
- [ ] `docs/goals/.run/notifier-heartbeat-watchdog-PROGRESS.md` maintained; SUMMARY (DONE/PENDING/BLOCKED/NEXT) in final entry + report; a notable lesson appended to `.claude/tasks/lessons.md`.
- [ ] Final report carries the **Abhay-gated live-delivery MANUAL VERIFICATION** note (not auto-run).

---

## 9. Final report (required on completion)

Open with **SUMMARY — DONE / PENDING / BLOCKED / NEXT**. Then: commit SHAs + per-stage gate results; the
API-behavioral results; the watchdog scenario results; Rule-29 verdict; the `/admin/heartbeats` coherence
check; the preflight "skipped (already covered)" list; DoD tally; DEFERRED entries; the Abhay-gated
live-delivery note. Plus **LEARNINGS TO FOLD BACK** (proposals only; route per `baked-in-rules.md` §0.3 step
5; one-line `lessons.md` entry is the only auto-write).

---

## 10. Guardrails (hard stops)

- **`Notifier` repo only.** Never write into firekaro-planner, the hub, a consumer repo, or `D:\Abhay\VibeCoding\5Wealths\`.
- **No new dependencies** (use the existing Hono/TS/vitest stack + `state/*.json` persistence — NO database).
- **Reuse, don't reinvent:** the watchdog dispatches through the EXISTING notify/router/dedupe/adapter pipeline — never a parallel send path.
- **No real sends in the autonomous run** — mock adapters only; live-delivery is Abhay-gated (spend + outward, `decision-authority.md`). The fail-closed WhatsApp allowlist (`<owner-test-number — see GLOBAL.md>`) is NEVER widened by this run.
- **No fabrication (rule 20):** no clock-magic literals in logic (inject the clock); don't invent a `.githooks` lock or a config key that isn't there.
- **Stop only on a true blocker;** context-budget is not a blocker — hand off via a one-line note.
- **Strategic/portfolio items are `TODO(5W):` notes.**

---

## Authorization trail

| # | Decision | Choice |
|---|---|---|
| 1 | Watchdog scope | full missed-heartbeat dead-man's-switch → replaces healthchecks.io |
| 2 | Endpoint | `POST /heartbeat`, same `X-Api-Key` auth as `/notify`; `{project, name?}` |
| 3 | Config | per-project `heartbeats: [{name, everyMinutes, graceMinutes, severity}]`, fail-fast validation |
| 4 | Alerting path | reuse the EXISTING notify pipeline (route/dedupe/digest) — no parallel send path |
| 5 | State | `state/heartbeats.json` mirroring `DedupeStore`/`SettingsStore` (no DB) |
| 6 | Tick | 60s `setInterval` in `index.ts` next to the digest tick; injected clock; `bootAt` baseline for never-pinged |
| 7 | Registry/liveness | `GET /admin/heartbeats` = authoritative live "linked & alive" view (+ UI panel if one exists) |
| 8 | Live-send test | ABHAY-GATED manual step, NOT auto-run (spend + outward); mocks prove logic |

---

## References (load transitively in Notifier; mandates also stated inline)

- `.claude/rules/claude-behavior.md` — rules 15, 17, 20, 23, 26, 29, 33 (if synced)
- `.claude/rules/tdd-rule.md` — red-green-refactor (red-first mandatory)
- `.claude/rules/decision-authority.md` — why live sends are Abhay-gated (spend + outward)
- In-repo: `src/index.ts`, `src/server.ts`, `src/notify.ts`, `src/router.ts`, `src/dedupe.ts`, `src/settings.ts`, `src/config.ts`, `src/types.ts`, `config.example.yaml`, the colocated `*.spec.ts`
- Skills this contract drives: `/fix-loop`, `/systematic-debugging`, `code-reviewer-agent`
