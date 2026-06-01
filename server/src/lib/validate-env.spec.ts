import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv } from "./validate-env";

/**
 * Boot-time env validation — security-critical. These tests pin the dev-bypass
 * footgun fix: the 3-factor bypass MUST require an EXPLICIT dev/test NODE_ENV,
 * so an unset NODE_ENV on the VPS (the documented misconfiguration) refuses to
 * boot rather than silently leaving the bypass live on real user data.
 */

const SAVED = { ...process.env };

function resetEnv() {
  for (const k of Object.keys(process.env)) delete process.env[k];
  // Minimum to pass the REQUIRED_VARS gate so we isolate the NODE_ENV logic.
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
  process.env.BETTER_AUTH_SECRET = "a-real-looking-secret-not-a-placeholder";
}

beforeEach(resetEnv);
afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, SAVED);
});

describe("validateEnv — required vars", () => {
  it("throws when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });

  it("throws when BETTER_AUTH_SECRET is missing", () => {
    delete process.env.BETTER_AUTH_SECRET;
    expect(() => validateEnv()).toThrow(/BETTER_AUTH_SECRET/);
  });
});

describe("validateEnv — dev-bypass / NODE_ENV footgun", () => {
  it("throws when DEV_BYPASS_AUTH=true and NODE_ENV is UNSET (the VPS footgun)", () => {
    delete process.env.NODE_ENV;
    process.env.DEV_BYPASS_AUTH = "true";
    expect(() => validateEnv()).toThrow(/DEV_BYPASS_AUTH/);
  });

  it("throws when DEV_BYPASS_AUTH=true and NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    process.env.DEV_BYPASS_AUTH = "true";
    // production also needs a non-placeholder secret + this throw; bypass throw wins.
    expect(() => validateEnv()).toThrow(/DEV_BYPASS_AUTH|production/);
  });

  it("allows DEV_BYPASS_AUTH=true when NODE_ENV=development", () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_BYPASS_AUTH = "true";
    expect(() => validateEnv()).not.toThrow();
  });

  it("allows DEV_BYPASS_AUTH=true when NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";
    process.env.DEV_BYPASS_AUTH = "true";
    expect(() => validateEnv()).not.toThrow();
  });

  it("does not throw on unset NODE_ENV when bypass is OFF", () => {
    delete process.env.NODE_ENV;
    delete process.env.DEV_BYPASS_AUTH;
    expect(() => validateEnv()).not.toThrow();
  });
});

describe("validateEnv — placeholder secret in production", () => {
  it("throws when BETTER_AUTH_SECRET is a known placeholder in production", () => {
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_SECRET = "changeme";
    expect(() => validateEnv()).toThrow(/placeholder/i);
  });
});
