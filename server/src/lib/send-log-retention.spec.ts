import { describe, it, expect } from "vitest";
import {
  shouldPurgeSendLogPii,
  retentionCutoff,
  SEND_LOG_RETENTION_DAYS,
} from "./send-log-retention";

// Pure retention-decision tests (#10) — no DB. The DB executor
// (comms-repo.purgeSendLogPii) mirrors `shouldPurgeSendLogPii` as one
// updateMany; its live behaviour is locked by the DATABASE_URL-gated case in
// comms-repo.integration.spec.ts.
const now = new Date("2026-06-03T00:00:00.000Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

describe("shouldPurgeSendLogPii (#10 DPDP retention)", () => {
  it("purges a row OLDER than the retention window that still carries a number", () => {
    expect(shouldPurgeSendLogPii({ sentAt: daysAgo(91), toNumber: "919999900001" }, now)).toBe(true);
  });

  it("leaves a row WITHIN the retention window untouched", () => {
    expect(shouldPurgeSendLogPii({ sentAt: daysAgo(89), toNumber: "919999900001" }, now)).toBe(false);
  });

  it("does NOT purge exactly at the boundary (90d is not yet older than 90d)", () => {
    expect(shouldPurgeSendLogPii({ sentAt: daysAgo(SEND_LOG_RETENTION_DAYS), toNumber: "x" }, now)).toBe(false);
  });

  it("purges an OLD already-toNumber-cleared row that STILL has PII in failedDetail", () => {
    // FAILED-send rows carry provider error text that can echo the recipient number.
    expect(
      shouldPurgeSendLogPii(
        { sentAt: daysAgo(120), toNumber: "", failedDetail: "919999900001 is not a valid WhatsApp contact" },
        now,
      ),
    ).toBe(true);
  });

  it("is a no-op once BOTH PII fields are cleared → re-run is safe / idempotent", () => {
    expect(shouldPurgeSendLogPii({ sentAt: daysAgo(365), toNumber: "", failedDetail: null }, now)).toBe(false);
  });

  it("retentionCutoff is exactly retentionDays before now", () => {
    expect(retentionCutoff(now).getTime()).toBe(now.getTime() - SEND_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  });
});
