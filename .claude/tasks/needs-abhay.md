# Needs Abhay — human-gated blocker register

> **Purpose:** the running list of things I (Claude) **cannot complete myself** and need Abhay
> at the laptop for. Created 2026-06-02. I append here whenever I hit a human gate; Abhay clears
> items when in front of the machine. Check an item off (`[x]`) or delete it once done.
>
> **Scope:** only genuinely human-gated work — interactive auth, SSH to the VPS, DNS, spending,
> `/goal` execution, deploy approval, and 5Wealths-portfolio writes (L-042). Reversible/internal
> work is NOT here — I just do that (see `decision-authority.md`). Items mine-to-finish are in §C
> for transparency, not because they need you.

---

## A. Open one-off blockers (need you / your laptop)

- [ ] **A1 — Rotate/delete the Cloudflare API token left in the VPS `server/.env`.** `P1 security.`
  - **What:** `CF_API_TOKEN_FIREKARO_API_token` in `/var/www/firekaro/server/.env` on the VPS. It
    was used once to issue the Origin Certificate (done) and is no longer needed.
  - **Why it needs you:** deleting the token needs the Cloudflare dashboard (or an authenticated CF
    session I don't hold), AND removing the line from the VPS `.env` needs SSH (your key, your box).
  - **Do:** (1) Cloudflare dashboard → My Profile → API Tokens → delete the `Zone·SSL:Edit` token.
    (2) SSH in → edit `server/.env` to drop the `CF_API_TOKEN_*` line → `pm2 reload firekaro-api`.
  - **Risk if left:** low (scoped to SSL:Edit, gitignored) but it's a standing live credential.
  - Source: `[[project_v6_hosting]]` "SECURITY TODO for Abhay".

- [ ] **A2 — Decide direction on the ESLint drift (this is mine to *execute*, yours to *pick*).** `P2.`
  - **What:** this extracted repo has **no ESLint config and no `lint` script**, yet 3 rule files
    (`commit-convention.md`, `api-envelope-pattern.md`, `structured-logging.md`) still reference
    `npm run lint` / `eslint.config.js` (stale from the FIREKaro-Vue monoropo).
  - **Pick one:** **(1)** I wire up ESLint (port the `no-restricted-syntax` envelope rule +
    `no-console` server override + a `lint` script) so the invariants are machine-enforced again
    — **my recommendation**; or **(2)** I correct the 3 rule files to mark those invariants
    convention-only. Either is reversible; I just need your call on which.
  - Once you say "1" or "2" I execute it without further questions.

---

## B. Standing dependencies (recurring — not one-off; here so they're never a surprise)

- [ ] **B1 — Production redeploy = SSH, which only you have.** Any change that must reach
  https://firekaro.com needs the VPS bring-up run from your machine (SSH key
  `~/.ssh/firekaro_v6_vps` → `72.61.240.224`). Redeploy = re-run `git archive HEAD | ssh … tar -x`
  → `npm ci && build` (FE) → `pm2 reload firekaro-api`. Runbook: `docs/DEPLOY.md`. I can prep the
  exact commands; you run them (or paste them after `! ` at your laptop so output lands here).

- [ ] **B2 — DNS for `firekaro.com` is yours.** Cloudflare-fronted, not in the Hostinger account.
  Any A-record / proxy / SSL-mode change is your action. (Currently live + Full-strict — no change pending.)

- [ ] **B3 — `/goal` execution is yours.** I author goal contracts (`goal-creator` →
  `docs/goals/…md`); you run the built-in `/goal` command. I never simulate it
  (`feedback_goal_is_user_invoked`).

- [ ] **B4 — Interactive CLI/MCP logins need you.** Anything that opens a browser-consent or
  interactive prompt (gcloud / gh auth / Supabase / Cloudflare-MCP / Hostinger-MCP `authenticate`).
  Fastest path: type the command after `! ` in the prompt so it runs in-session and I see the output.

- [ ] **B5 — Deploy / spend / publish-externally = one-line escalation, then your go.** Per
  `decision-authority.md` I pause only for these gated actions (prod deploy, DNS cutover, money,
  destructive git, a genuine product fork). I'll keep doing all non-gated work in parallel.

- [ ] **B6 — 5Wealths-portfolio writes are yours (L-042).** I capture portfolio/strategic calls as
  `TODO(5W):` here in-repo; I cannot write into `D:\…\5Wealths\`. You carry them across in a 5W
  session. Currently open `TODO(5W)`: retire the old `firekaro.com` Next.js app (FW-FireKaro);
  analytics/comms privacy-posture decision (when Tier-1 retention work starts).

---

## C. Mine to finish — NOT blocked on you (tracked for transparency)

- [ ] **C1 — Live-web cross-check of the role-orchestration changes** against Anthropic's published
  "Building Effective Agents" / multi-agent-research articles, once the API recovers (all WebSearch/
  WebFetch returned 529 on 2026-06-02). If it surfaces anything the reviewer agent missed, I fold it
  in as a follow-up edit. No action needed from you.

- [ ] **C2 — Open FinTech GitHub issues** (#4 80CCD(2) govt-sector/cap, #6 tax FY-fallback + CII/LTCG,
  #7 EPF/PPF/NPS retirement models, #9 FIRE-projection scope disclosure, #5 Wati adapter hardening).
  Most are mine to work via `/fix-issue`. A few embed **product-scope forks** (e.g. #6 "add CII-indexed
  LTCG?", #9 "which projection scope-cuts to disclose") that may need a one-line product call from you
  — I'll escalate those individually when I reach them, not pre-emptively.

---

*Maintenance: I update this file in the same turn I hit a new gate (rule 27 SSOT discipline). When an
item clears, strike it or delete it — don't let it rot.*
