import { defineConfig } from "@playwright/test";

/**
 * #187 core-proof config — server mode WITHOUT the dev-bypass header, so the frontend boots
 * genuinely unauthenticated (GET /api/planner/me -> 401) and exercises the guest path.
 * Both servers are Playwright-managed (never a detached background process).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/quick-public-core-proof.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 180_000,
  use: {
    baseURL: "http://localhost:5175",
    headless: true,
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  webServer: [
    {
      command: "npm run dev",
      cwd: "./server",
      url: "http://localhost:3100/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // VITE_DEV_BYPASS deliberately absent => no x-dev-bypass header => real 401 at boot.
      command: "npm run dev",
      env: { VITE_USE_SERVER_ADAPTER: "on", VITE_API_BASE_URL: "http://localhost:3100", VITE_DEV_BYPASS: "" },
      url: "http://localhost:5175",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
