import type { TemplateCategory } from "./comms-consent";

/**
 * Nudge → Meta-approved WhatsApp template mapping (catalog in
 * docs/whatsapp-templates.md). The EXACT approved name (Wati often adds a date
 * suffix) is supplied per key via env `COMMS_TEMPLATE_<KEY>`, so approving/renaming
 * a template never needs a code change. `category` decides which consent applies
 * (utility = base channel consent; marketing = marketingOptIn) and is fixed in code
 * because it drives the gate, not the copy.
 */

export type NudgeKey =
  | "welcome"
  | "milestone"
  | "offtrack"
  | "goal_reminder"
  | "annual_review"
  | "monthly_digest"
  | "winback"
  | "salary_update";

export interface TemplateMapping {
  /** Exact Meta-approved template name to send. */
  templateName: string;
  category: TemplateCategory;
  /** Number of `{{n}}` body variables the template expects. */
  paramCount: number;
}

/** Canonical defaults. `templateName` is the base name; override per deployment via env. */
const DEFAULTS: Record<NudgeKey, TemplateMapping> = {
  // Param counts exclude the app link — it's static text (firekaro.com) in each
  // body, since a template can't END with a variable (Meta rule) and the link is
  // the same for everyone.
  welcome: { templateName: "firekaro_welcome_2026_06_03", category: "utility", paramCount: 0 },
  milestone: { templateName: "firekaro_milestone", category: "utility", paramCount: 3 },
  offtrack: { templateName: "firekaro_offtrack", category: "utility", paramCount: 3 },
  goal_reminder: { templateName: "firekaro_goal_reminder", category: "utility", paramCount: 4 },
  annual_review: { templateName: "firekaro_annual_review", category: "utility", paramCount: 1 },
  monthly_digest: { templateName: "firekaro_monthly_digest", category: "marketing", paramCount: 4 },
  winback: { templateName: "firekaro_winback", category: "marketing", paramCount: 2 },
  salary_update: { templateName: "firekaro_salary_update", category: "marketing", paramCount: 1 },
};

export const NUDGE_KEYS = Object.keys(DEFAULTS) as NudgeKey[];

/** Resolve the template for a nudge, applying any `COMMS_TEMPLATE_<KEY>` env override. */
export function templateFor(key: NudgeKey, env: NodeJS.ProcessEnv = process.env): TemplateMapping {
  const base = DEFAULTS[key];
  const override = env[`COMMS_TEMPLATE_${key.toUpperCase()}`]?.trim();
  return override ? { ...base, templateName: override } : base;
}
