import { logger } from "./logger";

/**
 * Boot-time env validation — copy-adapted from the root app's
 * server/lib/validate-env.ts. Fails fast on missing required vars; warns on
 * prod-only soft requirements. Logs variable NAMES only, never values.
 */
const REQUIRED_VARS = ["DATABASE_URL", "BETTER_AUTH_SECRET"] as const;

const PLACEHOLDER_SECRETS = [
  "CHANGE_ME_generate_with_openssl_rand_base64_32",
  "local-dev-only-not-a-real-secret-aaaaaaaaaaaa",
  "changeme",
  "replace-me",
  "your-secret-here",
];

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const nodeEnv = process.env.NODE_ENV;
  const isProduction = nodeEnv === "production";

  if (isProduction && PLACEHOLDER_SECRETS.includes(process.env.BETTER_AUTH_SECRET ?? "")) {
    throw new Error(
      "BETTER_AUTH_SECRET is a placeholder in production — generate a real one (openssl rand -base64 32)",
    );
  }

  // The 3-factor dev-bypass (rules/dev-bypass-auth.md) MUST require an EXPLICIT
  // dev/test NODE_ENV. Riding on `!== 'production'` alone is a deploy footgun:
  // an unset NODE_ENV on the VPS would leave the bypass live on real user data.
  // Refuse to boot whenever the bypass is opted in but NODE_ENV is not an
  // explicit "development" or "test" — this covers production AND unset.
  if (process.env.DEV_BYPASS_AUTH === "true" && nodeEnv !== "development" && nodeEnv !== "test") {
    throw new Error(
      `DEV_BYPASS_AUTH=true requires NODE_ENV to be explicitly "development" or "test" ` +
        `(got: ${nodeEnv ? `"${nodeEnv}"` : "unset"}) — refusing to boot.`,
    );
  }

  if (isProduction && !process.env.ALLOWED_ORIGINS) {
    logger.warn("ALLOWED_ORIGINS not set — CORS will fall back to localhost origins");
  }
  if (isProduction && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)) {
    logger.warn("Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  }
  if (isProduction && !process.env.BETTER_AUTH_URL) {
    logger.warn("BETTER_AUTH_URL not set — Google OAuth callback URLs will be incorrect");
  }
  if (isProduction && !process.env.LIFECYCLE_RUN_TOKEN) {
    logger.warn(
      "LIFECYCLE_RUN_TOKEN not set — POST /api/internal/lifecycle/run will return 500 (scheduler disabled)",
    );
  }
  if (isProduction && !process.env.SMOKE_TOKEN) {
    logger.warn(
      "SMOKE_TOKEN not set — GET /api/internal/smoke will return 500 (post-deploy smoke disabled)",
    );
  }
  if (isProduction && (!process.env.NOTIFIER_URL || !process.env.NOTIFIER_KEY)) {
    logger.warn(
      "NOTIFIER_URL / NOTIFIER_KEY not set — owner alerts (signup, 5xx, DB-down) are disabled (notifyOwner is a no-op)",
    );
  }
}
