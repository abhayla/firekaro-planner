import { derive } from "@planner/lib/derive";
import { readHousehold } from "./household-repo";
import { readAssumptions } from "./planner-read";
import { prisma } from "./prisma";
import { logger } from "./logger";
import {
  evaluateLifecycle,
  financialYearOf,
  type LifecycleNudgeKey,
  type LifecycleSignals,
} from "./lifecycle-evaluator";
import { fireNudge, type NudgeTarget } from "./whatsapp-triggers";
import { alreadySent, listConsentingWhatsAppUsers, type ConsentingWhatsAppUser } from "./comms-repo";

/**
 * Lifecycle runner (D4/D5) — the orchestration the scheduled internal endpoint
 * drives. For each consenting WhatsApp user it loads the household + assumptions,
 * runs the shared pure `derive()`, evaluates the lifecycle nudges, skips the ones
 * already sent for their period/threshold (dedup), and fires the rest through the
 * consent-gated + fail-closed-allowlisted sender. Deps are injectable so the core
 * loop is unit-testable without a DB or network. SAFETY: until A6 is flipped, every
 * send is still restricted to WATI_TEST_RECIPIENTS by the Wati adapter — this runner
 * never bypasses that.
 */

export interface LifecycleRunResult {
  /** Consenting users considered. */
  users: number;
  /** Nudges evaluated across all users (before dedup). */
  candidates: number;
  /** Nudges the sender accepted (sent === true). */
  sent: number;
  /** Nudges skipped because already sent for their period/threshold. */
  deduped: number;
  /** Nudges attempted but refused by the sender (consent/cap/allowlist/failure). */
  notSent: number;
}

export interface RunnerDeps {
  listUsers: () => Promise<ConsentingWhatsAppUser[]>;
  /** Derived FIRE signals for a user, or null when there is nothing to evaluate. */
  loadSignals: (userId: string) => Promise<LifecycleSignals | null>;
  getFirstName: (userId: string) => Promise<string>;
  alreadySent: (userId: string, dedupeKey: string) => Promise<boolean>;
  fire: (
    key: LifecycleNudgeKey,
    target: NudgeTarget,
    values: string[],
    dedupeKey: string,
  ) => Promise<{ sent: boolean; reason: string }>;
  now: () => Date;
}

async function defaultLoadSignals(userId: string): Promise<LifecycleSignals | null> {
  const household = await readHousehold(prisma, userId);
  // No household doc, or an empty one → nothing to evaluate.
  if (!household || !household.members.length) return null;
  const assumptions = await readAssumptions(prisma, userId);
  const d = derive(household, assumptions, {
    isFamilyView: true, // whole-household aggregate (no member lens) for the scheduled run
    viewingMemberId: null,
    currentFY: financialYearOf(new Date()),
  });
  return {
    progressPercent: d.progressPercent,
    fireWithdrawableCorpus: d.fireWithdrawableCorpus,
    anchorAge: d.anchorAge,
    targetRetirementAge: d.targetRetirementAge,
    yearsToRegular: d.yearsToRegular,
    savingsRate: d.savingsRate,
  };
}

async function defaultFirstName(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return (user?.name ?? "").trim().split(/\s+/)[0] || "there";
}

function defaultRunnerDeps(): RunnerDeps {
  return {
    listUsers: listConsentingWhatsAppUsers,
    loadSignals: defaultLoadSignals,
    getFirstName: defaultFirstName,
    alreadySent,
    fire: (key, target, values, dedupeKey) =>
      fireNudge(key, target, values, undefined, dedupeKey).then((r) => ({
        sent: r.sent,
        reason: r.reason,
      })),
    now: () => new Date(),
  };
}

export async function runLifecycle(
  depsOverride: Partial<RunnerDeps> = {},
): Promise<LifecycleRunResult> {
  const deps = { ...defaultRunnerDeps(), ...depsOverride };
  const users = await deps.listUsers();
  let candidates = 0;
  let sent = 0;
  let deduped = 0;
  let notSent = 0;

  for (const u of users) {
    let signals: LifecycleSignals | null;
    try {
      signals = await deps.loadSignals(u.userId);
    } catch (e) {
      logger.warn(
        { err: e instanceof Error ? e.message : String(e), userId: u.userId },
        "lifecycle: signal load failed — skipping user",
      );
      continue;
    }
    if (!signals) continue;

    // gh-issue #10: a DB hiccup fetching the name must not abort the whole run — fall back.
    let firstName = "there";
    try {
      firstName = await deps.getFirstName(u.userId);
    } catch (e) {
      logger.warn(
        { err: e instanceof Error ? e.message : String(e), userId: u.userId },
        "lifecycle: firstName fetch failed — using fallback",
      );
    }
    const nudges = evaluateLifecycle({ signals, now: deps.now() });

    for (const n of nudges) {
      candidates++;
      if (await deps.alreadySent(u.userId, n.dedupeKey)) {
        deduped++;
        continue;
      }
      const target: NudgeTarget = { userId: u.userId, toNumber: u.whatsappNumber, firstName };
      const r = await deps.fire(n.key, target, [firstName, ...n.values], n.dedupeKey);
      if (r.sent) sent++;
      else notSent++;
    }
  }

  logger.info({ users: users.length, candidates, sent, deduped, notSent }, "lifecycle run complete");
  return { users: users.length, candidates, sent, deduped, notSent };
}
