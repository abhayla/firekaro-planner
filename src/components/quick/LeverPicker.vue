<script setup lang="ts">
/**
 * T-379 (QN-5) — "How to get there — pick your moves".
 *
 * Design SSOT: `docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html` (the levers
 * card) and its target shot `shots/option-c-merged.plan.1280.png`.
 *
 * The ONE card that turns the hero's shock ("you need ₹2.37 L/month") into something a person can
 * actually act on. Each row is a move the user may or may not take; nothing is assumed by default
 * (the honesty invariant this card inherits — a lever that is silently ON would inflate the
 * headline). Toggling re-solves the WHOLE plan through `required-contribution.ts` → `derive()`,
 * so the hero updates live and stacking compounds instead of adding up.
 *
 * All math lives in `lever-catalog.ts`; this component only renders and toggles. The one write it
 * can make is "Make this my plan", which commits the selected moves through the EXISTING store
 * actions (household `targetRetirementAge`, assumptions `householdSavingsStepUpPercent` /
 * `equityReturn`) — never a new persisted field.
 */
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useUiStore } from "@/stores/ui";
import { useFireDerive } from "@/lib/useFireDerive";
import {
  buildPlanLevers,
  applyPlanLevers,
  PLAN_LEVER_KEYS,
  leverEffectFor,
  marginalEffectFor,
  solvePlan,
  toFindMonthly,
  STEP_UP_LEVER_NOMINAL_PERCENT,
  realStepUpPercentFor,
  DIRECT_PLAN_RETURN_UPLIFT,
  type PlanInputs,
  type PlanLever,
  type PlanLeverKey,
} from "@/lib/lever-catalog";
import { PLAN_HONESTY_LINE } from "@/lib/quick-number-copy";
import { DEFAULT_ASSUMPTIONS } from "@/types/assumptions";
import { formatINRCompact } from "@/lib/formatters";

const props = withDefaults(defineProps<{ showCommit?: boolean }>(), { showCommit: true });

const h = useHouseholdStore();
const a = useAssumptionsStore();
const ui = useUiStore();
const fire = useFireDerive();
const router = useRouter();

/** The plan every solve starts from — today's household at the hero's (possibly dragged) target. */
const basePlan = computed<PlanInputs>(() => ({
  snapshot: h.data,
  assumptions: a.values,
  lens: {
    isFamilyView: ui.isFamilyView,
    viewingMemberId: ui.viewingMemberId,
    currentFY: ui.currentFY,
  },
  targetAge: fire.heroTargetAge.value,
}));

const levers = computed<PlanLever[]>(() =>
  buildPlanLevers({ plan: basePlan.value, directPlans: ui.quick?.directPlans ?? null }),
);

// Filter against the catalog rather than casting: a stale key would otherwise survive into
// `selectedNames` and render "With : you need…" with an empty join (code-review).
const selected = computed<PlanLeverKey[]>(() =>
  (ui.whatIfLevers as PlanLeverKey[]).filter((k) => PLAN_LEVER_KEYS.includes(k)),
);

function isOn(key: PlanLeverKey): boolean {
  return selected.value.includes(key);
}

function toggle(key: PlanLeverKey) {
  const lever = levers.value.find((l) => l.key === key);
  if (!lever?.available) return; // a greyed row is inert by construction (locked by spec)
  ui.setWhatIfLevers(
    isOn(key) ? selected.value.filter((k) => k !== key) : [...selected.value, key],
  );
}

/** The baseline and the with-moves solve — the two numbers the summary line compares. */
const baseSolve = computed(() => solvePlan(basePlan.value));
/** True when today's plan cannot reach the target at ANY feasible monthly amount. */
const baselineUnreachable = computed(() => !Number.isFinite(baseSolve.value.requiredMonthlyReal));

/**
 * Per-lever effect.
 *
 * When the baseline is REACHABLE we use the mockup's semantics — each move measured ALONE against
 * the baseline ("what would THIS move save me?"), independent of what else is ticked.
 *
 * When it is NOT reachable that reading collapses: no single move gets there either, so every row
 * would report the same non-answer and the card would rank nothing (caught in the T-379 screenshot
 * review — five identical rows reading as "nothing you do matters"). There we show the MARGINAL
 * contribution instead: what adding this move changes on top of what is already ticked, which is
 * precisely the decision being made at that checkbox.
 */
