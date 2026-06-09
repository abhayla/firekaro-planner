import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Regression lock for gh #72 — the Financial Health section was mislabeled "Health" with a
// heart icon (mdi-heart-pulse), which reads as medical, not financial (collides with the
// member Health field + Health insurance). Source-scan lock (same pattern as
// storage-invariant.spec.ts) since both nav lists are static literals.

const sidebar = readFileSync(resolve(__dirname, "./SidebarNav.vue"), "utf8");
const cmdk = readFileSync(resolve(__dirname, "../lib/cmdk-registry.ts"), "utf8");

describe("gh #72 — Financial Health section label + icon", () => {
  it("sidebar labels the section 'Financial Health', not the ambiguous 'Health'", () => {
    expect(sidebar).toContain('title: "Financial Health"');
    expect(sidebar).not.toContain('title: "Health"');
  });

  it("sidebar does not use a medical heart icon for the financial-health section", () => {
    expect(sidebar).not.toContain("mdi-heart-pulse");
  });

  it("command palette labels the financial-health entries 'Financial Health — …', not 'Health — …'", () => {
    expect(cmdk).not.toContain('label: "Health —');
    expect(cmdk).toContain('label: "Financial Health —');
  });

  it("command palette does not use a medical heart icon for the financial-health entries", () => {
    expect(cmdk).not.toContain("mdi-heart-pulse");
  });
});
