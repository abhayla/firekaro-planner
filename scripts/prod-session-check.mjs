// Fast, headless check: is the saved prod session (e2e/.auth/prod-user.json) still valid?
// Loads the stored cookies into an API context and hits an auth-gated endpoint.
// 200 + user => valid (we can run the prod functional sweep headless, no login needed).
// 401 => expired (need a one-time Google sign-in via prod-cdp-sweep.mjs).
import { request } from "@playwright/test";

const ctx = await request.newContext({
  storageState: "e2e/.auth/prod-user.json",
  baseURL: "https://firekaro.com",
});
const r = await ctx.get("/api/planner/me");
console.log("STATUS:", r.status());
const body = (await r.text()).slice(0, 400);
console.log("BODY:", body);
console.log(r.ok() ? "VERDICT: SESSION_VALID" : "VERDICT: SESSION_EXPIRED");
await ctx.dispose();
process.exit(r.ok() ? 0 : 1);
