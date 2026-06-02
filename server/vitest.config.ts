import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig paths — lets the diff engine + route validators
      // import the planner's Zod schemas from mvp/src/types without copying.
      "@planner": fileURLToPath(new URL("../src", import.meta.url)),
      // The lifecycle runner reuses the planner's pure derive() kernel (src/lib),
      // whose internal imports use the "@/" alias — resolve it to ../src too so the
      // shared math is reused, not duplicated (D4). "@" only matches "@/…", never
      // "@planner/…", so there is no collision with the alias above.
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    globals: false,
  },
});
