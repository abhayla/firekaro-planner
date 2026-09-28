// v4 — Fonts loaded before tokens.css so CSS can reference them
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";

// v4 — Design tokens + motion system (load AFTER Vuetify styles to override defaults)
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import vuetify from "./plugins/vuetify";
import "./styles/tokens.css";
import "./styles/motion.css";
import { setAdapter } from "./lib/storage-adapter";
import { setAuthProvider, ServerAuthProvider, AnonymousAuthProvider } from "./lib/auth-provider";
import { ServerAdapter } from "./lib/server-adapter";
import { claimGuestPlan } from "./lib/guest-plan-claim";

/**
 * v6 boot seam (the ONLY async point). When VITE_USE_SERVER_ADAPTER is on, resolve
 * the Better-Auth session, warm the ServerAdapter cache, and install it BEFORE
 * mount — so every store hydrate() + router guard reads a synchronous warm cache.
 * If the flag is off (v5 / GitHub Pages demo) or the backend is unreachable, fall
 * back to the localStorage path (the stores are none the wiser). This keeps the 6
 * stores + router guards UNCHANGED.
 */
async function installServerAdapter(): Promise<void> {
  const useServer =
    import.meta.env.VITE_USE_SERVER_ADAPTER === "on" ||
    import.meta.env.VITE_USE_SERVER_ADAPTER === "true";
  if (!useServer) return; // v5 localStorage path

  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
  const devBypass = import.meta.env.VITE_DEV_BYPASS === "true";
  const headers: Record<string, string> = devBypass ? { "x-dev-bypass": "true" } : {};

  try {
    const meRes = await fetch(`${baseUrl}/api/planner/me`, {
      credentials: "include",
      headers,
    });
    if (!meRes.ok) {
      // Reachable but no valid session. #187: a guest is NOT dead-ended at /login any more —
      // AnonymousAuthProvider gives them the `anon` storage namespace so the PUBLIC routes
      // (/quick) run on the v5 localStorage path, while isAuthenticated()===false keeps the
      // router's auth gate closed on every other route.
      console.warn("[boot] no session — guest mode (public routes only)");
      setAuthProvider(new AnonymousAuthProvider());
      return;
    }
    const { data } = (await meRes.json()) as { data?: { id?: string } };
    const userId = data?.id;
    if (!userId) {
      console.warn("[boot] /me returned no userId — guest mode (public routes only)");
      setAuthProvider(new AnonymousAuthProvider());
      return;
    }
    const adapter = new ServerAdapter(userId, { baseUrl, devBypass });
    await adapter.hydrateAll(); // warm cache before mount (rejects -> fallback)
    // #187 sign-up handoff — a visitor who answered /quick while signed OUT has their plan in the
    // `anon` localStorage namespace, which hydrateAll() (a server read) knows nothing about. Carry
    // it up ONCE, and only into an account with no plan of its own (see guest-plan-claim.ts).
    claimGuestPlan(adapter);
    setAuthProvider(new ServerAuthProvider(userId));
    setAdapter(adapter);
  } catch (err) {
    console.warn("[boot] server adapter unavailable — falling back to localStorage", err);
    setAdapter(null);
  }
}

async function bootstrap(): Promise<void> {
  await installServerAdapter();

  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.use(vuetify);
  app.mount("#app");
}

void bootstrap();
