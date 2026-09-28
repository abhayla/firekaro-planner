/**
 * #187 — the PUBLIC route names: reachable with NO session at all.
 *
 * `/quick` is the shareable front door (a recipient of a shared link has no account) and
 * `/login` is where everyone else is sent. EVERY other route stays gated by the auth guard in
 * ./index.ts. Kept in its own module (no vue-router import) so the invariant spec
 * `router-auth-gate.spec.ts` can assert it without booting a `createWebHistory` router.
 */
export const PUBLIC_ROUTE_NAMES: ReadonlySet<string> = new Set(["login", "quick"]);

/** True when a signed-out visitor is allowed on this route name. */
export function isPublicRouteName(name: unknown): boolean {
  return PUBLIC_ROUTE_NAMES.has(String(name ?? ""));
}
