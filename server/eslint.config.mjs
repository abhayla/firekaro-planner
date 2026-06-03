// Minimal ESLint gate for the server tree — enforces EXACTLY two project
// invariants, nothing more (no eslint:recommended / no typescript-eslint
// recommended sets). See .claude/rules/structured-logging.md and
// .claude/rules/hono-route-conventions.md (+ api-envelope-pattern.md).
import tsParser from "@typescript-eslint/parser";

const NO_CONSOLE_MESSAGE =
  "Use the pino logger from server/lib/logger.ts instead of console.*. See rules/structured-logging.md.";

const NO_RAW_CJSON_MESSAGE =
  "Use apiSuccess() or apiError() from server/lib/api-utils instead of raw c.json(). See rules/hono-route-conventions.md.";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.ts"],
    // Test specs are exempt from the no-console block (no logger in the test
    // context); the raw-c.json restriction still applies to non-test src below.
    ignores: ["src/**/*.spec.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      // no-console: forbid console.log/info/warn/error/debug in server/src.
      // Built-in no-console cannot carry a custom message, so the project
      // message is delivered via no-restricted-syntax selectors below; the
      // built-in rule stays on as the named, doc-referenced gate.
      "no-console": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='console'][callee.property.name=/^(log|info|warn|error|debug)$/]",
          message: NO_CONSOLE_MESSAGE,
        },
        {
          selector:
            "CallExpression[callee.object.name='c'][callee.property.name='json']",
          message: NO_RAW_CJSON_MESSAGE,
        },
      ],
    },
  },
];
