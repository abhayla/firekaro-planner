// Pure state-precedence logic for PanelCard, extracted so it is unit-testable
// in the mvp's node test env without a DOM/component harness. The component
// (`src/components/shared/PanelCard.vue`) renders exactly the region this returns.

export type PanelRegion = "loading" | "error" | "empty" | "body";

export interface PanelRegionState {
  loading?: boolean;
  /** Truthy boolean, or a non-empty message string, both count as an error. */
  error?: boolean | string;
  empty?: boolean;
}

/**
 * Resolve which single region a PanelCard renders, in strict priority order:
 *   loading → error → empty → body
 *
 * Rationale for the order: a still-loading card has no trustworthy error/empty
 * signal yet, so loading wins; a hard error supersedes an "empty" result
 * because the emptiness may be a side effect of the failure; empty only shows
 * once we know the fetch succeeded with no rows; otherwise render the body.
 */
export function resolvePanelRegion(state: PanelRegionState): PanelRegion {
  if (state.loading) return "loading";
  if (state.error) return "error"; // truthy boolean OR non-empty string
  if (state.empty) return "empty";
  return "body";
}
