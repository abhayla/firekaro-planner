import { describe, it, expect, vi } from "vitest";
import { runLifecycle, type RunnerDeps } from "./lifecycle-runner";
import type { LifecycleSignals } from "./lifecycle-evaluator";

/**
 * Lifecycle runner orchestration — pinned WITHOUT DB/network via injected deps:
 * it evaluates each consenting user, skips already-sent nudges (dedup), prepends
 * firstName to the template values, and never sends for a user with no derivable
 * household. The "run twice ⇒ second run sends nothing" property is the dedup proof.
 */

const NOW = new Date("2026-06-02T00:00:00.000Z");

const onTrack: LifecycleSignals = {
  progressPercent: 62,
  fireWithdrawableCorpus: 12_500_000,
  anchorAge: 40,
  targetRetirementAge: 50,
  yearsToRegular: 9, // 40 + 9 = 49 < 50 → on track (no offtrack)
  savingsRate: 30,
};

function deps(over: Partial<RunnerDeps> = {}): RunnerDeps {
  const sent = new Set<string>(); // dedupe keys "sent" this run, to model alreadySent across calls
  return {
    listUsers: vi.fn(async () => [{ userId: "u1", whatsappNumber: "919999900001" }]),
    loadSignals: vi.fn(async () => onTrack),
    getFirstName: vi.fn(async () => "Abhay"),
    alreadySent: vi.fn(async (_u: string, key: string) => sent.has(key)),
    fire: vi.fn(async (_k, _t, _v, dedupeKey: string) => {
      sent.add(dedupeKey);
      return { sent: true, reason: "sent" };
    }),
    now: () => NOW,
    ...over,
  };
}

describe("runLifecycle", () => {
  it("fires the firing nudges once, prepending firstName to the values", async () => {
    const d = deps();
    const r = await runLifecycle(d);
    // on-track + 62% → milestone(50) + annual_review; no offtrack.
    expect(r.users).toBe(1);
    expect(r.sent).toBe(2);
    expect(d.fire).toHaveBeenCalledWith(
      "milestone",
      expect.objectContaining({ userId: "u1", toNumber: "919999900001", firstName: "Abhay" }),
      ["Abhay", "₹1.25Cr", "62%"],
      "milestone:50",
    );
    expect(d.fire).toHaveBeenCalledWith(
      "annual_review",
      expect.anything(),
      ["Abhay"],
      "annual_review:2026-27",
    );
  });

  it("skips nudges already sent (dedup) — a second run sends nothing", async () => {
    const alwaysSent = vi.fn(async () => true);
    const fire = vi.fn(async () => ({ sent: true, reason: "sent" }));
    const r = await runLifecycle(deps({ alreadySent: alwaysSent, fire }));
    expect(fire).not.toHaveBeenCalled();
    expect(r.sent).toBe(0);
    expect(r.deduped).toBe(2); // milestone + annual_review both deduped
  });

  it("skips a user with no derivable household (loadSignals → null)", async () => {
    const fire = vi.fn(async () => ({ sent: true, reason: "sent" }));
    const r = await runLifecycle(deps({ loadSignals: vi.fn(async () => null), fire }));
    expect(fire).not.toHaveBeenCalled();
    expect(r.candidates).toBe(0);
  });

  it("continues past a user whose signal load throws", async () => {
    const r = await runLifecycle(
      deps({
        listUsers: vi.fn(async () => [
          { userId: "boom", whatsappNumber: "910000000000" },
          { userId: "u1", whatsappNumber: "919999900001" },
        ]),
        loadSignals: vi.fn(async (uid: string) => {
          if (uid === "boom") throw new Error("derive blew up");
          return onTrack;
        }),
      }),
    );
    expect(r.users).toBe(2);
    expect(r.sent).toBe(2); // u1 still processed
  });

  it("counts a send the sender refused as notSent (not sent)", async () => {
    const r = await runLifecycle(
      deps({ fire: vi.fn(async () => ({ sent: false, reason: "frequency-cap" })) }),
    );
    expect(r.sent).toBe(0);
    expect(r.notSent).toBe(2);
  });

  it("a getFirstName failure does NOT abort the run — falls back to 'there' (gh-issue #10)", async () => {
    const d = deps({ getFirstName: vi.fn(async () => Promise.reject(new Error("db hiccup"))) });
    const r = await runLifecycle(d);
    expect(r.users).toBe(1);
    expect(r.sent).toBe(2); // run completed despite the name fetch throwing
    expect(d.fire).toHaveBeenCalledWith(
      "milestone",
      expect.objectContaining({ firstName: "there" }),
      ["there", "₹1.25Cr", "62%"],
      "milestone:50",
    );
  });
});
