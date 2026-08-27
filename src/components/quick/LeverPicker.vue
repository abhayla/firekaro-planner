<script setup lang="ts">
/**
 * QN-5 (T-379) — "How to get there — pick your moves" (design SSOT:
 * docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html, the plan card).
 *
 * Nothing is assumed by default. Each move shows what it would do ALONE ("less to find" per
 * month, from a full re-solve through derive()); the switched-on set is stacked and re-solved
 * for the summary line — and the hero above re-solves with the same set, so the two can never
 * disagree (they read the same `useFireDerive().requiredContribution`). Unavailable moves are
 * greyed with the reason, never hidden and never faked. Decision support, not advice.
 *
 * The toggles are a session-only what-if (`ui.whatIfLevers`). "Make this my plan" writes the
 * persistable moves through the existing stores: step-up → assumptions, retire-later → the
 * members' target age, direct plans → the equityReturn override. Trimming spending and rolling
 * the EMI are things the user DOES, not settings — they stay as what-ifs.
 */
import { computed } from "vue";
import { useFireDerive } from "@/lib/useFireDerive";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { PLAN_DIRECT_PLAN_UPLIFT, PLAN_STEP_UP_PERCENT, type PlanLeverKey } from "@/lib/lever-catalog";
import { PLAN_HONESTY_LINE } from "@/lib/quick-number-copy";
import { formatINRCompact } from "@/lib/formatters";

withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false });

const fire = useFireDerive();
const h = useHouseholdStore();
const a = useAssumptionsStore();
const ui = useUiStore();

const levers = computed(() => fire.planLevers.value);
const effects = computed(() => fire.planLeverEffects.value);
const on = computed(() => new Set(ui.whatIfLevers));
const req = computed(() => fire.requiredContribution.value);
const targetAge = computed(() => fire.heroTargetAge.value);

const rows = computed(() =>
  levers.value.map((l) => {
    const e = effects.value.effects.find((x) => x.key === l.key);
    return { lever: l, effect: e, checked: l.available && on.value.has(l.key) };
  }),
);

const activeNames = computed(() =>
  levers.value.filter((l) => l.available && on.value.has(l.key)).map((l) => l.label.toLowerCase()),
);
const anyOn = computed(() => activeNames.value.length > 0);

/** The baseline's extra-to-find (no moves) and the stacked plan's — both from the ONE solver. */
const baselineToFind = computed(() => effects.value.baseline.toFind);
const stackedToFind = computed(() => {
  const gap = req.value.requiredMonthlyReal - req.value.currentMonthlyReal;
  return Number.isFinite(gap) ? Math.max(0, gap) : Number.POSITIVE_INFINITY;
});
const stackedRequiredFinite = computed(() => Number.isFinite(req.value.requiredMonthlyReal));

const summary = computed(() => {
  if (!req.value.hasTarget) return null;
  if (!anyOn.value) return "Switch on a few moves to see the number you can actually live with.";
  const names = activeNames.value.join(" + ");
  if (!stackedRequiredFinite.value) {
    return `Even with ${names}, retiring at ${targetAge.value} is beyond any realistic monthly amount — add "retire later", or drag the age.`;
  }
  const current = req.value.currentMonthlyReal;
  const required = req.value.requiredMonthlyReal;
  if (required <= current) {
    return `With ${names}: your current ${formatINRCompact(current)}/month is enough to retire at ${targetAge.value}.`;
  }
  const was = Number.isFinite(baselineToFind.value)
    ? ` (was ${formatINRCompact(baselineToFind.value)})`
    : " (was out of reach)";
  return `With ${names}: you need ${formatINRCompact(required)}/month to retire at ${targetAge.value}. Of that, ${formatINRCompact(current)} is already flowing; the extra to find is ${formatINRCompact(stackedToFind.value)}/month${was}.`;
});

const PERSISTABLE: PlanLeverKey[] = ["step-up-10", "delay-3", "direct-plans"];
const persistableOn = computed(() => PERSISTABLE.filter((k) => on.value.has(k) && levers.value.find((l) => l.key === k)?.available));
const canMakePlan = computed(() => persistableOn.value.length > 0 && stackedRequiredFinite.value);

