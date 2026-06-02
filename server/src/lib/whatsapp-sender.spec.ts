import { describe, it, expect, vi } from "vitest";
import { sendNudge, type SenderDeps } from "./whatsapp-sender";
import type { ConsentRecord } from "./comms-consent";
import type { WatiSendResult } from "./wati-client";

/**
 * Sender orchestration — pins WITHOUT DB/network: consent denial blocks the send
 * (and logs BLOCKED), an allowed send calls the adapter + logs SENT/FAILED with
 * the right status, and the frequency cap / marketing-opt-in gate is honoured.
 */

const NOW = "2026-06-02T12:00:00.000Z";
const consent = (over: Partial<ConsentRecord> = {}): ConsentRecord => ({
  channel: "whatsapp",
  marketingOptIn: true,
  revokedAt: null,
  ...over,
});

function deps(over: Partial<SenderDeps> = {}): SenderDeps {
  return {
    getConsent: vi.fn(async () => consent()),
    recentTimestamps: vi.fn(async () => []),
    send: vi.fn(async (): Promise<WatiSendResult> => ({ ok: true, status: 200, providerMessageId: "m1" })),
    recordSend: vi.fn(async () => ({ id: "log1" })),
    now: () => NOW,
    policy: { maxPerWindow: 3, windowHours: 24 },
    ...over,
  };
}

const input = {
  userId: "u1",
  toNumber: "917972672473",
  templateName: "firekaro_welcome",
  category: "utility" as const,
};

describe("sendNudge", () => {
  it("blocks + logs BLOCKED when there is no consent, and never calls the adapter", async () => {
    const d = deps({ getConsent: vi.fn(async () => null) });
    const r = await sendNudge(input, d);
    expect(r).toMatchObject({ sent: false, reason: "no-consent", logId: "log1" });
    expect(d.send).not.toHaveBeenCalled();
    expect(d.recordSend).toHaveBeenCalledWith(expect.objectContaining({ status: "BLOCKED" }));
  });

  it("blocks marketing without opt-in (adapter not called)", async () => {
    const d = deps({ getConsent: vi.fn(async () => consent({ marketingOptIn: false })) });
    const r = await sendNudge({ ...input, category: "marketing" }, d);
    expect(r).toMatchObject({ sent: false, reason: "no-marketing-consent" });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("blocks when the frequency cap is reached", async () => {
    const d = deps({
      recentTimestamps: vi.fn(async () => [
        "2026-06-02T11:00:00.000Z",
        "2026-06-02T10:00:00.000Z",
        "2026-06-02T09:00:00.000Z",
      ]),
    });
    const r = await sendNudge(input, d);
    expect(r).toMatchObject({ sent: false, reason: "frequency-cap" });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("sends + logs SENT (with providerMessageId) on success", async () => {
    const d = deps();
    const r = await sendNudge(input, d);
    expect(r).toMatchObject({ sent: true, reason: "sent", providerStatus: 200 });
    expect(d.send).toHaveBeenCalledWith(
      expect.objectContaining({ whatsappNumber: "917972672473", templateName: "firekaro_welcome" }),
    );
    expect(d.recordSend).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SENT", providerMessageId: "m1" }),
    );
  });

  it("logs FAILED with the adapter error when the send is rejected", async () => {
    const d = deps({
      send: vi.fn(async (): Promise<WatiSendResult> => ({ ok: false, status: 200, error: "131049 cap" })),
    });
    const r = await sendNudge(input, d);
    expect(r).toMatchObject({ sent: false, reason: "send-failed" });
    expect(d.recordSend).toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED", failedDetail: "131049 cap" }),
    );
  });
});
