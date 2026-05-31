/**
 * Section metadata for the 6-step gating questionnaire — copy + title
 * lookup per docs/goals/build-firekaro-mvp-v5.md §6 Stage F.
 */
import type { QuestionnaireSection } from "@/lib/features";

export interface GatingStepMeta {
  section: QuestionnaireSection;
  key: string;
  label: string;
  title: string;
  description: string;
}

export const GATING_STEPS: GatingStepMeta[] = [
  {
    section: 1,
    key: "investments",
    label: "Investments",
    title: "Which investments do you hold?",
    description:
      "Check every investment type you currently hold or actively contribute to. We'll tailor the dashboard to surface the right calculators + nudges. You can re-enable types later on Preferences.",
  },
  {
    section: 2,
    key: "liabilities",
    label: "Liabilities",
    title: "Which loans / credit do you carry?",
    description:
      "Active loans + credit card debt unlock the liabilities section, joint-loan deduction nudges, and EMI tracking.",
  },
  {
    section: 3,
    key: "insurance",
    label: "Insurance",
    title: "Which insurance policies do you hold?",
    description:
      "Active policies unlock the insurance section, HLV gap analysis, and 80D deduction tracking.",
  },
  {
    section: 4,
    key: "family",
    label: "Family situation",
    title: "Tell us about your family situation",
    description:
      "Aging parents, children, or extended-family obligations unlock the audit-grounded family layer: parents bucket, education target, marriage event, extended-contingency buffer.",
  },
  {
    section: 5,
    key: "tax",
    label: "Tax situation",
    title: "Tax planning concerns",
    description:
      "Cross-pillar tax surfacing — parents 80D unlock, sandwich-gen credits, foreign-RSU complexity warnings.",
  },
  {
    section: 6,
    key: "planning",
    label: "Planning concerns",
    title: "Which planning concerns matter to you?",
    description:
      "Coast FIRE / Barista FIRE / stress testing / estate planning / healthcare buffer. These default ON so you see them by default — opt OUT what doesn't apply.",
  },
];