const perLever = computed(() =>
  levers.value.map((lever) => ({
    lever,
    effect: !lever.available
      ? ({ kind: "none", lessToFind: 0, requiredWith: Number.NaN } as const)
      : baselineUnreachable.value
        ? marginalEffectFor(basePlan.value, levers.value, lever.key, selected.value)
        : leverEffectFor(basePlan.value, levers.value, [lever.key]),
  })),
);

const planSolve = computed(() =>
  solvePlan(applyPlanLevers(basePlan.value, levers.value, selected.value)),
);
const planTargetAge = computed(
  () => applyPlanLevers(basePlan.value, levers.value, selected.value).targetAge,
);

const anyOn = computed(() => selected.value.length > 0);
const stackedEffect = computed(() =>
  leverEffectFor(basePlan.value, levers.value, selected.value),
);
const stackedLessToFind = computed(() => stackedEffect.value.lessToFind);
/**
 * True when the moves turn an IMPOSSIBLE target into a reachable one. This is the most valuable
 * thing the card can say, and it has no rupee figure (the baseline required amount is Infinity),
 * so it gets its own line rather than being flattened to a misleading "-Rs0/mo".
 */
const isRescue = computed(() => stackedEffect.value.kind === "rescue");
/** Lower-cased short labels, as the mockup joins them ("with X + Y + Z"). */
const selectedNames = computed(() =>
  levers.value
    .filter((l) => l.available && isOn(l.key))
    .map((l) => l.label.toLowerCase().split(" — ")[0].split(" - ")[0]),
);

/**
 * "Already flowing" MUST come from the SAME solve as the required figure beside it. `trim-expenses`
 * raises the savings residual, so the baseline and the with-moves solves disagree by the trim —
 * quoting `required` from one and `flowing` from the other left a user checking
 * `required − flowing = to find` with an unaccounted rupee (code-review; the same class T-378
 * already fixed once on the hero).
 */
const currentMonthly = computed(() => planSolve.value.currentMonthlyReal);
/** The baseline's own figure — used only for the "was ₹X" comparison. */
const baseCurrentMonthly = computed(() => baseSolve.value.currentMonthlyReal);
const toFindNow = computed(() => toFindMonthly(baseSolve.value));
void baseCurrentMonthly; // reserved for the "was" comparison; keeps the two solves distinct
const toFindWithPlan = computed(() => toFindMonthly(planSolve.value));
const planReachable = computed(() => Number.isFinite(planSolve.value.requiredMonthlyReal));
/** True once the moves make today's contribution enough — the "you're already there" case. */
const alreadyEnough = computed(
  () => planReachable.value && planSolve.value.requiredMonthlyReal <= currentMonthly.value,
);

function money(v: number): string {
  return Number.isFinite(v) ? formatINRCompact(Math.max(0, Math.round(v))) : "—";
}

/**
 * "Make this my plan" — commit the ticked moves through the EXISTING store actions.
 *
 * Deliberately narrow: only the two levers that correspond to a real, persistable plan change are
 * committed (the step-up assumption and the target age). `direct-plans` is a RETURN assumption, so
 * it maps to the existing `equityReturn` override with a preferences hint rather than inventing a
 * "direct plans" field. `trim-expenses` and `no-prepay-roll-emi` are intentions about future
 * behaviour, not data — committing them would fabricate spending/liability records the user never
 * entered, so they stay what-ifs and the card says so.
 */
const committable = computed(() =>
  selected.value.filter((k) => k === "step-up-10" || k === "delay-3" || k === "direct-plans"),
);

