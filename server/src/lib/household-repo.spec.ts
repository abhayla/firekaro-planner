/**
 * #223 round 3 — no-DB round-trip lock for `rowToMember`/`memberToRow` (household-repo.ts).
 *
 * The CRITICAL finding: `salary.hasEpf` had a column mapping added in round 3 but no test
 * proving it actually survives a save -> reload cycle through the row shape. Members have no
 * JSONB catch-all (unlike Investment's `subtypeData` sweep) — every salary field is its own
 * column, so a field missing from BOTH `rowToMember` and `memberToRow` is silently dropped on
 * the production persistence path with no error, no type failure, nothing — exactly the bug this
 * spec exists to catch before it ships again for a different field.
 *
 * Pure, no Prisma/DB import — `rowToMember`/`memberToRow` take/return plain objects.
 */
import { describe, it, expect } from "vitest";
import type { Member } from "@planner/types/household";
import { rowToMember, memberToRow } from "./household-repo";

function makeMember(over: Partial<Member> = {}): Member {
  return {
    id: "you",
    name: "You",
    dateOfBirth: "1988-01-01",
    role: "ADULT",
    city: "Metro",
    health: "Healthy",
    riskAppetite: "Moderate",
    marital: "Single",
    ...over,
  };
}

describe("household-repo — rowToMember / memberToRow round-trip (#223 salary.hasEpf)", () => {
  it("hasEpf: false survives memberToRow -> rowToMember", () => {
    const member = makeMember({ salary: { annualCTC: 30_00_000, hikePercent: 0, hasEpf: false } });
    const row = memberToRow(member, "user-1");
    expect(row.salaryHasEpf).toBe(false);

    const rebuilt = rowToMember({ ...row, entityId: row.entityId } as Parameters<typeof rowToMember>[0]);
    expect(rebuilt.salary?.hasEpf).toBe(false);
  });

  it("hasEpf: true survives the round-trip explicitly (not just via absence)", () => {
    const member = makeMember({ salary: { annualCTC: 30_00_000, hikePercent: 0, hasEpf: true } });
    const row = memberToRow(member, "user-1");
    expect(row.salaryHasEpf).toBe(true);

    const rebuilt = rowToMember(row as Parameters<typeof rowToMember>[0]);
    expect(rebuilt.salary?.hasEpf).toBe(true);
  });

  it("absent hasEpf persists as NULL, never coerced to false, and stays undefined on reload", () => {
    const member = makeMember({ salary: { annualCTC: 30_00_000, hikePercent: 0 } });
    const row = memberToRow(member, "user-1");
    expect(row.salaryHasEpf).toBeNull();

    const rebuilt = rowToMember(row as Parameters<typeof rowToMember>[0]);
    expect(rebuilt.salary?.hasEpf).toBeUndefined();
  });

  it("no salary at all round-trips with no salary object (unaffected by the new column)", () => {
    const member = makeMember();
    const row = memberToRow(member, "user-1");
    expect(row.salaryAnnualCTC).toBeNull();
    expect(row.salaryHasEpf).toBeNull();

    const rebuilt = rowToMember(row as Parameters<typeof rowToMember>[0]);
    expect(rebuilt.salary).toBeUndefined();
  });
});
