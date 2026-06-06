<script setup lang="ts">
import { computed } from "vue";
import { getCurrentFYTaxStaleness } from "@/lib/tax";

// PROD-VISIBLE current-FY tax-staleness banner (obj-1 honesty must-have). Renders ONLY when the
// live current FY has no configured slabs — i.e. the engine is silently computing take-home /
// savings / FIRE figures on stale (newest-held-flat) slabs. NOT DEV-gated (that was the original
// bug); it self-hides whenever the config is current, so today (FY 2026-27 configured) it shows nothing.

// DEV-only render seam: in non-prod, `?taxFyOverride=YYYY-YY` forces the staleness evaluation to a
// date inside that FY so the (correctly-hidden-today) stale banner can be screenshotted for Rule-24
// verification. NEVER active in prod — gated on import.meta.env.DEV; the banner itself is not gated.
function resolveNow(): Date {
  if (import.meta.env?.DEV && typeof window !== "undefined") {
    const override = new URLSearchParams(window.location.search).get("taxFyOverride");
    if (override && /^\d{4}-\d{2}$/.test(override)) {
      const startYear = parseInt(override.slice(0, 4), 10);
      if (Number.isFinite(startYear)) return new Date(`${startYear}-05-01`); // safely inside that FY
    }
  }
  return new Date();
}

const s = computed(() => getCurrentFYTaxStaleness(resolveNow()));
</script>

<template>
  <v-alert
    v-if="s.stale"
    type="warning"
    variant="tonal"
    density="comfortable"
    class="ma-4 mb-0"
    data-testid="tax-staleness-banner"
  >
    Tax slabs for <strong>FY {{ s.currentFy }}</strong> aren't loaded yet — your take-home, savings
    and FIRE figures currently use <strong>FY {{ s.newestConfiguredFy }}</strong> slabs and are
    estimates until the Budget update lands.
  </v-alert>
</template>
