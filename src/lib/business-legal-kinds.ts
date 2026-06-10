// Shared legal-kind vocabulary for businesses: the LEGAL_KINDS constant + label
// lookup (BusinessForm + the Business page), the owner's share math, and the pure
// browse-column builder (#158): column membership is by
// ENTRY EXISTENCE, never by money — a ₹0-profit business must stay reachable
// (visible / editable / deletable), or it becomes an undeletable orphan that the
// KPI tiles still count. Money-share charts (donut / ranked) keep their own >0
// filter at the call site; that predicate is about share-of-money, not reachability.

import { toAnnual } from "@/lib/cashflow";
import type { Business, BusinessLegalKind } from "@/types/household";

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

/** The owner's annualized slice of a business's profit. */
export function businessPersonalShare(b: Business): number {
  return toAnnual({ amount: b.annualProfit, period: b.frequency }) * (b.sharePercent / 100);
}

export interface BusinessKindColumn {
  kind: BusinessLegalKind;
  /** Annual personal-share total for the kind — MAY be 0; never used for membership. */
  total: number;
  /** Active businesses of this kind, sorted by personal share desc. */
  entries: Business[];
}

/**
 * One column per legal kind that has ≥1 active entry — the reachability invariant
 * (#158): every business in the store has a visible, clickable card. Columns sort
 * by money total desc (zero-total columns last, canonical kind order for ties).
 */
export function buildBusinessKindColumns(active: Business[]): BusinessKindColumn[] {
  const canonical = BUSINESS_LEGAL_KINDS.map((k) => k.value);
  return canonical
    .map((kind) => {
      const entries = active
        .filter((b) => b.legalKind === kind)
        .sort((a, b) => businessPersonalShare(b) - businessPersonalShare(a));
      return { kind, entries, total: entries.reduce((s, b) => s + businessPersonalShare(b), 0) };
    })
    .filter((c) => c.entries.length > 0)
    .sort((a, b) => b.total - a.total);
}
