import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRouter, createMemoryHistory } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import {
  AnonymousAuthProvider,
  LocalAuthProvider,
  getAuthProvider,
  setAuthProvider,
} from "@/lib/auth-provider";
import { PUBLIC_ROUTE_NAMES, isPublicRouteName } from "./public-routes";

/**
 * #187 — the public-route carve-out must be EXACTLY the quick front door plus /login.
 *
 * The real router in ./index.ts installs a `createWebHistory` router at import time (no `window`
 * under vitest's node env), so this spec re-creates the SAME guard expression against a memory
 * history over the SAME `isPublicRouteName` predicate — the one thing the carve-out is made of.
 * The point is the invariant, not the wiring: a signed-out visitor reaches /quick, and EVERY
 * other route still bounces to /login. The end-to-end proof is the Playwright core-proof spec.
 */
function guardedRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/login", name: "login", component: { template: "<div />" } },
      { path: "/quick", name: "quick", component: { template: "<div />" } },
      { path: "/", name: "splash", component: { template: "<div />" } },
      {
        path: "/fire-goals/dashboard",
        name: "fire-dashboard",
        component: { template: "<div />" },
      },
      { path: "/profile", name: "profile", component: { template: "<div />" } },
    ],
  });
  router.beforeEach((to) => {
    const authed = getAuthProvider().isAuthenticated();
    if (!authed && !isPublicRouteName(to.name)) return { name: "login" };
    if (authed && to.name === "login") return { name: "splash" };
    return true;
  });
  return router;
}

describe("router auth gate — #187 public /quick", () => {
  let original = getAuthProvider();

  beforeEach(() => {
    setActivePinia(createPinia());
    original = getAuthProvider();
  });
  afterEach(() => setAuthProvider(original));

  it("exempts ONLY login + quick", () => {
    expect([...PUBLIC_ROUTE_NAMES].sort()).toEqual(["login", "quick"]);
  });

  it("a signed-out visitor reaches /quick (no /login redirect)", async () => {
    setAuthProvider(new AnonymousAuthProvider());
    const router = guardedRouter();
    await router.push("/quick");
    expect(router.currentRoute.value.name).toBe("quick");
  });

  it("a signed-out visitor is still redirected off /fire-goals/dashboard to /login", async () => {
    setAuthProvider(new AnonymousAuthProvider());
    const router = guardedRouter();
    await router.push("/fire-goals/dashboard");
    expect(router.currentRoute.value.name).toBe("login");
  });

  it("a signed-out visitor is still redirected off /profile and / to /login", async () => {
    setAuthProvider(new AnonymousAuthProvider());
    const router = guardedRouter();
    await router.push("/profile");
    expect(router.currentRoute.value.name).toBe("login");
    await router.push("/");
    expect(router.currentRoute.value.name).toBe("login");
  });

  it("the anon provider gives a storage-safe userId so /quick can persist locally", () => {
    const p = new AnonymousAuthProvider();
    expect(p.getCurrentUserId()).toBe("anon");
    expect(p.isAuthenticated()).toBe(false);
  });

  it("an authenticated visitor is bounced off /login", async () => {
    setAuthProvider(new LocalAuthProvider());
    const router = guardedRouter();
    await router.push("/login");
    expect(router.currentRoute.value.name).toBe("splash");
  });
});
