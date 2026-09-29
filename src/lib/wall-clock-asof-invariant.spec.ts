import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * #198 grep-lock — every "today" / "member age" read routes through `src/lib/as-of-date.ts`,
 * never a fresh `new Date()` (UTC-sliced) or a bare one-argument `ageFromDOB(dob)` (wall clock,
 * silently disagreeing with whatever `asOfDate` the kernel is pinned to elsewhere). This is the
 * mechanical guarantee that the eight sites (+ the three display call sites + the tax-deductions
 * senior-citizen check) fixed under #198 can never silently regress back onto the wall clock —
 * the exact way the #176 age-drift bug was reintroduced piecemeal before this fix.
 */
const SRC = join(process.cwd(), "src");
const ALLOWED_FILES = new Set(["as-of-date.ts", "age.ts"]);

// #198: the UTC-date-slice pattern. EstatePlanning.vue's two "completed on" timestamp writes are
// NOT an age/asOfDate concern (they stamp when a checklist item was ticked, never read back into
// age math) — allow-listed by filename so this lock stays scoped to the actual class.
const UTC_SLICE = /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/;
const ALLOWED_UTC_SLICE_FILES = new Set(["EstatePlanning.vue"]);

// A bare one-arg ageFromDOB(x) call — the wall-clock-default shape #198 fixes. Two-arg calls
// (ageFromDOB(dob, pinnedAsOf)) are the correct, already-pinned kernel-internal usage and are
// unaffected by this lock (excluded by requiring no comma inside the parens).
const BARE_AGE_FROM_DOB = /ageFromDOB\(\s*[^,()]+\s*\)/;
const ALLOWED_BARE_AGE_FILES = new Set(["age.ts", "as-of-date.ts"]);

/** Strip `//` line comments and `/* … *\/` block comments so prose mentioning the old call shape
 * (e.g. "used to call `ageFromDOB(dob)`") never trips the lock — only real code does. */
function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

/**
 * Extract the full argument-list text of every `deriveDeductions(...)` call in `content`, by
 * scanning for balanced parens from each call site — a single-line regex can't handle the
 * multi-line calls (`derive.ts`, `individual-fire.ts`, `tax-planning/Index.vue` all wrap the
 * object-literal argument across several lines).
 */
function deriveDeductionsCallArgs(content: string): string[] {
  const calls: string[] = [];
  const callSite = /deriveDeductions\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = callSite.exec(content)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < content.length && depth > 0) {
      if (content[i] === "(") depth++;
      else if (content[i] === ")") depth--;
      i++;
    }
    calls.push(content.slice(start, i - 1));
  }
  return calls;
}

const DEFINITION_FILES = new Set(["tax-deductions.ts"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...sourceFiles(p));
    } else if (/\.(ts|vue)$/.test(entry) && !entry.endsWith(".spec.ts")) {
      out.push(p);
    }
  }
  return out;
}

describe("#198 — wall-clock asOfDate invariant (grep-lock)", () => {
  it("has zero new Date().toISOString().slice(0, 10) UTC-date reads outside the allow-list", () => {
    const files = sourceFiles(SRC);
    const violations: string[] = [];
    for (const file of files) {
      const name = file.split(/[\\/]/).pop()!;
      if (name === "as-of-date.ts") continue; // documents the old pattern in its own doc-comment
      if (ALLOWED_UTC_SLICE_FILES.has(name)) continue;
      const content = stripComments(readFileSync(file, "utf-8"));
      if (UTC_SLICE.test(content)) violations.push(file);
    }
    expect(violations).toEqual([]);
  });

  it("has zero bare one-argument ageFromDOB(dob) calls outside age.ts/as-of-date.ts", () => {
    const files = sourceFiles(SRC);
    const violations: string[] = [];
    for (const file of files) {
      const name = file.split(/[\\/]/).pop()!;
      if (ALLOWED_FILES.has(name) || ALLOWED_BARE_AGE_FILES.has(name)) continue;
      const content = stripComments(readFileSync(file, "utf-8"));
      if (BARE_AGE_FROM_DOB.test(content)) violations.push(file);
    }
    expect(violations).toEqual([]);
  });

  it("has zero deriveDeductions(...) calls whose argument list omits asOfDate", () => {
    const files = sourceFiles(SRC);
    const violations: string[] = [];
    for (const file of files) {
      const name = file.split(/[\\/]/).pop()!;
      if (DEFINITION_FILES.has(name)) continue; // the function's own definition/signature
      const content = stripComments(readFileSync(file, "utf-8"));
      for (const args of deriveDeductionsCallArgs(content)) {
        if (!/asOfDate/.test(args)) violations.push(`${file} :: deriveDeductions(${args.trim().slice(0, 60)}...)`);
      }
    }
    expect(violations).toEqual([]);
  });
});
