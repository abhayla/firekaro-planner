<script setup lang="ts">
/**
 * TrustPill — Phase 7 Stage U trust pill per
 * docs/goals/build-firekaro-mvp-v5.md §10 (audit Entry #34).
 *
 * 4 claims (audit-mandated):
 *   1. All data stays on your device — no login, no backend, no telemetry.
 *   2. Research-grounded methodology (60+ sources cited).
 *   3. No financial-product affiliations or commissions.
 *   4. Planner voice — not promotional.
 *
 * Used on Splash + Dashboard footer.
 */
const props = defineProps<{
  variant?: "splash" | "footer";
}>();

void props; // suppress unused-warning when variant defaults
</script>

<template>
  <div class="trust-pill" :class="`trust-pill--${variant ?? 'footer'}`" data-testid="trust-pill">
    <div class="trust-pill__items">
      <div class="trust-pill__item">
        <v-icon icon="mdi-shield-lock-outline" size="small" />
        <span>All data stays on your device — no login, no backend, no telemetry</span>
      </div>
      <div class="trust-pill__item">
        <v-icon icon="mdi-book-open-variant" size="small" />
        <span>Research-grounded methodology (60+ sources cited)</span>
      </div>
      <div class="trust-pill__item">
        <v-icon icon="mdi-handshake-outline" size="small" />
        <span>No product affiliations or commissions</span>
      </div>
      <div class="trust-pill__item">
        <v-icon icon="mdi-format-quote-close-outline" size="small" />
        <span>Planner voice — not promotional</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trust-pill {
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
  background: rgba(var(--v-theme-primary), 0.04);
  border: 1px solid rgba(var(--v-theme-primary), 0.12);
  border-radius: 8px;
  padding: 12px 16px;
  margin: 16px 0;
}
.trust-pill__items {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px 16px;
}
.trust-pill__item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.trust-pill--splash {
  background: rgba(var(--v-theme-on-surface), 0.03);
  margin: 24px auto;
  max-width: 720px;
}
</style>
