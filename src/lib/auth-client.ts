import { createAuthClient } from "better-auth/vue";

/**
 * Frontend Better Auth client (v6 login UI). Points at the backend origin where
 * `/api/auth/*` is mounted (`server/src/index.ts`) — a DIFFERENT origin than the
 * SPA in dev (5175 vs 3100), so `baseURL` is explicit and the social-sign-in
 * redirect + session-cookie round-trip rely on CORS `credentials` +
 * Better Auth `trustedOrigins` (`server/src/lib/auth.ts`).
 *
 * Pairs with the boot seam in `main.ts`: after Google sign-in completes and the
 * session cookie is set, the SPA reloads, `GET /api/planner/me` resolves the real
 * userId, and `ServerAuthProvider` is installed. This client is only the
 * sign-in / sign-out trigger; identity still flows through the auth-provider seam.
 */
const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3100";

export const authClient = createAuthClient({ baseURL });

export const { signIn, signOut, useSession } = authClient;
