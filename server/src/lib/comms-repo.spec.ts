import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// Mock ONLY the Prisma client seam (`./prisma`) — recordSend's own P2002-race logic and
// the real `Prisma.PrismaClientKnownRequestError` (from @prisma/client, NOT mocked) stay
// live, so the `instanceof` guard is exercised for real. gh-issue #10 DB-atomic dedup backstop.
const { create, findFirst } = vi.hoisted(() => ({ create: vi.fn(), findFirst: vi.fn() }));
vi.mock("./prisma", () => ({
  prisma: { whatsAppSendLog: { create, findFirst } },
}));
// Silence the structured-logger warning on the race path (keeps test output clean).
vi.mock("./logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { recordSend, type RecordSendInput } from "./comms-repo";

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError("duplicate key", { code: "P2002", clientVersion: "test" });

const input = (over: Partial<RecordSendInput> = {}): RecordSendInput => ({
  userId: "u1",
  toNumber: "919999900001",
  templateName: "welcome",
  category: "utility",
  status: "SENT",
  dedupeKey: "welcome",
  ...over,
});

describe("recordSend — gh-issue #10 DB-atomic dedup backstop (partial-unique race)", () => {
  beforeEach(() => {
    create.mockReset();
    findFirst.mockReset();
  });

  it("a normal insert returns the new row id", async () => {
    create.mockResolvedValue({ id: "new-row" });
    expect(await recordSend(input())).toEqual({ id: "new-row" });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("P2002 race on a DEDUPED send ⇒ suppressed (no throw), returns the WINNING row's id", async () => {
    // A concurrent run already wrote this (userId, dedupeKey) non-blocked row; the partial
    // unique index rejects our duplicate. That is the dedup working — not an error.
    create.mockRejectedValue(p2002());
    findFirst.mockResolvedValue({ id: "winner" });
    expect(await recordSend(input())).toEqual({ id: "winner" });
    // Looks up the winner scoped to non-BLOCKED rows (BLOCKED rows are exempt from the index).
    expect(findFirst).toHaveBeenCalledOnce();
    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      userId: "u1",
      dedupeKey: "welcome",
      status: { not: "BLOCKED" },
    });
  });

  it("P2002 but NO surviving non-blocked row ⇒ RETHROWS (never swallow a genuine failure)", async () => {
    create.mockRejectedValue(p2002());
    findFirst.mockResolvedValue(null);
    await expect(recordSend(input())).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("P2002 on an AD-HOC send (dedupeKey null) ⇒ RETHROWS — ad-hoc sends may repeat, never suppressed", async () => {
    create.mockRejectedValue(p2002());
    await expect(recordSend(input({ dedupeKey: null }))).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    expect(findFirst).not.toHaveBeenCalled(); // the `&& input.dedupeKey` guard short-circuits
  });

  it("a non-P2002 error is rethrown unchanged (not mistaken for a dedup race)", async () => {
    create.mockRejectedValue(new Error("db connection lost"));
    await expect(recordSend(input())).rejects.toThrow("db connection lost");
    expect(findFirst).not.toHaveBeenCalled();
  });
});
