import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import { createVuetify } from "vuetify";

// ProjectionLab-inspired light theme. Q10.1 (v3): dark mode removed entirely — the demo
// is light-only. Single theme definition keeps the visual identity uniform.
export default createVuetify({
  theme: {
    defaultTheme: "light",
    themes: {
      light: {
        dark: false,
        colors: {
          primary: "#1867c0",
          "primary-darken-1": "#104d8a",
          "primary-lighten-1": "#4a90d9",
          secondary: "#26a69a",
          "secondary-darken-1": "#00867d",
          success: "#10b981",
          "success-darken-1": "#059669",
          warning: "#f59e0b",
          "warning-darken-1": "#d97706",
          error: "#ef4444",
          "error-darken-1": "#dc2626",
          info: "#3b82f6",
          "info-darken-1": "#2563eb",
          background: "#fafbfc",
          surface: "#ffffff",
          "surface-variant": "#f5f7fa",
          "surface-light": "#f8f9fb",
          "on-surface": "#1e293b",
          "on-background": "#1e293b",
          "fire-orange": "#f97316",
          "fire-green": "#10b981",
          "fire-blue": "#1867c0",
          "fire-gold": "#eab308",
        },
      },
    },
  },
  icons: {
    defaultSet: "mdi",
  },
  // v4 — Linear-anchored sharp radii (was: VCard/VDialog xl=24px, VChip lg=8px).
  // New: VCard/VDialog lg=8px, VChip sm=2px. Aligns with tokens.css --radius-md/--radius-xs.
  defaults: {
    VCard: { elevation: 0, rounded: "lg" },
    VBtn: { rounded: "lg", elevation: 0 },
    VTextField: { variant: "outlined", density: "comfortable", rounded: "lg" },
    VSelect: { variant: "outlined", density: "comfortable", rounded: "lg" },
    VAutocomplete: { variant: "outlined", density: "comfortable", rounded: "lg" },
    VTextarea: { variant: "outlined", density: "comfortable", rounded: "lg" },
    VDataTable: { hover: true },
    VChip: { rounded: "sm" },
    VAlert: { rounded: "lg", variant: "tonal" },
    VDialog: { rounded: "lg" },
    VMenu: { rounded: "lg" },
    // #77 — opaque high-contrast tooltip surface. The .fk-tooltip rule (tokens.css)
    // gives every v-tooltip a solid slate-900 surface so the busy page never bleeds
    // through the jargon explanation. Covers all v-tooltip users globally.
    VTooltip: { contentClass: "fk-tooltip" },
    VNavigationDrawer: { elevation: 0 },
    VAppBar: { elevation: 0 },
    VTabs: { rounded: "lg" },
    VTab: { rounded: "lg" },
  },
});
