/**
 * Minimal ambient shim so the shared frontend calc modules (src/lib/*) — which the
 * lifecycle runner imports via the @planner/@ aliases to reuse derive() without
 * duplicating logic — type-check under the backend's node-only tsconfig. Only
 * `tax.ts` reads `import.meta.env?.DEV` (Vite), and it is runtime-guarded by `?.`
 * (undefined under tsx/node). This declares the optional shape so tsc is satisfied;
 * it does NOT make the values exist at runtime.
 */
interface ImportMetaEnv {
  readonly DEV?: boolean;
  readonly MODE?: string;
  readonly [key: string]: unknown;
}

interface ImportMeta {
  readonly env?: ImportMetaEnv;
}