function makeThisMyPlan() {
  if (!committable.value.length) return;
  if (committable.value.includes("step-up-10")) {
    // Idempotent by construction: max() against an absolute target, never an increment.
    a.set(
      "householdSavingsStepUpPercent",
      Math.max(
        a.values.householdSavingsStepUpPercent ?? 0,
        realStepUpPercentFor(a.values.inflation),
      ),
    );
  }
  if (committable.value.includes("direct-plans")) {
    // MUST NOT be a read-modify-write. `a.values.equityReturn + uplift` compounds on every press
    // (0.120 → 0.128 → 0.136 …) and the lever stays available afterwards on the dashboard, where
    // ui.quick is null — so a user could silently persist a 15% equity return (code-review
    // BLOCKER). Write the ABSOLUTE target off the research default instead, and record the choice
    // in ui.quick so the lever closes and the previewed number matches the committed one.
    a.set("equityReturn", DEFAULT_ASSUMPTIONS.equityReturn + DIRECT_PLAN_RETURN_UPLIFT);
    ui.setQuickPrefs({ directPlans: true });
  }
  if (committable.value.includes("delay-3")) {
    const age = planTargetAge.value;
    // Same scoping rule as the hero's "Set as my target": under a member lens write only that
    // adult's plan, never both spouses' from a button labelled with one name.
    const targets = ui.viewingMemberId
      ? h.data.members.filter((m) => m.id === ui.viewingMemberId)
      : h.earners;
    for (const m of targets) h.updateMember(m.id, { targetRetirementAge: age });
    ui.setWhatIfTargetAge(null); // the plan IS this age now — stop overriding it
  }
  ui.setWhatIfLevers([]); // the committed moves are the plan; nothing left to preview
}

function openPreferences() {
  router.push("/preferences#pref-section-returns");
}
</script>

<template>
  <section class="lever-picker" data-testid="lever-picker">
    <h3 class="lever-picker__title">How to get there — pick your moves</h3>
    <p class="lever-picker__intro">
      Nothing below is assumed by default. Switch on what you'd actually do; the hero updates.
    </p>

    <ul class="lever-list">
      <li
        v-for="row in perLever"
        :key="row.lever.key"
        class="lever"
        :class="{ 'lever--off': !row.lever.available }"
        :data-testid="`lever-${row.lever.key}`"
      >
        <v-checkbox
          :model-value="isOn(row.lever.key)"
          :disabled="!row.lever.available"
          :aria-label="row.lever.label"
          :data-testid="`lever-toggle-${row.lever.key}`"
          density="compact"
          color="primary"
          hide-details
          class="lever__box"
          @update:model-value="toggle(row.lever.key)"
        />
        <div class="lever__text">
          <div class="lever__label">{{ row.lever.label }}</div>
          <div class="lever__note">{{ row.lever.note }}</div>
        </div>
        <div class="lever__fx">
          <template v-if="row.lever.available">
            <template v-if="row.effect.kind === 'rescue'">
              <b
                class="lever__amount lever__amount--win"
                :data-testid="`lever-effect-${row.lever.key}`"
              >makes it reachable</b>
              <span class="lever__fxnote">{{ anyOn ? "added to your picks" : "on its own" }}</span>
            </template>
            <!-- The target is out of reach and THIS move alone does not fix it. Showing
                 "−₹0/mo less to find" here would read as "this move is worthless" when it is
                 in fact one of a set that together rescue the plan (rule 31). -->
            <template v-else-if="row.effect.kind === 'not-enough-alone'">
              <b
                class="lever__amount lever__amount--flat"
                :data-testid="`lever-effect-${row.lever.key}`"
              >helps, not alone</b>
              <span class="lever__fxnote">combine with others</span>
            </template>
            <template v-else>
              <b
                class="lever__amount"
                :class="row.effect.lessToFind > 0 ? 'lever__amount--win' : 'lever__amount--flat'"
                :data-testid="`lever-effect-${row.lever.key}`"
              >−{{ money(row.effect.lessToFind) }}/mo</b>
              <span class="lever__fxnote">less to find</span>
            </template>
          </template>
          <span
            v-else
            class="lever__fxnote lever__fxnote--reason"
            :data-testid="`lever-unavailable-${row.lever.key}`"
          >{{ row.lever.unavailableNote }}</span>
        </div>
      </li>
    </ul>

    <!-- Plan summary — the one sentence that says what the ticked moves change. -->
    <div class="plan-sum" data-testid="lever-plan-summary">
      <template v-if="!anyOn">
        Switch on a few moves to see the number you can actually live with.
      </template>
      <template v-else-if="!planReachable">
        Even with {{ selectedNames.join(" + ") }} this target is beyond any realistic monthly
        amount — move the retirement age above.
      </template>
      <template v-else-if="isRescue">
        With {{ selectedNames.join(" + ") }} this target becomes <b>reachable</b> — at today's pace
        alone it is not. You'd need <b>{{ money(planSolve.requiredMonthlyReal) }}/month</b> to
        retire at {{ planTargetAge }}, of which {{ money(currentMonthly) }} is already flowing.
      </template>
      <template v-else-if="alreadyEnough">
        With {{ selectedNames.join(" + ") }}: your current
        <b>{{ money(currentMonthly) }}/month</b> is enough to retire at
        <b>{{ planTargetAge }}</b>.
      </template>
      <template v-else>
        With {{ selectedNames.join(" + ") }}: you need
        <b>{{ money(planSolve.requiredMonthlyReal) }}/month</b> to retire at
        {{ planTargetAge }}<span v-if="!baselineUnreachable"> — instead of
        {{ money(baseSolve.requiredMonthlyReal) }}</span>. Of that,
        {{ money(currentMonthly) }} is already flowing; the extra to find is
        <b>{{ money(toFindWithPlan) }}/month</b><span
          v-if="stackedLessToFind > 0"
        > (was {{ money(toFindNow) }})</span>.
      </template>
    </div>

    <p class="lever-picker__honesty" data-testid="lever-honesty-line">{{ PLAN_HONESTY_LINE }}</p>

    <div v-if="props.showCommit && committable.length" class="lever-picker__commit">
      <v-btn
        color="primary"
        variant="flat"
        size="small"
        data-testid="lever-make-my-plan"
        @click="makeThisMyPlan"
      >
        Make this my plan
      </v-btn>
      <span class="lever-picker__commit-hint">
        Writes
        <template v-if="committable.includes('step-up-10')">the {{ STEP_UP_LEVER_NOMINAL_PERCENT }}%/yr step-up</template>
        <template v-if="committable.includes('step-up-10') && committable.length > 1"> and </template>
        <template v-if="committable.includes('delay-3')">your new retirement age</template>
        <template v-if="committable.includes('direct-plans')">
          <template v-if="committable.length > 1"> and </template>the direct-plan return
        </template>
        into your plan.
        <template v-if="committable.includes('direct-plans')">
          Every assumption stays editable in
          <a href="#" data-testid="lever-preferences-link" @click.prevent="openPreferences">preferences</a>.
        </template>
      </span>
    </div>
  </section>
