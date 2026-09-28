import { describe, it, expect, vi, afterEach } from "vitest";
import { eventBody, reportActivationEvent, countersEnabled } from "./activation-events";

describe("#44 client activation events", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends only the event name and the anonId — no PII, no extra fields", () => {
    const body = eventBody("quick_opened", "9f2c1b4e-0a7d-4c1a-9e33-2b6d5f1c8a90");
    expect(Object.keys(body).sort()).toEqual(["anonId", "event"]);
    expect(body.event).toBe("quick_opened");
  });

  it("is a no-op without a backend (the localStorage demo path has nowhere to POST)", async () => {
    // A developer's .env.local can set VITE_USE_SERVER_ADAPTER, so the flag is stubbed here
    // rather than assumed — the assertion is about the BEHAVIOUR, not about this machine's env.
    vi.stubEnv("VITE_USE_SERVER_ADAPTER", "");
    expect(countersEnabled()).toBe(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await reportActivationEvent("quick_opened", "anon-1234567890")).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs to /api/events when the backend IS configured", async () => {
    vi.stubEnv("VITE_USE_SERVER_ADAPTER", "on");
    expect(countersEnabled()).toBe(true);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);
    expect(await reportActivationEvent("quick_completed", "anon-1234567890")).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/api/events");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      event: "quick_completed",
      anonId: "anon-1234567890",
    });
  });

  it("never throws when the POST fails (a dropped counter stays invisible)", async () => {
    vi.stubEnv("VITE_USE_SERVER_ADAPTER", "on");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(reportActivationEvent("quick_completed", "anon-1234567890")).resolves.toBe(false);
  });

  it("refuses to report without an anonId", async () => {
    vi.stubEnv("VITE_USE_SERVER_ADAPTER", "on");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await reportActivationEvent("quick_opened", "")).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
