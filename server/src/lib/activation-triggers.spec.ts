import { describe, it, expect } from "vitest";
import {
  decideOnce,
  isReturnedAfter7d,
  isDataRefresh,
  onAuthenticatedMe,
  onPlannerDocumentWrite,
  RETURN_WINDOW_MS,
  SERVER_ANON_ID,
} from "./activation-triggers";

/**
 * #44 — the three server-derived funnel events. The pure predicates are tested directly; the two
 * orchestrators are tested against a fake prisma so the DECISIONS (once-only, the 7-day boundary,
 * first-write-is-not-a-refresh, never-throw) are pinned without a database.
 */

function fakePrisma(opts: {
  userCreatedAt?: Date | null;
  existingEvents?: string[];
  uiRow?: { createdAt: Date; updatedAt: Date } | null;
  memberCount?: number;
  throwOn?: string;
}) {
  const created: { event: string; userId: string | null; anonId: string }[] = [];
  const existing = new Set(opts.existingEvents ?? []);
  return {
    created,
    client: {
      user: {
        findUnique: async () =>
          opts.userCreatedAt === null ? null : { createdAt: opts.userCreatedAt ?? new Date() },
      },
      activationEvent: {
        findFirst: async ({ where }: { where: { event: string } }) => {
          if (opts.throwOn === "findFirst") throw new Error("db down");
          return existing.has(where.event) ? { id: "x" } : null;
        },
        create: async ({ data }: { data: { event: string; userId: string | null; anonId: string } }) => {
          created.push(data);
          existing.add(data.event);
          return data;
        },
      },
      userUiPrefs: { findUnique: async () => opts.uiRow ?? null },
      member: { count: async () => opts.memberCount ?? 0 },
    } as never,
  };
}

describe("#44 pure predicates", () => {
  it("decideOnce fires only when nothing was recorded", () => {
    expect(decideOnce(false)).toBe(true);
    expect(decideOnce(true)).toBe(false);
  });

  it("isReturnedAfter7d is false at 6d23h and true at exactly 7d", () => {
    const created = new Date("2026-09-01T00:00:00Z");
    expect(isReturnedAfter7d(created, new Date(created.getTime() + RETURN_WINDOW_MS - 1))).toBe(false);
    expect(isReturnedAfter7d(created, new Date(created.getTime() + RETURN_WINDOW_MS))).toBe(true);
    expect(isReturnedAfter7d(created, new Date(created.getTime() + 30 * RETURN_WINDOW_MS))).toBe(true);
  });

  it("isDataRefresh treats the FIRST write as setup, not a refresh", () => {
    expect(isDataRefresh(0)).toBe(false);
    expect(isDataRefresh(1)).toBe(true);
    expect(isDataRefresh(5)).toBe(true);
  });
});

describe("#44 onAuthenticatedMe", () => {
  it("records signed_up once on a brand-new account and NOT returned_7d", async () => {
    const f = fakePrisma({ userCreatedAt: new Date() });
    const out = await onAuthenticatedMe(f.client, "u1");
    expect(out).toEqual({ signedUp: true, returned7d: false });
    expect(f.created.map((r) => r.event)).toEqual(["signed_up"]);
    expect(f.created[0]!.anonId).toBe(SERVER_ANON_ID);
    expect(f.created[0]!.userId).toBe("u1");
  });

  it("is idempotent — a second /me records nothing", async () => {
    const f = fakePrisma({ userCreatedAt: new Date(), existingEvents: ["signed_up"] });
    const out = await onAuthenticatedMe(f.client, "u1");
    expect(out).toEqual({ signedUp: false, returned7d: false });
    expect(f.created).toEqual([]);
  });

  it("records returned_7d once, 7+ days after the account was created", async () => {
    const created = new Date("2026-09-01T00:00:00Z");
    const f = fakePrisma({ userCreatedAt: created, existingEvents: ["signed_up"] });
    const out = await onAuthenticatedMe(f.client, "u1", new Date("2026-09-10T00:00:00Z"));
    expect(out).toEqual({ signedUp: false, returned7d: true });
    expect(f.created.map((r) => r.event)).toEqual(["returned_7d"]);

    const again = await onAuthenticatedMe(f.client, "u1", new Date("2026-09-20T00:00:00Z"));
    expect(again.returned7d).toBe(false);
  });

  it("never throws when the DB is unreachable", async () => {
    const f = fakePrisma({ userCreatedAt: new Date(), throwOn: "findFirst" });
    await expect(onAuthenticatedMe(f.client, "u1")).resolves.toEqual({
      signedUp: false,
      returned7d: false,
    });
  });

  it("records nothing for a userId with no user row", async () => {
    const f = fakePrisma({ userCreatedAt: null });
    expect(await onAuthenticatedMe(f.client, "ghost")).toEqual({ signedUp: false, returned7d: false });
    expect(f.created).toEqual([]);
  });
});

describe("#44 onPlannerDocumentWrite", () => {
  const t0 = new Date("2026-09-01T00:00:00Z");

  it("does NOT fire on the account's very first write (no prior rows)", async () => {
    const f = fakePrisma({ uiRow: { createdAt: t0, updatedAt: t0 }, memberCount: 0 });
    expect(await onPlannerDocumentWrite(f.client, "u1")).toEqual({ dataRefreshed: false });
    expect(f.created).toEqual([]);
  });

  it("fires when the ui document has been written more than once", async () => {
    const f = fakePrisma({
      uiRow: { createdAt: t0, updatedAt: new Date(t0.getTime() + 1000) },
      memberCount: 0,
    });
    expect(await onPlannerDocumentWrite(f.client, "u1")).toEqual({ dataRefreshed: true });
    expect(f.created.map((r) => r.event)).toEqual(["data_refreshed"]);
  });

  it("fires when the household already has rows from an earlier request", async () => {
    const f = fakePrisma({ uiRow: null, memberCount: 3 });
    expect(await onPlannerDocumentWrite(f.client, "u1")).toEqual({ dataRefreshed: true });
  });

  it("is idempotent — once recorded it never fires again", async () => {
    const f = fakePrisma({ existingEvents: ["data_refreshed"], memberCount: 9 });
    expect(await onPlannerDocumentWrite(f.client, "u1")).toEqual({ dataRefreshed: false });
    expect(f.created).toEqual([]);
  });

  it("never throws when the DB is unreachable", async () => {
    const f = fakePrisma({ throwOn: "findFirst", memberCount: 9 });
    await expect(onPlannerDocumentWrite(f.client, "u1")).resolves.toEqual({ dataRefreshed: false });
  });
});
