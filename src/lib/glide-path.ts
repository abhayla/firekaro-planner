/**
 * Equity glide path — the Pfau-Kitces "rising equity" allocation
 * algorithm. As retirement approaches, taper equity DOWN (de-risking
 * window). Within retirement, taper equity UP (sequence-of-returns
 * protection — the "rising equity glide path" Pfau-Kitces published in
 * the 2014 J of Financial Planning).
 *
 * Phase 2 Stage C per docs/goals/build-firekaro-mvp-v5.md §5.
 * Audit Entry #7 A7.2 — Pfau-Kitces algorithm.
 *
 * MVP-1 scope: the de-risking taper before retirement (the first half
 * of the Pfau-Kitces path). The full V-shape with post-retirement
 * rising equity is implemented as a stretch capacity here; surfaces
 * consuming the path are introduced in Stage M (Phase 4).
 */

import type { GlidePathConfig } from "@/types/household";

export interface GlidePathPoint {
  /** Years from now (0 = today). */
  year: number;
  /** Equity % at this point (0-100). */
  equityPercent: number;
}

/**
 * Compute the year-by-year equity % path from today to retirement.
 *
 * Behavior:
 *  - When `config.enabled === false`, returns an empty array (the v4
 *    static-allocation behavior). Surfaces should treat this as "no
 *    glide path active" and fall back to the user's current allocation.
 *  - When `yearsToRetirement <= 0` and the path is enabled, returns a
 *    single point at the endEquityPercent.
 *  - The taper happens linearly over the LAST `taperWindowYears` of the
 *    horizon. Years before the taper window stay at startEquityPercent.
 *  - The end-of-path year has equityPercent = endEquityPercent.
 */
export function computeGlidePath(
  config: GlidePathConfig,
  yearsToRetirement: number,
): GlidePathPoint[] {
  if (!config.enabled) return [];
  if (yearsToRetirement <= 0) {
    return [{ year: 0, equityPercent: config.endEquityPercent }];
  }

  const taper = Math.min(config.taperWindowYears, yearsToRetirement);
  const flatYears = Math.max(0, yearsToRetirement - taper);

  const points: GlidePathPoint[] = [];
  // Flat startEquity region — years 0 .. flatYears.
  for (let y = 0; y <= flatYears; y++) {
    points.push({ year: y, equityPercent: config.startEquityPercent });
  }
  // Taper region — flatYears+1 .. yearsToRetirement.
  // Interpolate startEquity -> endEquity linearly over `taper` years.
  for (let i = 1; i <= taper; i++) {
    const t = i / taper;
    const equity =
      config.startEquityPercent +
      (config.endEquityPercent - config.startEquityPercent) * t;
    points.push({ year: flatYears + i, equityPercent: Math.round(equity * 10) / 10 });
  }
  return points;
}

/**
 * Resolve the equity % the path prescribes for a single year.
 * Convenience wrapper for surfaces that just need "what should my
 * allocation be N years from now?" — used by the Dashboard glide-path
 * summary chip (Stage I).
 *
 * Returns config.startEquityPercent when the path is disabled, so
 * surfaces still receive a meaningful number.
 */
export function equityPercentAtYear(
  config: GlidePathConfig,
  yearsToRetirement: number,
  year: number,
): number {
  if (!config.enabled) return config.startEquityPercent;
  if (year <= 0) return config.startEquityPercent;
  if (year >= yearsToRetirement) return config.endEquityPercent;

  const taper = Math.min(config.taperWindowYears, yearsToRetirement);
  const flatYears = Math.max(0, yearsToRetirement - taper);
  if (year <= flatYears) return config.startEquityPercent;

  const t = (year - flatYears) / taper;
  return (
    config.startEquityPercent +
    (config.endEquityPercent - config.startEquityPercent) * t
  );
}

/**
 * Pre-retirement de-risking summary — used by Dashboard Stage I.
 * Returns "Glide active: X% -> Y% over last Z years" or "Glide off".
 */
export function summarizeGlidePath(
  config: GlidePathConfig,
  yearsToRetirement: number,
): string {
  if (!config.enabled) return "Glide off";
  const taper = Math.min(config.taperWindowYears, yearsToRetirement);
  return (
    `Glide ${config.startEquityPercent}% → ${config.endEquityPercent}% ` +
    `over last ${taper} year${taper === 1 ? "" : "s"}`
  );
}
