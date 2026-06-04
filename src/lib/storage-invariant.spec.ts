import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Storage invariant guard (ADR-0001, CLAUDE.md "Storage invariant — CI-enforced").
 *
 * ALL persistence MUST route through the storage adapter (`storage-adapter.ts`) so the
 * localStorage demo and the Supabase ServerAdapter are the same frontend with a swapped adapter.
 * The invariant — "zero direct localStorage.* calls anywhere in src/ outside storage-adapter.ts" —
 * was documented as CI-enforced but had NO actual gate (no eslint rule, no CI lint step). This
 * scan-test is that gate, run by `npm run test:unit` (B5: a targeted guard, not a whole frontend
 * ESLint setup, is the proportionate machine-enforcement for a single invariant — YAGNI).
 */
const SRC = join(process.cwd(), "src");
// The ONE module allowed to touch localStorage directly — it IS the adapter.
const ALLOWED_FILES = new Set(["storage-adapter.ts"]);
// Real method calls (with the opening paren), so a comment merely naming localStorage doesn't trip it.
const DIRECT_CALL = /localStorage\s*\.\s*(getItem|setItem|removeItem|clear|key)\s*\(/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...sourceFiles(p));
    } else if (
      /\.(ts|vue)$/.test(entry) &&
      !entry.endsWith(".spec.ts") &&
      !ALLOWED_FILES.has(entry)
    ) {
      out.push(p);
    }
  }
  return out;
}

describe("storage invariant — no direct localStorage outside storage-adapter.ts (ADR-0001)", () => {
  it("has zero direct localStorage.* calls in src/ (all persistence routes through the adapter)", () => {
    const files = sourceFiles(SRC);
    const offenders = files
      .filter((f) => DIRECT_CALL.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SRC.length + 1).replace(/\\/g, "/"));
    expect(
      offenders,
      `Direct localStorage.* found — route it through storage-adapter.ts (ADR-0001):\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
    // Non-vacuous guard: the scan must actually cover the source tree (else a path/glob bug would
    // make this pass while enforcing nothing — the shape-vs-substance trap).
    expect(files.length, "the scan must cover a meaningful src/ tree").toBeGreaterThan(100);
  });

  it("the DIRECT_CALL regex genuinely matches a real localStorage call (proves the scan isn't a no-op)", () => {
    // storage-adapter.ts is the ONE allowed file precisely because it DOES call localStorage — so it
    // is the perfect positive fixture: the regex MUST match it, confirming the scan would catch a leak.
    const adapter = readFileSync(join(SRC, "lib", "storage-adapter.ts"), "utf8");
    expect(DIRECT_CALL.test(adapter), "storage-adapter.ts should contain a real localStorage call").toBe(
      true,
    );
  });
});
