---
description: Composables MUST unwrap API envelopes via unwrapResponse/unwrapArrayResponse from src/utils/api-helpers.ts, never access data.data directly.
globs: ["src/composables/**/*.ts", "src/utils/api-helpers.ts", "src/pages/**/*.vue"]
version: "1.0.0"
synthesized: true
private: false
---

# API Response Unwrapping

All frontend consumers of Hono endpoints MUST unwrap the envelope (see `api-envelope-pattern.md` for the server side) through the helpers exported from `src/utils/api-helpers.ts`. Direct `.data.data` property access is forbidden — it silently swallows the error case and makes the two-layer envelope invisible at the call site.

## The Helpers

- `unwrapResponse<T>(response)` — validates the envelope shape, throws with the server's error message on `success: false`, returns `response.data` on success.
- `unwrapArrayResponse<T>(response)` — same semantics but also normalizes absent lists to `[]` so defensive-coding checks in callers stay readable.
- `isEnvelopeResponse(value)` / `isErrorResponse(value)` — type guards for code paths that need to inspect the envelope without throwing.

## MUST / MUST NOT

- Composables in `src/composables/**` MUST call `unwrapResponse` or `unwrapArrayResponse` on every fetch that hits `/api/**`.
- MUST NOT write `response.data.data` or `response.data.data.items` in components or composables. That syntax is a smell for a missed unwrap and hides the error branch.
- MUST NOT use `try { ... } catch { return null }` to paper over envelope errors. The helpers' thrown error is what TanStack Vue Query needs to populate `error.value`. Swallowing it means the UI cannot render error states.
- If a composable genuinely needs the raw envelope (pagination metadata, for example), MUST use `apiPaginated` endpoints together with `unwrapResponse` plus a typed accessor — do not regress to manual indexing.
- Components MUST NOT call the helpers directly. Unwrap inside the composable's `queryFn`/`mutationFn` so the component always sees the unwrapped type.

## TanStack Vue Query Integration

The Vue Query defaults in `src/plugins/vue-query.ts` (staleTime 5 min, gcTime 30 min, retry 1, `refetchOnWindowFocus: false`) assume `queryFn` returns unwrapped data and throws on envelope errors. Violating either contract breaks cache hydration and the error-state UI.

## Canonical Example

Pick any file under `src/composables/` — the canonical shape is:

```ts
return useQuery({
  queryKey: ['domain', id],
  queryFn: async () => {
    const res = await fetch(`/api/domain/${id}`);
    return unwrapResponse<DomainEntity>(await res.json());
  },
});
```

Defensive-coding guards (`?.`, `?? 0`, `isFinite()`) from `rules/defensive-coding.md` still apply to the unwrapped data at the component level — the unwrap does not guarantee populated fields, only envelope validity.

## Why This Matters

Without the helpers, any envelope-shape drift on the server silently corrupts client caches and crashes components with confusing "cannot read property X of undefined" errors far from the root cause. The helpers are the choke point that fails loudly when contract drift happens.
