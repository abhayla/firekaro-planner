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

  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && PLACEHOLDER_SECRETS.includes(process.env.BETTER_AUTH_SECRET ?? "")) {
    throw new Error(
      "BETTER_AUTH_SECRET is a placeholder in production — generate a real one (openssl rand -base64 32)",
    );
  }

  // 3-factor dev-bypass MUST NOT be active in production (rules/dev-bypass-auth.md).
  if (isProduction && process.env.DEV_BYPASS_AUTH === "true") {
    throw new Error("DEV_BYPASS_AUTH=true is forbidden in production — refusing to boot.");
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
}
