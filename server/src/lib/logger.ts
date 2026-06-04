import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Structured pino logger — copy-adapted from the root app's server/lib/logger.ts.
 * Dev: pretty-printed. Prod: JSON lines. Sensitive fields redacted.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  redact: {
    paths: [
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
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
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