/** Write the switched-on persistable moves into the real plan through the existing store paths. */
function makeThisMyPlan() {
  const keys = persistableOn.value;
  if (keys.includes("step-up-10")) {
    a.set("householdSavingsStepUpPercent", Math.max(a.values.householdSavingsStepUpPercent ?? 0, PLAN_STEP_UP_PERCENT));
  }
  if (keys.includes("direct-plans")) {
    a.set("equityReturn", a.values.equityReturn + PLAN_DIRECT_PLAN_UPLIFT);
    a.set("internationalReturn", (a.values.internationalReturn ?? 0) + PLAN_DIRECT_PLAN_UPLIFT);
    // Told the product once — the lever then reads as "already on direct plans".
    ui.setQuickPrefs({ directPlans: true });
  }
  if (keys.includes("delay-3")) {
    // The effective age (slider + 3) becomes the saved target of the scope on screen — same
    // rule as the hero's "Set as my target" (a member lens writes only that adult).
    const age = targetAge.value;
    const targets = fire.applyMemberLens.value
      ? h.data.members.filter((m) => m.id === ui.viewingMemberId)
      : h.earners;
    for (const m of targets) h.updateMember(m.id, { targetRetirementAge: age });
    ui.setWhatIfTargetAge(null);
  }
  for (const k of keys) ui.toggleWhatIfLever(k); // now part of the plan, no longer a what-if
}

function effectLabel(e: { lessToFind: number; rescues: boolean; stillUnreachable: boolean } | undefined) {
  if (!e) return null;
  if (e.rescues) return { big: "makes it reachable", small: "on its own", tone: "ok" };
  if (e.stillUnreachable) return { big: "still out of reach", small: "on its own", tone: "mut" };
  if (e.lessToFind <= 0) return { big: "no change", small: "on its own", tone: "mut" };
  return { big: `−${formatINRCompact(e.lessToFind)}/mo`, small: "less to find", tone: "ok" };
}
</script>

<template>
  <v-card
    variant="outlined"
    :class="['lever-picker', embedded ? 'lever-picker--embedded pa-0' : 'pa-6 mt-4']"
    :flat="embedded"
    data-testid="lever-picker"
  >
    <h3 class="text-subtitle-1 font-weight-bold font-display mb-1">How to get there — pick your moves</h3>
    <p class="text-caption text-medium-emphasis mb-2">
      Nothing below is assumed by default. Switch on what you'd actually do; the number above updates.
    </p>

    <div class="lever-list" role="group" aria-label="Moves that change what you need to invest each month">
      <label
        v-for="row in rows"
        :key="row.lever.key"
        class="lever"
        :class="{ 'lever--off': !row.lever.available }"
        :data-testid="`lever-${row.lever.key}`"
      >
        <input
          type="checkbox"
          class="lever__box"
          :checked="row.checked"
          :disabled="!row.lever.available"
          :aria-label="row.lever.label"
          :data-testid="`lever-toggle-${row.lever.key}`"
          @change="ui.toggleWhatIfLever(row.lever.key)"
        />
        <span class="lever__text">
          <span class="lever__label">{{ row.lever.label }}</span>
          <span class="lever__note">{{ row.lever.note }}</span>
        </span>
        <span class="lever__fx" :data-testid="`lever-effect-${row.lever.key}`">
          <template v-if="!row.lever.available">
            <span class="lever__note">{{ row.lever.unavailableReason }}</span>
          </template>
          <template v-else-if="effectLabel(row.effect)">
            <b :class="effectLabel(row.effect)!.tone === 'ok' ? 'text-success' : 'text-medium-emphasis'">
              {{ effectLabel(row.effect)!.big }}
            </b>
            <span class="lever__note">{{ effectLabel(row.effect)!.small }}</span>
          </template>
        </span>
      </label>
    </div>

    <div v-if="summary" class="plan-sum" data-testid="lever-plan-summary">
      {{ summary }}
      <div v-if="canMakePlan" class="mt-2">
        <v-btn
          size="small"
          color="primary"
          variant="flat"
          prepend-icon="mdi-check-bold"
          data-testid="lever-make-plan"
          @click="makeThisMyPlan"
        >
          Make this my plan
        </v-btn>
        <span class="lever__note ml-2">
          saves the step-up, the target age and the direct-plan return; trimming and rolling the EMI are things you do, so they stay what-ifs
        </span>
      </div>
    </div>

    <p class="text-caption text-medium-emphasis mt-3 mb-0" data-testid="quick-honesty-line">
      {{ PLAN_HONESTY_LINE }}
    </p>
  </v-card>
</template>

<style scoped>
.lever-picker--embedded {
  border: none !important;
}
.lever {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--border-subtle);
  font-size: var(--type-sm);
  cursor: pointer;
}
.lever:first-child {
  border-top: 0;
}
.lever--off {
  opacity: 0.55;
  cursor: not-allowed;
}
.lever__box {
  width: 18px;
  height: 18px;
  accent-color: rgb(var(--v-theme-primary));
}
.lever__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.lever__label {
  color: var(--text-primary);
  font-weight: var(--weight-medium);
}
.lever__note {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
}
.lever__fx {
  text-align: right;
  white-space: nowrap;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 44%;
}
.lever__fx b {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.lever--off .lever__fx .lever__note {
  white-space: normal;
  text-align: right;
}
.plan-sum {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(var(--v-theme-primary), 0.07);
  font-size: var(--type-sm);
  line-height: 1.5;
}
</style>
