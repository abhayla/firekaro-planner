// Single source of truth for "are we in server/authenticated (prod) mode vs the
// localStorage demo deployment?". DEMO-ONLY affordances — the seed switcher,
// "Explore with sample data", the seed-driven product tour, and the command-
// palette "Switch to <Seed>" actions — MUST be gated on this so they can never
// overwrite a real user's account (gh #36). Centralised so "is this gated?" is a
// single grep, not 6 copy-pasted `import.meta.env` checks (which is how the
// command-palette path slipped past the first #36 fix).
export function isServerMode(): boolean {
  return (
    import.meta.env.VITE_USE_SERVER_ADAPTER === "on" ||
    import.meta.env.VITE_USE_SERVER_ADAPTER === "true"
  );
}
