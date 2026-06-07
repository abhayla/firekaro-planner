import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Mask secret VALUES in a logged request URL's query string — defense-in-depth (gh-issue #26).
 * pino's `redact` masks whole field paths, not substrings inside a string, so any code path that
 * logs a full URL like `/webhook?token=<secret>` would expose the secret in plaintext. (Note: the
 * current request logger — hono-pino — logs the query-LESS `c.req.path`, so there is no live leak
 * today; this is precautionary hardening for any future full-URL log site.)
 * Masks any query param whose NAME contains token/secret/key/password/sig (case-insensitive),
 * across `?`/`&`/`;`/`#` separators — over-masking a non-secret value in logs is harmless;
 * under-masking is the security risk, so this errs toward masking.
 */
export function redactUrlSecrets(url: string | undefined): string | undefined {
  if (typeof url !== "string") return url;
  return url.replace(
    /([?&;#][^=&;#]*(?:token|secret|key|password|sig)[^=&;#]*=)[^&#;]*/gi,
    "$1[REDACTED]",
  );
}

// Custom `req` serializer = pino's standard one + URL-secret masking on the `url` field.
export const reqSerializer = (req: Parameters<typeof pino.stdSerializers.req>[0]) => {
  const serialized = pino.stdSerializers.req(req);
  if (serialized && typeof serialized.url === "string") {
    serialized.url = redactUrlSecrets(serialized.url) as string;
  }
  return serialized;
};

/**
 * Structured pino logger — copy-adapted from the root app's server/lib/logger.ts.
 * Dev: pretty-printed. Prod: JSON lines. Sensitive fields redacted.
 */
// Exported so the DPDP/secret redaction is verifiable in a test against the SAME paths the live
// logger uses (no config drift). Any field path here is masked to [REDACTED] before reaching a sink.
export const REDACT_PATHS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  // Internal shared-secret headers — hyphenated keys aren't caught by the
  // `token`/`*.token` paths, so redact them explicitly (else they log in plaintext).
  'req.headers["x-smoke-token"]',
  'req.headers["x-internal-token"]',
  'req.headers["x-dev-bypass"]',
  "*.password",
  "*.secret",
  "*.token",
  // PII: WhatsApp recipient numbers must never reach logs (comms subsystem).
  // failedDetail is provider/webhook-fed and can echo the recipient number.
  "whatsappNumber",
  "toNumber",
  "failedDetail",
  "*.whatsappNumber",
  "*.toNumber",
  "*.failedDetail",
];

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: reqSerializer, // #26: masks ?token=/?secret= query secrets in the logged url
    res: pino.stdSerializers.res,
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
});

export default logger;
