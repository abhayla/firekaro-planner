/**
 * Expense history — annual snapshot infrastructure.
 *
 * Phase 2 Stage E per docs/goals/build-firekaro-mvp-v5.md §5.
 * Audit Entry #29 (lifestyle inflation tracking) + Entry #30 (goal-post
 * shift detection).
 *
 * Stores YoY snapshots of total expenses + per-bucket breakdowns so the
 * Dashboard / Reports surfaces can render the year-on-year chart and
 * the nudge engine can detect lifestyle inflation > general inflation
 * (Entry #29 A29.4) or goal-post shifts (the user keeps editing target
 * dates outward to keep the FIRE number "achievable" — Entry #30 A30.2).
 *
 * Snapshots are append-only, keyed by FY, persisted via the storage
 * adapter (Stage A5). One snapshot per FY; re-saving the same FY
 * overwrites (the user might tweak data within an FY).
 */

import type { Household, InflationBucket } from "@/types/household";
import { makeAdapter } from "@/lib/storage-adapter";
import { getAuthProvider } from "@/lib/auth-provider";

export interface ExpenseSnapshot {
  /**
   * Period key, `YYYY-MM` (audit A29.1/A30.1, P3). The primary de-dup key —
   * one snapshot per calendar month so a returning user accrues a real point
   * per month. Replaces the old FY-only keying so monthly points survive.
   */
  period: string;
  /** Financial year (`YYYY-YY`) at capture — retained for FY-oriented labels. */
  fy: string;
  /** Captured-at ISO timestamp. */
  capturedAt: string;
  /** Total annual expenses captured at this snapshot. */
  totalAnnual: number;
  /** Breakdown by inflation bucket. */
  byBucket: Record<InflationBucket, number>;
  /** Active FIRE target year at snapshot time (for goal-post drift). */
  fireTargetYear?: number;
  /**
   * Headline FIRE number (₹) at snapshot time (A30.3 trajectory chart). Optional
   * because the household-store hydrate trigger captures expenses before the
   * derive engine is available; the Dashboard enriches the current period's
   * snapshot with the live number on mount.
   */
  fireNumber?: number;
  /**
   * Net worth (₹ = FIRE corpus − liabilities) at snapshot time. Optional for the
   * same reason as `fireNumber` — the store-hydrate trigger captures expenses
   * before the derive engine is live; the Dashboard enriches the current
   * period's snapshot with the real number on mount (A29.x net-worth trend).
   */
  netWorth?: number;
}

export interface CaptureSnapshotOpts {
  /** Period key `YYYY-MM`. */
  period: string;
  /** Financial year `YYYY-YY`. */
  fy: string;
  fireTargetYear?: number;
  fireNumber?: number;
  netWorth?: number;
}

const ENTITY_KEY = "expense-history";

/** `YYYY-MM` period key for a date (the snapshot de-dup key). Date passed in for testability. */
export function periodKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
}

/** Indian financial year (`YYYY-YY`, Apr–Mar) for a date. Date passed in for testability. */
export function financialYearOf(date: Date): string {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? y : y - 1; // Apr (month 3) starts the FY
  const endYY = `${(startYear + 1) % 100}`.padStart(2, "0");
  return `${startYear}-${endYY}`;
}

/**
 * The CURRENT Indian financial year, auto-derived from the wall clock. This is
 * the single source of "what FY are we in" for `derive()`, the salary/income
 * forms, and nudges — there is no global manual FY pick (the FY selector is
 * scoped to the tax-planning screen only). `now` is injectable for testability.
 *
 * No clamping to the configured tax FYs — that is the tax-screen picker's job;
 * `getTaxConfigForFY` already falls back for an unconfigured FY.
 */
export function getCurrentFinancialYear(now: Date = new Date()): string {
  return financialYearOf(now);
}

/** True when a snapshot already exists for the given `YYYY-MM` period. */
export function hasSnapshotForPeriod(period: string): boolean {
  return loadAllSnapshots().some((s) => s.period === period);
}

/** Whole months from `base` to `period` (both `YYYY-MM`). Negative if before. */
export function monthsBetween(base: string, period: string): number {
  const [by, bm] = base.split("-").map(Number);
  const [py, pm] = period.split("-").map(Number);
  return (py - by) * 12 + (pm - bm);
}

/** Short label `MMM YY` for a `YYYY-MM` period, used on chart axes. */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

/**
 * Capture a snapshot for the given period. If a snapshot already exists for
 * the same `period` (YYYY-MM), it's replaced (idempotent within a month) —
 * so re-capturing in the same month enriches (e.g. backfills fireNumber)
 * rather than duplicating.
 */
