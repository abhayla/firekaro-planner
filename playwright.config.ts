import { defineConfig, devices } from "@playwright/test";

// Verification runs use a HEADED + maximized browser so Abhay can watch
// live. See feedback_full_screen_headed_verification.md memory entry.
// CI still uses headless via the explicit env flag if it sets CI=1.

export default defineConfig({
  testDir: "./e2e",
  // Scratch verification specs (per-task PR evidence) are NOT regression tests: they mint a new
  // timestamped verification-screenshots/ dir on every run and assert against one task's state.
  // Opt in with RUN_SCRATCH_VERIFY=1 (a bare path argument cannot override testIgnore).
  testIgnore: process.env.RUN_SCRATCH_VERIFY === "1" ? [] : ["**/t3??-*-verify.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5175",
    headless: !!process.env.CI,
    actionTimeout: 10000,
    navigationTimeout: 20000,
    trace: "retain-on-failure",
    // viewport null lets the browser use the actual maximized window size
    // (otherwise Playwright shrinks to 1280×720 even when headed).
    viewport: null,
  },
  projects: [
    {
      name: "chromium",
      use: {
        // NOTE: NOT spreading devices["Desktop Chrome"] — it forces a 1280x720
        // viewport + deviceScaleFactor that conflicts with `viewport: null`.
        // We want the actual maximized window size in headed mode.
        browserName: "chromium",
        viewport: null,
        launchOptions: {
          args: process.env.CI ? [] : ["--start-maximized"],
          slowMo: process.env.CI ? 0 : 100,
        },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5175",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
