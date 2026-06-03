import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "./prisma";
import { purgeSendLogPii } from "./comms-repo";

/**
 * Live-DB lock for the send-log PII purge (#10). GATED on a real DATABASE_URL
 * (auto-skips in CI / no-DB). The pure decision is unit-tested in
 * send-log-retention.spec.ts; this pins that the executor's updateMany WHERE
 * faithfully mirrors it — clears BOTH PII columns on >90d rows, RETAINS the row,
 * leaves fresh rows, and is idempotent. Uses a throwaway userId, cleaned up either
 * side so it never touches real send-log data.
 */
const RUN_LIVE =
  !!process.env.DATABASE_URL && !/placeholder|PASTE_/.test(process.env.DATABASE_URL);
const dlive = RUN_LIVE ? describe : describe.skip;

const TEST_USER = "test-purge-user-#10";
const DAY = 24 * 60 * 60 * 1000;

dlive("purgeSendLogPii (live DB — #10 DPDP retention)", () => {
  beforeAll(async () => {
    await prisma.whatsAppSendLog.deleteMany({ where: { userId: TEST_USER } });
  });
  afterAll(async () => {
    await prisma.whatsAppSendLog.deleteMany({ where: { userId: TEST_USER } });
  });

  it("clears BOTH PII fields on >90d rows, retains the row, leaves fresh rows, is idempotent", async () => {
    const now = new Date();
    const oldRow = await prisma.whatsAppSendLog.create({
      data: {
        userId: TEST_USER,
        toNumber: "917972672473",
        templateName: "lifecycle_welcome",
        category: "utility",
        status: "FAILED",
        failedDetail: "917972672473 is not a valid WhatsApp contact",
        sentAt: new Date(now.getTime() - 120 * DAY),
      },
    });
    const freshRow = await prisma.whatsAppSendLog.create({
      data: {
        userId: TEST_USER,
        toNumber: "917972672473",
        templateName: "lifecycle_welcome",
        category: "utility",
        status: "SENT",
        sentAt: new Date(now.getTime() - 10 * DAY),
      },
    });

    const purged = await purgeSendLogPii(now);
    expect(purged).toBeGreaterThanOrEqual(1);

    // Old row: BOTH PII fields cleared, but the row is RETAINED (analytics kept).
    const oldAfter = await prisma.whatsAppSendLog.findUnique({ where: { id: oldRow.id } });
    expect(oldAfter, "old row must be retained, not deleted").not.toBeNull();
    expect(oldAfter!.toNumber).toBe("");
    expect(oldAfter!.failedDetail).toBeNull();
    expect(oldAfter!.templateName).toBe("lifecycle_welcome"); // non-PII analytics preserved

    // Fresh row (within the window): untouched.
    const freshAfter = await prisma.whatsAppSendLog.findUnique({ where: { id: freshRow.id } });
    expect(freshAfter!.toNumber).toBe("917972672473");

    // Idempotent: a second purge leaves the already-cleared old row unchanged.
    await purgeSendLogPii(now);
    const oldAfter2 = await prisma.whatsAppSendLog.findUnique({ where: { id: oldRow.id } });
    expect(oldAfter2!.toNumber).toBe("");
    expect(oldAfter2!.failedDetail).toBeNull();
  });
});
