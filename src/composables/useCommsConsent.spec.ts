import { describe, it, expect, vi, afterEach } from "vitest";
import { useCommsConsent } from "./useCommsConsent";

// gh-issue #28: the comms-consent fetch fired even in demo mode (LocalStorageAdapter, no backend),
// producing ERR_CONNECTION_REFUSED console noise on /preferences. It must be gated on server-adapter
// mode — skip the fetch entirely in demo.
describe("useCommsConsent — demo-mode gating (gh-issue #28)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does NOT fetch /api/comms/consent in demo mode (no server adapter)", async () => {
    vi.stubEnv("VITE_USE_SERVER_ADAPTER", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const c = useCommsConsent();
    await c.load();
    await c.save();
    expect(fetchSpy).not.toHaveBeenCalled();
    // demo mode is not an error state — it's "no backend here", so error stays clear
    expect(c.error.value).toBeNull();
  });

  it("DOES fetch when the server adapter is on", async () => {
    vi.stubEnv("VITE_USE_SERVER_ADAPTER", "on");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const c = useCommsConsent();
    await c.load();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/comms/consent"),
      expect.anything(),
    );
  });
});
