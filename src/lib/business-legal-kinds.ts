// Stage K — shared LEGAL_KINDS constant + label lookup used by BusinessForm and
// OtherIncomeForm (and any future form that wants consistent legal-kind labels).

import type { BusinessLegalKind } from "@/types/household";

export interface LegalKindOption {
  value: BusinessLegalKind;
  label: string;
}

export const BUSINESS_LEGAL_KINDS: LegalKindOption[] = [
  { value: "SoleProp", label: "Sole Proprietorship" },
  { value: "FreelanceProf", label: "Freelance / Professional (44ADA)" },
  { value: "Partnership", label: "Partnership firm" },
  { value: "LLP", label: "LLP" },
  { value: "PvtLtd", label: "Private Limited" },
  { value: "HUF", label: "HUF (running a business)" },
  { value: "Other", label: "Other" },
];

export function labelForLegalKind(kind: BusinessLegalKind | undefined | null): string {
  if (!kind) return "—";
  return BUSINESS_LEGAL_KINDS.find((k) => k.value === kind)?.label ?? String(kind);
}