</template>

<style scoped>
.lever-picker__title {
  font-family: var(--font-display);
  font-size: var(--type-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--space-1);
}
.lever-picker__intro {
  font-size: var(--type-sm);
  color: var(--text-muted);
  margin-bottom: var(--space-2);
}
.lever-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.lever {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) 0;
  border-top: 1px solid var(--border-subtle);
}
.lever:first-child {
  border-top: 0;
}
.lever--off {
  opacity: 0.55;
}
.lever__box {
  flex: 0 0 auto;
}
.lever__label {
  font-size: var(--type-sm);
  font-weight: var(--weight-medium);
  color: var(--text-primary);
}
.lever__note {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.35;
}
.lever__fx {
  text-align: right;
  white-space: nowrap;
}
.lever__amount {
  display: block;
  font-family: var(--font-mono, "JetBrains Mono", monospace);
  font-variant-numeric: tabular-nums;
  font-size: var(--type-sm);
}
.lever__amount--win {
  color: rgb(var(--v-theme-success));
}
.lever__amount--flat {
  color: var(--text-muted);
}
.lever__fxnote {
  font-size: 11px;
  color: var(--text-muted);
}
.lever__fxnote--reason {
  white-space: normal;
  display: inline-block;
  max-width: 180px;
  text-align: right;
}
.plan-sum {
  margin-top: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md, 8px);
  background: rgba(var(--v-theme-primary), 0.06);
  font-size: var(--type-sm);
  color: var(--text-secondary);
  line-height: 1.5;
}
.lever-picker__honesty {
  margin-top: var(--space-2);
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.45;
}
.lever-picker__commit {
  margin-top: var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.lever-picker__commit-hint {
  font-size: 11px;
  color: var(--text-muted);
}

@media (max-width: 599px) {
  .lever {
    grid-template-columns: auto 1fr;
    row-gap: var(--space-1);
  }
  .lever__fx {
    grid-column: 2;
    text-align: left;
  }
  .lever__fxnote--reason {
    text-align: left;
    max-width: none;
  }
}
</style>
