/**
 * Auth provider — the abstraction over user identity.
 *
 * Phase 0 Stage A5 per docs/goals/build-firekaro-mvp-v5.md §3 (ADR-0001).
 *
 * v5 runtime ships LocalAuthProvider: returns 'self' for everything,
 * isAuthenticated() always true. The point is the SHAPE of the API —
 * v6 SaaS swaps this for a Better-Auth backed provider (or similar) and
 * downstream code keeps using `auth.getCurrentUserId()` unchanged.
 *
 * Multi-tenant invariant (ADR-0001): every persisted entity is owned by
 * `userId`. The userId returned here is the single source of truth that
 * downstream stores + storage-adapter use to scope reads and writes.
 */

export interface AuthProvider {
  /** Current user's stable id. v5 returns 'self'; v6 returns the real id. */
  getCurrentUserId(): string;

  /** True when the user has a valid session. v5 always true. */
  isAuthenticated(): boolean;
}

export class LocalAuthProvider implements AuthProvider {
  getCurrentUserId(): string {
    return "self";
  }

  isAuthenticated(): boolean {
    return true;
  }
}

/**
 * v6 SaaS provider — holds the Better-Auth session-resolved userId. Installed by
 * the boot sequence (main.ts) via setAuthProvider() after GET /api/planner/me
 * resolves the session, so every persisted entity is keyed by the real userId.
 * getCurrentUserId() stays synchronous (the contract the stores depend on).
 */
export class ServerAuthProvider implements AuthProvider {
  constructor(private readonly userId: string) {}

  getCurrentUserId(): string {
    return this.userId;
  }

  isAuthenticated(): boolean {
    return true;
  }
}

/**
 * v6 SaaS — server mode but NO valid session. Installed by main.ts when
 * GET /api/planner/me returns 401, so the router's auth guard bounces to /login.
 * getCurrentUserId() fails fast (it must never be reached — the guard redirects
 * before any store hydrates). In demo/localStorage mode this is never installed,
 * so LocalAuthProvider keeps isAuthenticated()===true and the demo flow is unchanged.
 */
export class UnauthenticatedAuthProvider implements AuthProvider {
  // Returns an empty sentinel rather than throwing: the Pinia stores instantiate
  // eagerly at mount and call getCurrentUserId() BEFORE the router's auth guard can
  // redirect to /login. Throwing crashes App setup and aborts the navigation. The
  // empty id is never used for real reads/writes — the guard sends every non-login
  // route to /login, and Login.vue touches no store.
  getCurrentUserId(): string {
    return "";
  }

  isAuthenticated(): boolean {
    return false;
  }
}

/**
 * Singleton — every consumer imports this. Replaced with a real provider
 * in v6 SaaS by swapping this one export.
 *
 * Held as a `let` mutable binding to support tests that need to inject a
 * mock provider via setAuthProvider().
 */
let currentProvider: AuthProvider = new LocalAuthProvider();

export function getAuthProvider(): AuthProvider {
  return currentProvider;
}

/**
 * Test-only: replace the provider singleton. Used by integration tests
 * that exercise multi-user namespacing without standing up a real auth
 * backend. Production code MUST NOT call this — v6 will replace
 * LocalAuthProvider via the production module's own factory.
 */
export function setAuthProvider(p: AuthProvider): void {
  currentProvider = p;
}
