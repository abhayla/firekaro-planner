import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

// Headed override: watchable interactive sweep on the real desktop (run via the
// PowerShell tool so it lands on a visible display). Reuses the running :5175.
// Not committed product config — a local verification harness.
export default defineConfig({
  ...base,
  use: { ...base.use, headless: false },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        viewport: null,
        headless: false,
        launchOptions: { args: ["--start-maximized"] },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5175",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
