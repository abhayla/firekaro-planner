import { describe, it, expect, vi } from "vitest";
import {
  fireNudge,
  triggerMilestone,
  triggerOffTrack,
  triggerWelcome,
} from "./whatsapp-triggers";
import type { SenderDeps } from "./whatsapp-sender";
import type { WatiSendResult } from "./wati-client";

/**
 * Lifecycle triggers — resolve the right approved template + build 1-indexed
 * params + delegate to the consent-gated sender. We stub the sender's `send`
 * dep (typed) and assert the templateName/params it receives.
 */

const target = { userId: "u1", toNumber: "917972672473", firstName: "Abhay" };

type SendInput = Parameters<SenderDeps["send"]>[0];

function captureDeps() {
  const send = vi.fn(
    async (_input: SendInput): Promise<WatiSendResult> => ({
      ok: true,
      status: 200,
      providerMessageId: "m1",
    }),
  );
  const deps: Partial<SenderDeps> = {
    getConsent: vi.fn(async () => ({ channel: "whatsapp" as const, marketingOptIn: true, revokedAt: null })),
    recentTimestamps: vi.fn(async () => []),
    recordSend: vi.fn(async () => ({ id: "log1" })),
    send,
    now: () => "2026-06-02T12:00:00.000Z",
    policy: { maxPerWindow: 99, windowHours: 24 },
  };
  return { deps, send };
}

describe("whatsapp-triggers", () => {
  it("milestone fires the milestone template with [name, amount, percent] (link is static)", async () => {
    const { deps, send } = captureDeps();
    await triggerMilestone(target, { amount: "1 Cr", percent: "25%" }, deps);
    const arg = send.mock.calls[0][0];
    expect(arg.templateName).toContain("milestone");
    expect((arg.parameters ?? []).map((p) => p.value)).toEqual(["Abhay", "1 Cr", "25%"]);
    expect((arg.parameters ?? []).map((p) => p.name)).toEqual(["1", "2", "3"]);
  });

  it("off-track fires with [name, year, driver]", async () => {
    const { deps, send } = captureDeps();
    await triggerOffTrack(target, { fireYear: "2043", driver: "higher expenses" }, deps);
    expect((send.mock.calls[0][0].parameters ?? []).map((p) => p.value)).toEqual([
      "Abhay",
      "2043",
      "higher expenses",
    ]);
  });

  it("welcome fires with no params (approved template has no variables)", async () => {
    const { deps, send } = captureDeps();
    await triggerWelcome(target, deps);
    expect(send.mock.calls[0][0].parameters ?? []).toEqual([]);
  });

  it("fireNudge resolves the template name from the catalog", async () => {
    const { deps, send } = captureDeps();
    await fireNudge("monthly_digest", target, ["Abhay", "1.8 Cr", "42%", "Aug 2041"], deps);
    expect(send.mock.calls[0][0].templateName).toContain("monthly_digest");
  });
});
