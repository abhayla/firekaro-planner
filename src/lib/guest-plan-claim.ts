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

/**
 * Copy the guest's plan into the authenticated adapter, once. Returns whether anything moved.
 * Never throws — a failed handoff must leave the user signed in with an empty plan they can refill,
 * not on a crashed boot screen.
 */
export function claimGuestPlan(authedAdapter: StorageAdapter): boolean {
  try {
    const guest = new LocalStorageAdapter(ANON_USER_ID);
    const guestHousehold = guest.get<HouseholdLike>("household");
    const serverHousehold = authedAdapter.get<HouseholdLike>("household");
    if (!shouldClaim(guestHousehold, serverHousehold)) return false;

    for (const key of CLAIMABLE_KEYS) {
      const value = guest.get<unknown>(key);
      if (value !== null && value !== undefined) authedAdapter.set(key, value);
    }
    guest.clearForCurrentUser();
    return true;
  } catch (err) {
    console.warn("[boot] guest plan handoff failed — the account starts empty", err);
    return false;
  }
}
