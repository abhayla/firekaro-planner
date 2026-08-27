import { defineConfig } from "@playwright/test";

// SCRATCH config for T-378F fix-round item 5 (server-mode rule-25 proof) — not committed to
// long-term regression. Starts BOTH the backend (Hono/Prisma -> Supabase) and the frontend
// (with VITE_USE_SERVER_ADAPTER=on) as Playwright-managed webServers so the whole run stays
// foreground and supervised, per the HARD GUARD (never a detached background process).
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/t378-server-mode-verify.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
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
      timeout: 60000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:5175",
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