export function captureSnapshot(
  household: Household,
  opts: CaptureSnapshotOpts,
): ExpenseSnapshot {
  const totalAnnual =
    household.expenses.avgMonthly * 12 +
    household.expenses.recurring.reduce((s, r) => s + monthlyEq(r.amount, r.frequency) * 12, 0);

  const byBucket: Record<InflationBucket, number> = {
    general: 0,
    healthcare: 0,
    education: 0,
    housing: 0,
  };
  for (const r of household.expenses.recurring) {
    const bucket = (r.inflationBucket ?? "general") as InflationBucket;
    byBucket[bucket] += monthlyEq(r.amount, r.frequency) * 12;
  }
  // avgMonthly defaults to general inflation per audit.
  byBucket.general += household.expenses.avgMonthly * 12;

  const snapshot: ExpenseSnapshot = {
    period: opts.period,
    fy: opts.fy,
    capturedAt: new Date().toISOString(),
    totalAnnual,
    byBucket,
    fireTargetYear: opts.fireTargetYear,
    fireNumber: opts.fireNumber,
    netWorth: opts.netWorth,
  };

  const existing = loadAllSnapshots();
  const filtered = existing.filter((s) => s.period !== opts.period);
  filtered.push(snapshot);
  filtered.sort((a, b) => a.period.localeCompare(b.period));
  saveAllSnapshots(filtered);

  return snapshot;
}

/** Load all snapshots in chronological (period) order, oldest first. */
export function loadAllSnapshots(): ExpenseSnapshot[] {
  const adapter = makeAdapter(getAuthProvider());
  return adapter.get<ExpenseSnapshot[]>(ENTITY_KEY) ?? [];
}

/** Replace the entire snapshot collection. */
function saveAllSnapshots(snapshots: ExpenseSnapshot[]): void {
  const adapter = makeAdapter(getAuthProvider());
  adapter.set(ENTITY_KEY, snapshots);
}

// ---------- Analysis helpers ----------

export interface LifestyleInflationResult {
  /** Average YoY growth in total expenses across all available snapshots. */
  averageYoYGrowth: number;
  /** True when growth exceeds the assumed general inflation by 2pp+. */
  isLifestyleInflating: boolean;
  /** Per-bucket YoY growth rate. */
  byBucket: Partial<Record<InflationBucket, number>>;
}

/**
 * Detect lifestyle inflation (audit Entry #29 A29.4). Returns the
 * average year-on-year growth across snapshots and flags when it
 * exceeds general inflation by 2pp (the audit threshold).
 *
 * Requires at least 2 snapshots; returns zero-growth when fewer.
 */
export function analyzeLifestyleInflation(
  generalInflation: number = 0.06,
): LifestyleInflationResult {
  const snapshots = loadAllSnapshots();
  if (snapshots.length < 2) {
    return { averageYoYGrowth: 0, isLifestyleInflating: false, byBucket: {} };
  }

  const yoy: number[] = [];
  const bucketYoY: Record<InflationBucket, number[]> = {
    general: [],
    healthcare: [],
    education: [],
    housing: [],
  };
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    if (prev.totalAnnual > 0) {
      yoy.push(curr.totalAnnual / prev.totalAnnual - 1);
    }
    for (const bucket of ["general", "healthcare", "education", "housing"] as const) {
      if (prev.byBucket[bucket] > 0) {
        bucketYoY[bucket].push(curr.byBucket[bucket] / prev.byBucket[bucket] - 1);
      }
    }
  }

  const averageYoYGrowth = yoy.length > 0 ? yoy.reduce((s, v) => s + v, 0) / yoy.length : 0;
  const byBucket: Partial<Record<InflationBucket, number>> = {};
  for (const bucket of ["general", "healthcare", "education", "housing"] as const) {
    if (bucketYoY[bucket].length > 0) {
      byBucket[bucket] = bucketYoY[bucket].reduce((s, v) => s + v, 0) / bucketYoY[bucket].length;
    }
  }

  return {
    averageYoYGrowth,
    isLifestyleInflating: averageYoYGrowth > generalInflation + 0.02,
    byBucket,
  };
}

/**
 * Detect goal-post shift (audit Entry #30 A30.2). Returns the count of
 * times the user has moved their FIRE target year FURTHER OUT across
 * snapshots — a behavioral red-flag.
 */
export function detectGoalPostShift(): { shiftCount: number; totalYearsAdded: number } {
  const snapshots = loadAllSnapshots().filter((s) => s.fireTargetYear !== undefined);
  let shiftCount = 0;
  let totalYearsAdded = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1].fireTargetYear!;
    const curr = snapshots[i].fireTargetYear!;
    if (curr > prev) {
      shiftCount++;
      totalYearsAdded += curr - prev;
    }
  }
  return { shiftCount, totalYearsAdded };
}

// ---------- Helpers ----------

function monthlyEq(amount: number, frequency: "M" | "Q" | "A"): number {
  if (frequency === "M") return amount;
  if (frequency === "Q") return amount / 3;
  return amount / 12;
}
