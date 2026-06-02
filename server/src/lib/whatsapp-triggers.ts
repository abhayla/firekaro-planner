import { sendNudge, type SendNudgeResult, type SenderDeps } from "./whatsapp-sender";
import { templateFor, type NudgeKey } from "./comms-templates";
import type { WatiTemplateParam } from "./wati-client";
import { logger } from "./logger";

/**
 * Lifecycle triggers — map a domain event (signup, milestone, off-track, digest…)
 * to the right approved template + params and fire it through the consent-gated
 * sender. This is the layer the scheduler + event handlers call. Each trigger
 * resolves the template via comms-templates (env-overridable approved name) so the
 * caller never hardcodes a template name. Positional params are 1-indexed for Wati.
 */

export interface NudgeTarget {
  userId: string;
  toNumber: string;
  firstName: string;
}

function toParams(values: string[]): WatiTemplateParam[] {
  return values.map((v, i) => ({ name: String(i + 1), value: v }));
}

/** Generic fire: resolve template for `key`, build params from `values`, send. */
export async function fireNudge(
  key: NudgeKey,
  target: NudgeTarget,
  values: string[],
  deps?: Partial<SenderDeps>,
): Promise<SendNudgeResult> {
  const tpl = templateFor(key);
  if (values.length !== tpl.paramCount) {
    logger.warn(
      { key, expected: tpl.paramCount, got: values.length, template: tpl.templateName },
      "nudge param count mismatch — sending anyway (Wati will validate)",
    );
  }
  return sendNudge(
    {
      userId: target.userId,
      toNumber: target.toNumber,
      templateName: tpl.templateName,
      category: tpl.category,
      parameters: toParams(values),
    },
    deps,
  );
}

// ---- Typed per-event triggers (param order matches docs/whatsapp-templates.md) ----

/** Welcome: the approved template currently has no body variables. */
export const triggerWelcome = (t: NudgeTarget, deps?: Partial<SenderDeps>) =>
  fireNudge("welcome", t, [], deps);

export const triggerMilestone = (
  t: NudgeTarget,
  v: { amount: string; percent: string; link: string },
  deps?: Partial<SenderDeps>,
) => fireNudge("milestone", t, [t.firstName, v.amount, v.percent, v.link], deps);

export const triggerOffTrack = (
  t: NudgeTarget,
  v: { fireYear: string; driver: string; link: string },
  deps?: Partial<SenderDeps>,
) => fireNudge("offtrack", t, [t.firstName, v.fireYear, v.driver, v.link], deps);

export const triggerGoalReminder = (
  t: NudgeTarget,
  v: { goalName: string; date: string; percent: string; link: string },
  deps?: Partial<SenderDeps>,
) => fireNudge("goal_reminder", t, [t.firstName, v.goalName, v.date, v.percent, v.link], deps);

export const triggerAnnualReview = (
  t: NudgeTarget,
  v: { link: string },
  deps?: Partial<SenderDeps>,
) => fireNudge("annual_review", t, [t.firstName, v.link], deps);

export const triggerMonthlyDigest = (
  t: NudgeTarget,
  v: { netWorth: string; savingsRate: string; fireDate: string; link: string },
  deps?: Partial<SenderDeps>,
) =>
  fireNudge(
    "monthly_digest",
    t,
    [t.firstName, v.netWorth, v.savingsRate, v.fireDate, v.link],
    deps,
  );

export const triggerWinback = (
  t: NudgeTarget,
  v: { fireDate: string; link: string },
  deps?: Partial<SenderDeps>,
) => fireNudge("winback", t, [t.firstName, v.fireDate, v.link], deps);

export const triggerSalaryUpdate = (
  t: NudgeTarget,
  v: { link: string },
  deps?: Partial<SenderDeps>,
) => fireNudge("salary_update", t, [t.firstName, v.link], deps);
