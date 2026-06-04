import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { redactUrlSecrets, reqSerializer } from "./logger";

// gh-issue #26: pino's stdSerializers.req logs req.url with the full query string, so a webhook
// authenticated via ?token=<WATI_WEBHOOK_SECRET> leaked the secret in plaintext prod logs. The
// custom req serializer masks sensitive query-param VALUES in the logged url. Over-masking is safe
// (logs); under-masking is the security risk — so this errs toward masking.
describe("redactUrlSecrets — mask secrets in logged request URLs (gh-issue #26)", () => {
  it("masks the Wati webhook ?token= secret (the reported leak)", () => {
    const out = redactUrlSecrets("/api/webhooks/wati?token=SUPERSECRET123");
    expect(out).not.toContain("SUPERSECRET123");
    expect(out).toBe("/api/webhooks/wati?token=[REDACTED]");
  });

  it("masks secret / key / sig params in any position, case-insensitive", () => {
    expect(redactUrlSecrets("/x?a=1&secret=SHHH&b=2")).toBe("/x?a=1&secret=[REDACTED]&b=2");
    expect(redactUrlSecrets("/x?KEY=ABC")).toBe("/x?KEY=[REDACTED]");
    expect(redactUrlSecrets("/x?sig=ZZZ")).toBe("/x?sig=[REDACTED]");
    expect(redactUrlSecrets("/x?access_token=A.B.C")).not.toContain("A.B.C");
  });

  it("masks every sensitive param when several are present", () => {
    const out = redactUrlSecrets("/x?token=T1&key=K1");
    expect(out).not.toContain("T1");
    expect(out).not.toContain("K1");
  });

  it("masks across ; and # separators too (errs toward masking)", () => {
    expect(redactUrlSecrets("/x?a=1;token=LEAK;b=2")).not.toContain("LEAK");
    expect(redactUrlSecrets("/x#token=LEAK")).not.toContain("LEAK");
  });

  it("leaves non-sensitive params + plain urls untouched, and tolerates undefined", () => {
    expect(redactUrlSecrets("/x?page=2&fy=2025-26")).toBe("/x?page=2&fy=2025-26");
    expect(redactUrlSecrets("/api/health")).toBe("/api/health");
    expect(redactUrlSecrets(undefined)).toBeUndefined();
  });

  // Wiring proof: a req logged THROUGH pino with our serializer masks the secret in real output.
  // (Defense-in-depth — the live request logger logs the query-less c.req.path, but if any future
  //  site logs a full URL via { req }, this guarantees the secret never reaches the sink.)
  it("end-to-end: pino + reqSerializer masks ?token= in emitted output", () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const testLogger = pino({ serializers: { req: reqSerializer } }, sink);
    testLogger.info(
      { req: { method: "POST", url: "/api/webhooks/wati?token=LIVESECRET999", headers: {} } },
      "incoming webhook",
    );
    const out = lines.join("");
    expect(out).not.toContain("LIVESECRET999");
    expect(out).toContain("[REDACTED]");
  });
});
