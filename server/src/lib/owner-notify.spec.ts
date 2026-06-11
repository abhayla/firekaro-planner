import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyOwner } from "./owner-notify";

describe("notifyOwner", () => {
  const realFetch = globalThis.fetch;
  const realUrl = process.env.NOTIFIER_URL;
  const realKey = process.env.NOTIFIER_KEY;

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realUrl === undefined) delete process.env.NOTIFIER_URL;
    else process.env.NOTIFIER_URL = realUrl;
    if (realKey === undefined) delete process.env.NOTIFIER_KEY;
    else process.env.NOTIFIER_KEY = realKey;
    vi.restoreAllMocks();
  });

  it("is a no-op when NOTIFIER_URL / NOTIFIER_KEY are unset (dev/test safe)", () => {
    delete process.env.NOTIFIER_URL;
    delete process.env.NOTIFIER_KEY;
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    notifyOwner("P1", "should not send");
    expect(spy).not.toHaveBeenCalled();
  });

  it("POSTs to <url>/notify with the api key and event shape when configured", async () => {
    process.env.NOTIFIER_URL = "http://127.0.0.1:3300/";
    process.env.NOTIFIER_KEY = "test-key";
    const spy = vi.fn().mockResolvedValue(new Response("{}", { status: 202 }));
    globalThis.fetch = spy as unknown as typeof fetch;

    notifyOwner("P0", "DB down", { type: "error", body: "boom", dedupeKey: "db" });
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:3300/notify"); // trailing slash trimmed
    expect((init as RequestInit).headers).toMatchObject({ "X-Api-Key": "test-key" });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ project: "firekaro", severity: "P0", title: "DB down", type: "error", dedupeKey: "db" });
  });

  it("never throws when fetch rejects (fire-and-forget; cannot break the host)", async () => {
    process.env.NOTIFIER_URL = "http://127.0.0.1:3300";
    process.env.NOTIFIER_KEY = "k";
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    expect(() => notifyOwner("P1", "x")).not.toThrow();
    await new Promise((r) => setTimeout(r, 10)); // let the async IIFE settle
  });
});
