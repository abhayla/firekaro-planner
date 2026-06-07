import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import pino from "pino";
import { redactUrlSecrets, reqSerializer, REDACT_PATHS } from "./logger";

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

// A4.3 (DPDP / structured-logging.md): prove the FIELD-PATH redaction (the pino `redact.paths`
// the live logger uses, via the shared REDACT_PATHS const) actually masks secret + PII fields in
// emitted output — NOT a vacuous "looks clean". Under-masking PAN/salary/recipient-number PII is a
// DPDP violation; this asserts each sensitive value is gone and replaced by [REDACTED].
describe("field-path redaction — DPDP PII + secrets masked in emitted logs (A4.3)", () => {
  function captureLog(obj: Record<string, unknown>): string {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    // Same redact config the live logger uses (shared REDACT_PATHS — no drift), JSON output.
    const testLogger = pino({ redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } }, sink);
    testLogger.info(obj, "sensitive payload");
    return lines.join("");
  }

  it("masks top-level secret fields (token, password, secret, authorization)", () => {
    const out = captureLog({
      token: "TKN-LIVE-1",
      password: "PW-LIVE-2",
      secret: "SEC-LIVE-3",
      authorization: "Bearer LIVE-4",
    });
    for (const leak of ["TKN-LIVE-1", "PW-LIVE-2", "SEC-LIVE-3", "LIVE-4"]) {
      expect(out, `${leak} must be masked`).not.toContain(leak);
    }
    expect(out).toContain("[REDACTED]");
  });

  it("masks PII recipient fields (whatsappNumber, toNumber, failedDetail) — DPDP", () => {
    const out = captureLog({
      whatsappNumber: "917000000001",
      toNumber: "917000000002",
      failedDetail: "delivery failed for 917000000003",
    });
    for (const pii of ["917000000001", "917000000002", "917000000003"]) {
      expect(out, `recipient PII ${pii} must never reach logs`).not.toContain(pii);
    }
  });

  it("masks nested (wildcard *.token / *.whatsappNumber) one level deep", () => {
    const out = captureLog({
      send: { token: "NESTED-TKN-9", whatsappNumber: "917999999999" },
    });
    expect(out).not.toContain("NESTED-TKN-9");
    expect(out).not.toContain("917999999999");
  });

  it("leaves non-sensitive fields intact (no over-masking of benign data)", () => {
    const out = captureLog({ userId: "user-123", fy: "2025-26", count: 42 });
    expect(out).toContain("user-123");
    expect(out).toContain("2025-26");
    expect(out).toContain("42");
  });
});
