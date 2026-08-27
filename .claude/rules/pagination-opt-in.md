---
description: List endpoints MUST paginate only when ?page= is present. Unpaginated by default to preserve existing clients. Use parsePagination + apiPaginated.
paths: ["server/routes/**/*.ts", "src/composables/**/*.ts"]
version: "1.0.0"
synthesized: true
private: false
---

# Pagination Opt-In

FIREKaro list endpoints are unpaginated by default. Pagination is opt-in per request via the `?page=` query parameter. This contract is intentional — it preserved existing frontend callers that consumed full lists during the pagination migration and it still protects those callers today.

## Server Shape

- `server/lib/api-utils.ts` exposes `parsePagination(c)` which reads `?page=` and `?pageSize=` off the request and returns either a `{ page, pageSize, skip, take }` struct or `null` when the caller did not ask for pagination.
- When `parsePagination` returns non-null, the route MUST respond with `apiPaginated(c, items, meta)` where `meta` is built by `buildPaginationMeta(...)`.
- When `parsePagination` returns `null`, the route MUST respond with `apiSuccess(c, items)` — the full unpaginated list.

See any of the 11 paginated routes under `server/routes/**` for a worked example; the envelope and Prisma `skip`/`take` wiring is identical across them.

## Client Shape

- Composables in `src/composables/**` MUST use `unwrapArrayResponse` (see `api-response-unwrapping.md`) for the unpaginated path and pull `.pagination` out of the envelope for the paginated path.
- A composable that pages MUST append `?page=N&pageSize=M` to the URL and expose `page`/`pageSize` as reactive refs that the consuming component can change.

## MUST / MUST NOT

- List endpoints MUST NOT paginate unconditionally. A default-paginated list breaks every existing caller that expected the full collection.
- MUST NOT invent a new query-string convention (e.g., `?offset=`, `?limit=`). Use `?page=` and `?pageSize=`. `parsePagination` is the only reader.
- MUST NOT cap `pageSize` at a value so low that a single page UI cannot render a reasonable table. Default caps live in `api-utils.ts` — raise them there, not per-route.
- MUST NOT mix paginated and unpaginated response shapes from the same endpoint based on anything other than the presence of `?page=`. Do not dispatch on user role, feature flag, or request body.
- Integration tests for a newly paginated route MUST cover both shapes: `?page=` present and `?page=` absent.

## Integration Test Expectations

See `server/routes/**/pagination-integration.spec.ts` — the integration suite exercises the paginated path end-to-end against the real database. Unit specs that mock the DB will not catch `skip`/`take` mistakes.

## Why This Matters

Defaulting to paginated breaks any client that assumed a full list — and those clients often have no explicit integration test pinning that assumption. The `?page=` opt-in keeps old callers working while letting new callers opt into pagination deliberately. It also avoids the anti-pattern where server defaults silently change the contract between releases.
