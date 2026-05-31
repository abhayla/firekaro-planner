# VERIFY-AFTER-PROVISION — the deferred Tier-2 gates (run once `firekaro_v6` is live)

**Why this exists:** the goal contract (§0.3) ran with **no database** in-session.
The schema, migration SQL, the household **diff engine** unit tests, and the
**ServerAdapter** unit tests (mocked fetch) are proven in-session. The *live*
persistence round-trip (Rule 25) and *live* round-trip fidelity (Rule 26) were
**deferred** to this script. The backend is NOT "persistence-proven" until every
gate below passes against the live VPS `firekaro_v6`.

**Prereq:** `DEPLOY-VPS-firekaro_v6.md` completed — `firekaro_v6` exists, the
migration is applied, the backend is running, `GET /api/health` returns
`database: "connected"`.

Set up once:

```bash
export V6=http://127.0.0.1:3100          # the running v6 backend
export H='-H x-dev-bypass: true'          # 3-factor dev-bypass (dev only)
export DB="$DATABASE_URL"                  # the firekaro_v6 connection string
```

> Dev-bypass requires `NODE_ENV!=production` + `DEV_BYPASS_AUTH=true` + the
> `x-dev-bypass: true` header. For a production smoke test use a real session
> cookie instead of the bypass header.

---

## GATE 1 — `migrate deploy` applied cleanly (STAGE A, Tier-2)

```bash
npx prisma migrate status        # "Database schema is up to date!"
psql "$DB" -c "\dt" | wc -l       # 22 tables (+ _prisma_migrations)
```

PASS = status clean + all 22 tables present.

---

## GATE 2 — Rule 25 persistence round-trip, per entityKey (STAGE B, Tier-2)

For EACH of the 6 entityKeys, PUT a payload, GET it back, and read the DB
directly to confirm the normalized child tables hold the data (not just an echo).

### 2a. household (the diff engine's real proof)

```bash
# PUT a household with 2 members, 1 investment, 1 joint liability, 1 auto-flow recurring line.
curl -s $H -X PUT $V6/api/planner/household \
  -H 'content-type: application/json' \
  -d @fixtures/household-sample.json | jq '.success'      # true

# GET it back — must deep-equal the sent document (modulo server updatedAt).
curl -s $H $V6/api/planner/household | jq '.data.members | length'   # 2

# DIRECT DB READ — the substance check (Rule 25 signal 2): rows landed in the
# normalized child tables, not an opaque blob.
psql "$DB" -c "SELECT count(*) FROM members        WHERE \"userId\"=(SELECT id FROM \"user\" WHERE email='dev@firekaro-v6.local');"   # 2
psql "$DB" -c "SELECT count(*) FROM investments    WHERE \"userId\"=(SELECT id FROM \"user\" WHERE email='dev@firekaro-v6.local');"   # 1
psql "$DB" -c "SELECT \"ownerId\" FROM liabilities WHERE \"userId\"=(SELECT id FROM \"user\" WHERE email='dev@firekaro-v6.local');"   # 'Joint' (no FK error)
psql "$DB" -c "SELECT count(*) FROM recurring_expense_lines WHERE source='auto-loan';"   # 1
```

### 2b. assumptions / scenarios / features / ui / expense-history

```bash
for KEY in assumptions scenarios features ui expense-history; do
  curl -s $H -X PUT  $V6/api/planner/$KEY -H 'content-type: application/json' -d @fixtures/$KEY-sample.json | jq '.success'
  curl -s $H         $V6/api/planner/$KEY | jq '.data'   # echoes the persisted doc
done
# Substance: assumptions scalar landed typed; expense_snapshots keyed by period.
psql "$DB" -c "SELECT inflation FROM user_assumptions LIMIT 1;"                 # the sent value
psql "$DB" -c "SELECT period FROM expense_snapshots ORDER BY period;"           # the sent periods, de-duped
```

PASS = every GET round-trips the PUT, AND the direct DB read shows the expected
rows in the normalized tables.

---

## GATE 3 — Rule 26 round-trip fidelity + idempotency (STAGE B, Tier-2)

```bash
# Idempotency: PUT the SAME household twice — second PUT must not duplicate rows.
curl -s $H -X PUT $V6/api/planner/household -d @fixtures/household-sample.json -H 'content-type: application/json' >/dev/null
curl -s $H -X PUT $V6/api/planner/household -d @fixtures/household-sample.json -H 'content-type: application/json' >/dev/null
psql "$DB" -c "SELECT count(*) FROM members WHERE \"userId\"=(SELECT id FROM \"user\" WHERE email='dev@firekaro-v6.local');"   # STILL 2 (no dup)
psql "$DB" -c "SELECT count(*) FROM recurring_expense_lines WHERE source='auto-loan';"                                          # STILL 1 (ON CONFLICT held)

# Orphan cleanup: PUT a household with member B removed — B's row must be deleted.
curl -s $H -X PUT $V6/api/planner/household -d @fixtures/household-one-member.json -H 'content-type: application/json' >/dev/null
psql "$DB" -c "SELECT count(*) FROM members WHERE \"userId\"=(SELECT id FROM \"user\" WHERE email='dev@firekaro-v6.local');"   # 1
```

PASS = identical PUT is a no-op on row counts; removing an array element deletes
the orphaned row. (This is the live version of the in-session diff-engine unit
tests.)

---

## GATE 4 — Endpoint integration tests (un-skip + run, STAGE B Tier-2)

The endpoint integration tests were authored but `describe.skip`'d in-session
(`// pending firekaro_v6 provisioning`). Un-skip and run them against the live DB:

```bash
# In src/routes/planner.integration.spec.ts replace `describe.skip(` -> `describe(`.
DATABASE_URL="$DB" DEV_BYPASS_AUTH=true npm run test:unit
```

PASS = the integration suite is green against `firekaro_v6`.

---

## GATE 5 — STAGE C end-to-end (write-behind ServerAdapter, Tier-2)

Run the mvp frontend against the live backend with the server adapter on:

```bash
cd ..                                  # mvp/
VITE_USE_SERVER_ADAPTER=on npm run dev # :5175, talking to $V6
```

1. Log in (Google or dev-bypass), edit an expense in the UI.
2. Wait > 1.5s (the per-key debounce flush window).
3. Confirm the PUT hit Postgres:
   ```bash
   curl -s $H $V6/api/planner/household | jq '.data.expenses.avgMonthly'   # the edited value
   psql "$DB" -c "SELECT \"expensesAvgMonthly\" FROM household_config LIMIT 1;"  # same value
   ```
4. **Reload the page** — the edit survives (hydrateAll re-fills the warm cache).
5. **Cross-page (Rule 26):** the edited expense propagates to the FIRE
   aggregates (`useFireDerive()`), e.g. the dashboard FIRE number reflects it.

PASS = edit persists to Postgres within ~1.5s, survives reload, and propagates
to derived FIRE figures.

---

## GATE 6 — fallback path (STAGE C, optional but recommended)

Stop the backend, reload the frontend with `VITE_USE_SERVER_ADAPTER=on`. The app
must fall back to `LocalStorageAdapter` (logged) and stay usable — the demo build
(GitHub Pages, no backend) depends on this.

---

## Sign-off

When GATES 1–5 pass, the v6 backend is **persistence-proven**. Update the goal's
final report / DEFERRED ledger to mark the Tier-2 items closed, and record the
portfolio-level cutover note under `FW-FireKaro\DECISIONS.md` (5W-tier).
