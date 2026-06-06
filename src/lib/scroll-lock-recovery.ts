/**
 * Self-healing recovery for a stuck Vuetify scroll-lock.
 *
 * Vuetify's `scroll-strategy="block"` (the default for `v-dialog` / `v-overlay`)
 * adds the `v-overlay-scroll-blocked` class to `<html>` while an overlay is open:
 *
 *   html.v-overlay-scroll-blocked { position: fixed; top: var(--v-body-scroll-y);
 *     left: var(--v-body-scroll-x); width: 100%; height: 100%; }
 *
 * — which removes the scrollbar entirely and parks the page. Normally Vuetify
 * strips the class on overlay teardown. But if an open overlay (an app-bar
 * menu/select still open, a dialog, a tooltip-as-overlay) unmounts abruptly —
 * e.g. an SPA route change swaps the page while it is still open — that teardown
 * can be skipped, leaving `<html>` frozen at `position: fixed` with NO scrollbar
 * across every screen until a hard reload. Observed symptom: "no scrollbar at
 * all, on almost all screens, and it was gone when I reloaded/looked again."
 *
 * This module lets the router self-heal that state after every navigation:
 * release the lock IFF the page is scroll-locked but no overlay is actually open.
 * It is a strict no-op when a lock legitimately corresponds to an open overlay,
 * or when nothing is locked.
 */

const SCROLL_BLOCK_CLASS = "v-overlay-scroll-blocked";
const ACTIVE_OVERLAY_SELECTOR = ".v-overlay--active";

/**
 * Pure decision: release a stuck scroll-lock only when the page is locked AND no
 * overlay is actually open. Split out as a pure predicate so the core logic is
 * unit-testable without a DOM.
 */
export function shouldReleaseScrollLock(
  hasBlockedClass: boolean,
  hasActiveOverlay: boolean,
): boolean {
  return hasBlockedClass && !hasActiveOverlay;
}

/**
 * Release a stuck Vuetify scroll-lock when one is present without any open
 * overlay. Returns `true` if a stuck lock was actually released. Safe to call
 * anywhere — it is a no-op when there is nothing stuck to release.
 *
 * Scope: this heals the **document-level** lock on `<html>` (the cause of
 * "no scrollbar at all, across every screen" — gh #42). Vuetify can also block
 * scroll on a nested scroll-parent for a `contained` overlay; that narrower case
 * is intentionally out of scope here (no evidence it occurs in this app — YAGNI).
 *
 * Wrapped in try/catch: this is a best-effort post-navigation safety net and must
 * never throw into the router's afterEach chain.
 */
export function releaseStuckScrollLock(doc: Document = document): boolean {
  try {
    const html = doc.documentElement;
    const hasBlockedClass = html.classList.contains(SCROLL_BLOCK_CLASS);
    const hasActiveOverlay = doc.querySelector(ACTIVE_OVERLAY_SELECTOR) !== null;
    if (!shouldReleaseScrollLock(hasBlockedClass, hasActiveOverlay)) return false;

    // Vuetify parks the pre-lock scroll offset in CSS vars (the `top`/`left`
    // above), stored as negative px strings. Capture before clearing so the page
    // does not jump to the top when we restore normal flow.
    const restoreY = Math.abs(parseFloat(html.style.getPropertyValue("--v-body-scroll-y")) || 0);
    const restoreX = Math.abs(parseFloat(html.style.getPropertyValue("--v-body-scroll-x")) || 0);

    // Removing the class drops `position: fixed`; clearing the vars removes the
    // residual offset. Together this fully restores normal document scrolling.
    html.classList.remove(SCROLL_BLOCK_CLASS);
    html.style.removeProperty("--v-body-scroll-y");
    html.style.removeProperty("--v-body-scroll-x");

    doc.defaultView?.scrollTo?.(restoreX, restoreY);
    return true;
  } catch (err) {
    // Best-effort recovery — surface but never propagate.
    console.warn("[scroll-lock-recovery] failed to release stuck scroll-lock", err);
    return false;
  }
}
