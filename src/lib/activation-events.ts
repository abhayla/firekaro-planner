/**
 * #44 — the two CLIENT-side funnel counters. The other three are derived server-side
 * (server/src/lib/activation-triggers.ts) because only the server can tell a first /me from a
 * tenth, or a first write from a refresh.
 *
 * FIRE-AND-FORGET, ALWAYS. A counter must never delay, block, or break the screen it counts, so
 * every call here swallows its own failure. `keepalive` lets the POST survive the navigation that
 * often follows the event.
 */

export type ClientActivationEvent = "quick_opened" | "quick_completed";

function apiBase(): string {
  return import.meta.env.VITE_API_BASE_URL ?? "";
}

/** True when the app is talking to a real backend at all (the demo path has nowhere to POST). */
export function countersEnabled(): boolean {
  return (
    import.meta.env.VITE_USE_SERVER_ADAPTER === "on" ||
    import.meta.env.VITE_USE_SERVER_ADAPTER === "true"
  );
}

/** Build the POST body. Exported so the shape is testable without a network. */
export function eventBody(event: ClientActivationEvent, anonId: string): { event: string; anonId: string } {
  return { event, anonId };
}

/**
 * Report one funnel event. Never throws, never awaits anything the caller cares about — the
 * returned promise resolves to whether the POST was accepted, for tests only.
 */
export async function reportActivationEvent(
  event: ClientActivationEvent,
  anonId: string,
): Promise<boolean> {
  if (!countersEnabled() || !anonId) return false;
  try {
    const res = await fetch(`${apiBase()}/api/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify(eventBody(event, anonId)),
    });
    return res.ok;
  } catch {
    // A dropped counter is invisible to the user by design; it must stay that way.
    return false;
  }
}
