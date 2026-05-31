import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";
import { fileURLToPath, URL } from "node:url";

// FIREKaro v5 MVP — Vite config
// Port allocation (project-wide invariant per docs/goals/build-firekaro-mvp-v5.md §3 Stage A0):
//   5173 = production app (src/)
//   5174 = v4 demo (demo/)
//   5175 = v5 mvp (this build)

export default defineConfig({
  // Subpath base for GitHub Pages production builds (Phase 0 — docs/v6-fire-planner-product-plan.md §5).
  // CI sets DEPLOY_BASE=/FIREKaro-Vue/; local dev + default build stay at "/" (non-negotiable).
  base: process.env.DEPLOY_BASE ?? "/",
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
  },
  preview: {
    port: 5175,
  },
});
