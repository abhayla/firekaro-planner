import { defineConfig } from "@playwright/test";

/**
 * #187 step-2 config — TWO frontends against ONE backend:
 *   :5175 without the dev-bypass flag  => boots as a GUEST (401 at /me)
 *   :5176 with the dev-bypass flag     => boots as the SIGNED-IN dev user
 * Real sign-in is a same-origin session swap; two ports is how that is reproduced without an
 * interactive Google OAuth round trip. All servers are Playwright-managed.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/quick-signup-handoff.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 240_000,
  use: { headless: true, actionTimeout: 15000, navigationTimeout: 30000 },
  webServer: [
    {
      command: "npm run dev",
      cwd: "./server",
      url: "http://localhost:3100/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --port 5175 --strictPort",
      env: {
        VITE_USE_SERVER_ADAPTER: "on",
        VITE_API_BASE_URL: "http://localhost:3100",
        VITE_DEV_BYPASS: "",
      },
      url: "http://localhost:5175",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --port 5176 --strictPort",
      env: {
        VITE_USE_SERVER_ADAPTER: "on",
        VITE_API_BASE_URL: "http://localhost:3100",
        VITE_DEV_BYPASS: "true",
      },
      url: "http://localhost:5176",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
