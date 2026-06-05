import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

// Local run override: reuse the already-running dev server + force headless so
// the sweep runs without a display. Does NOT touch the committed config.
export default defineConfig({
  ...base,
  use: { ...base.use, headless: true },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 }, headless: true },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5175",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
