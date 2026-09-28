import { LocalStorageAdapter, type StorageAdapter } from "@/lib/storage-adapter";
import { ANON_USER_ID } from "@/lib/auth-provider";

/**
 * #187 sign-up handoff — carry a GUEST's /quick answers into the account they just created.
 *
 * WHY THIS MODULE EXISTS (a real gap, not a formality): a signed-out visitor's answers live in
 * `firekaro-mvp:anon:*` via LocalStorageAdapter. On sign-in, main.ts installs the ServerAdapter and
 * `hydrateAll()` warms the cache from the SERVER — so without this step the guest's ten answers are
 * simply never uploaded and the new account opens empty. "The existing hydrate path picks it up" is
 * not true of the code as built; this is the step that makes the handoff real.
 *
 * SAFETY — it copies UP, never DOWN, and never over anything:
 *   - only runs when the server side is EMPTY (no members): an existing plan is never overwritten;
 *   - only runs when the guest side actually has members (an empty guest blob is nothing to carry);
 *   - clears the guest namespace afterwards, so a second sign-in on a shared browser cannot
 *     re-import a stranger's answers.
 */

/** The keys worth carrying: the plan and the metadata the hero reads. Nothing else. */
export const CLAIMABLE_KEYS = ["household", "assumptions", "features", "ui"] as const;

interface HouseholdLike {
  members?: unknown[];
}

/** Pure: should the guest plan be claimed into this account? */
export function shouldClaim(guest: HouseholdLike | null, server: HouseholdLike | null): boolean {
  const guestMembers = guest?.members?.length ?? 0;
  const serverMembers = server?.members?.length ?? 0;
  return guestMembers > 0 && serverMembers === 0;
}

/** An adapter that can flush its pending writes and report whether they landed. */
interface FlushableAdapter {
  flushAllPending(): Promise<void>;
}

function isFlushable(adapter: StorageAdapter): adapter is StorageAdapter & FlushableAdapter {
  return typeof (adapter as Partial<FlushableAdapter>).flushAllPending === "function";
}

/**
 * Optional hook the caller wires to the adapter's own failure signal (e.g. `ServerAdapter`'s
 * `onFlushError` constructor option). `flushAllPending()` never throws on a failed PUT — a failed
 * flush is deliberately re-queued, not surfaced as a rejection (`server-adapter.ts` flush()) — so
 * this is the only way `claimGuestPlan` can tell a flush actually failed vs. merely completed.
 */
export interface ClaimGuestPlanOptions {
  /** Returns true once ANY flush attempted during this claim has failed. */
  hasFlushFailed?: () => boolean;
}

/**
 * Copy the guest's plan into the authenticated adapter, once. Returns whether anything moved.
 * Never throws — a failed handoff must leave the user signed in with an empty plan they can refill,
 * not on a crashed boot screen.
 *
 * SAFETY (the ONLY copy of the guest's answers — MUST NOT be deleted early): `authedAdapter.set()`
 * on a `ServerAdapter` is a synchronous in-memory cache write with a DEBOUNCED (1500ms) PUT behind
 * it (`server-adapter.ts`) — the write is not actually on the server the instant `set()` returns. A
 * tab close, navigation, or failed flush inside that debounce window would leave the account still
 * empty on the server while `guest.clearForCurrentUser()` had already deleted the only surviving
 * copy — permanent silent data loss. So: when the adapter exposes `flushAllPending()` (ServerAdapter
 * does), it is AWAITED — and its resolution treated as confirmation the writes reached the server —
 * before the guest namespace is cleared. Adapters without a flush hook (LocalStorageAdapter, tests)
 * are synchronous already, so clearing immediately after `set()` is safe for them.
 */
export async function claimGuestPlan(
  authedAdapter: StorageAdapter,
  options: ClaimGuestPlanOptions = {},
): Promise<boolean> {
  try {
    const guest = new LocalStorageAdapter(ANON_USER_ID);
    const guestHousehold = guest.get<HouseholdLike>("household");
    const serverHousehold = authedAdapter.get<HouseholdLike>("household");
    if (!shouldClaim(guestHousehold, serverHousehold)) return false;

    for (const key of CLAIMABLE_KEYS) {
      const value = guest.get<unknown>(key);
      if (value !== null && value !== undefined) authedAdapter.set(key, value);
    }

    if (isFlushable(authedAdapter)) {
      // flushAllPending() itself NEVER rejects on a failed PUT — a failed flush is deliberately
      // re-queued on a backoff, not thrown (server-adapter.ts flush()) — so its resolution alone is
      // NOT confirmation the writes reached the server. `hasFlushFailed` (wired by the caller to the
      // adapter's onFlushError) is the only real signal; without it, we can only await the attempt.
      await authedAdapter.flushAllPending();
      if (options.hasFlushFailed?.()) {
        console.warn("[boot] guest plan handoff: server flush failed — guest namespace kept for retry");
        return false;
      }
    }

    guest.clearForCurrentUser();
    return true;
  } catch (err) {
    console.warn("[boot] guest plan handoff failed — the account starts empty", err);
    return false;
  }
}
