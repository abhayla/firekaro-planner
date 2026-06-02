import { describe, it, expect, vi } from "vitest";
import { onUserCreated, type SignupDeps } from "./comms-signup";

/**
 * Signup side-effects — seeds consent + syncs a Zoho lead, and is fail-safe:
 * a failure in either step is logged but NEVER throws (signup must not break).
 */

const user = { id: "u1", email: "a@b.com", name: "Abhay Kumar" };

function deps(over: Partial<SignupDeps> = {}): SignupDeps {
  return {
    createDefaultConsent: vi.fn(async () => {}),
    syncLead: vi.fn(async () => ({ ok: true })),
    ...over,
  };
}

describe("onUserCreated", () => {
  it("seeds default consent and syncs the lead", async () => {
    const d = deps();
    await onUserCreated(user, d);
    expect(d.createDefaultConsent).toHaveBeenCalledWith("u1");
    expect(d.syncLead).toHaveBeenCalledWith(user);
  });

  it("does NOT throw and STILL syncs the lead when consent seeding fails", async () => {
    const syncLead = vi.fn(async () => ({ ok: true }));
    const d = deps({
      createDefaultConsent: vi.fn(async () => {
        throw new Error("db down");
      }),
      syncLead,
    });
    await expect(onUserCreated(user, d)).resolves.toBeUndefined();
    expect(syncLead).toHaveBeenCalled();
  });

  it("does NOT throw when the Zoho sync fails", async () => {
    const d = deps({
      syncLead: vi.fn(async () => {
        throw new Error("zoho 500");
      }),
    });
    await expect(onUserCreated(user, d)).resolves.toBeUndefined();
  });
});
