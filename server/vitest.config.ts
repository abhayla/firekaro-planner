import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig paths — lets the diff engine + route validators
      // import the planner's Zod schemas from mvp/src/types without copying.
      "@planner": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
  },
});
