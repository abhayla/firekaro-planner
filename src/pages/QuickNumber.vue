<script setup lang="ts">
/**
 * T-378 (QN-1) — `/quick`, the express front door: ten conversational cards, then one honest
 * number. Design SSOT: docs/design/2026-08-27-quick-number-gap-hero/option-c-merged.html.
 *
 * WHY THIS EXISTS: a new user could not get a FIRE number out of FireKaro in three minutes — the
 * seven-step wizard is thorough and slow, which is the right trade for refinement and the wrong one
 * for a first answer. `/quick` is the first answer; the wizard becomes "refine your plan".
 *
 * NO SIDE STORE: finishing writes REAL household data through `applyQuickAnswers` and sets the
 * EXISTING `wizardCompleted` flag (the quick path IS setup). The only quick-specific state is the
 * `ui.quick` metadata blob (gut feel, when, which rows we own, direct-plans) which rides the
 * existing `ui` document — no schema change anywhere.
 */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import QuickCard from "@/components/quick/QuickCard.vue";
import LakhInput from "@/components/quick/LakhInput.vue";
import QuickResult from "@/components/quick/QuickResult.vue";
import {
  QUICK_CARDS,
  sanityLine,
  overCommitmentWarning,
  SO_FAR_PLACEHOLDER,
} from "@/lib/quick-number-copy";
import { applyQuickAnswers, quickAnswersFromHousehold } from "@/lib/quick-number";
import { emptyQuickAnswers, type QuickAnswersDraft } from "@/types/quick-number";
import { useHouseholdStore } from "@/stores/household";
import { useAssumptionsStore } from "@/stores/assumptions";
import { useFeaturesStore } from "@/stores/features";
import { useUiStore } from "@/stores/ui";
import { derive } from "@/lib/derive";
import { formatINRCompact } from "@/lib/formatters";

const router = useRouter();
const household = useHouseholdStore();
const assumptions = useAssumptionsStore();
const features = useFeaturesStore();
const ui = useUiStore();

household.hydrate();
assumptions.hydrate();
features.hydrate();
ui.hydrate();

const CR = 1e7;
// Re-entering /quick must never start blank over a real plan: ten clicks of Next would then
// overwrite it with zeros (code-review H2). Everything the express path wrote carries a stable
// `quick-` id, so the previous answers are recoverable from the household itself.
const answers = ref<QuickAnswersDraft>(
  quickAnswersFromHousehold(household.data, ui.quick?.guess) ?? emptyQuickAnswers(),
);
/** Set when the user tries to finish without the one answer the whole number rests on. */
const blockedReason = ref("");
const step = ref(0);
const showResult = ref(false);
/** Recomputed only on card change — the preview must never cost a kernel run per keystroke. */
const soFar = ref(SO_FAR_PLACEHOLDER);

const card = computed(() => QUICK_CARDS[step.value]);
const isLast = computed(() => step.value === QUICK_CARDS.length - 1);

const GUESS_CHIPS: readonly [number, string][] = [
  [5 * CR, "₹5 Cr"],
  [10 * CR, "₹10 Cr"],
  [15 * CR, "₹15 Cr"],
  [20 * CR, "₹20 Cr"],
  [30 * CR, "₹30 Cr+"],
];
const KID_CHIPS: readonly number[] = [0, 1, 2, 3];
const DIRECT_CHIPS: readonly [boolean | null, string][] = [
  [true, "Direct"],
  [false, "Regular"],
  [null, "Not sure"],
];

const sanity = computed(() =>
  sanityLine(
    answers.value.spend ?? 0,
    answers.value.sip ?? 0,
    answers.value.income ?? 0,
    answers.value.hasLoan ? (answers.value.emi ?? 0) : 0,
  ),
);

/**
 * T-378C F3 — by the LAST card the SIP (card 5) and EMI (card 10) are both known, unlike card 3
 * where `sanity` above is blind to both. This is the guard that can actually fire.
 */
const overCommitted = computed(() =>
  overCommitmentWarning(
    answers.value.spend ?? 0,
    answers.value.sip ?? 0,
    answers.value.income ?? 0,
    answers.value.hasLoan ? (answers.value.emi ?? 0) : 0,
  ),
);

/** Card 9's live "it moves your date by…" hint — the mockup's delta line, honestly sourced. */
const purchaseDelta = computed(() => {
  if (!answers.value.includeHouse || !(answers.value.house ?? 0)) return "Not counted yet.";
  const withIt = previewNeed(answers.value);
  const without = previewNeed({ ...answers.value, includeHouse: false });
  if (withIt == null || without == null) return "Counted — it raises the number you need.";
  return `Counted — it adds ${formatINRCompact(Math.max(0, withIt - without))} to the number you need.`;
});

function previewNeed(a: QuickAnswersDraft): number | null {
  try {
    const { household: hh } = applyQuickAnswers(
      JSON.parse(JSON.stringify(household.data)),
      a,
      { assumptions: assumptions.values, solveSalary: false },
    );
    const k = derive(hh, assumptions.values, {
      isFamilyView: false,
      viewingMemberId: null,
      currentFY: ui.currentFY,
    });
    return Number.isFinite(k.fireNumber) && k.fireNumber > 0 ? k.fireNumber : null;
  } catch (err) {
    // Never silent: a kernel throw during intake would otherwise leave the strip on its
    // placeholder forever with no signal at all (error-handling.md).
    console.warn("[quick] preview kernel run failed", err);
    return null;
  }
}

function refreshSoFar() {
  if (step.value < 3 || !(answers.value.spend > 0)) {
    soFar.value = SO_FAR_PLACEHOLDER;
    return;
  }
  const need = previewNeed(answers.value);
  soFar.value = need
    ? `So far, to retire at ${answers.value.targetAge} you'd need ${formatINRCompact(need)} in today's money.`
    : SO_FAR_PLACEHOLDER;
}

function onNext() {
  if (isLast.value) {
    finish();
    return;
  }
  step.value += 1;
  refreshSoFar();
}

function onBack() {
  if (step.value === 0) {
    router.push({ name: "splash" });
    return;
  }
  step.value -= 1;
  refreshSoFar();
}

function finish() {
  // Spending is the one answer the FIRE number cannot be computed without. Refusing here is what
  // stops a half-finished re-run from zeroing a real plan (code-review H2).
  if (!(answers.value.spend > 0)) {
    blockedReason.value =
      "We need your monthly spending before we can give you a number — it is what the whole plan is sized against.";
    step.value = QUICK_CARDS.findIndex((c) => c.key === "spend");
    return;
  }
  blockedReason.value = "";
  const result = applyQuickAnswers(household.data, answers.value, {
    assumptions: assumptions.values,
    previousCreatedIds: ui.quick?.createdIds,
  });
  household.replaceAll(result.household);
  // The store owns these two effects; re-running them over rows we already wrote is a no-op
  // (same ids), and it keeps the express path on exactly one auto-flow implementation.
  household.autoFlowEMIToRecurring();
  household.autoFlowSalaryToEPF();
  household.markProfileComplete();
  household.markWizardComplete();
  features.markWizardCompleted();
  ui.setQuickPrefs({
    guess: answers.value.guess,
    completedAt: new Date().toISOString(),
    createdIds: result.createdIds,
    // Only a definite "Direct" gates the QN-5 fee lever off — "not sure" must not silently
    // remove a move the user might still be able to make.
    directPlans: answers.value.directPlans === true,
  });
  showResult.value = true;
  window.scrollTo({ top: 0 });
}

function editAnswers() {
  showResult.value = false;
  step.value = 0;
  refreshSoFar();
}
</script>

<template>
  <v-container tag="main" aria-label="Quick FIRE number" class="quick-page" fluid>
    <v-row justify="center">
      <v-col cols="12" md="10" lg="8" xl="7">
        <template v-if="!showResult">
          <header class="mb-4">
            <h1 class="text-h5 font-weight-bold font-display">Let's find your number</h1>
            <p class="text-body-2 text-medium-emphasis">
              Ten quick questions, money in lakh. Rough is fine — you can refine anything later.
            </p>
          </header>

          <QuickCard
            :question="card.question"
            :hint="card.hint"
            :step="step"
            :total="QUICK_CARDS.length"
            :is-last="isLast"
            @next="onNext"
            @back="onBack"
          >
            <!-- 1 · gut feel -->
            <div v-if="card.key === 'guess'" class="d-flex flex-wrap ga-2">
              <v-chip
                v-for="[value, label] in GUESS_CHIPS"
                :key="label"
                :color="answers.guess === value ? 'fire-orange' : undefined"
                :variant="answers.guess === value ? 'flat' : 'outlined'"
                :data-testid="`quick-guess-${value}`"
                @click="answers.guess = value"
              >
                {{ label }}
              </v-chip>
            </div>

            <!-- 2 · you -->
            <v-row v-else-if="card.key === 'you'" dense>
              <v-col cols="6">
                <v-text-field
                  v-model.number="answers.age"
                  label="Your age"
                  type="number"
                  variant="outlined"
                  density="comfortable"
                  hide-details
                  data-testid="quick-age"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model.number="answers.targetAge"
                  label="Retire at"
                  type="number"
                  variant="outlined"
                  density="comfortable"
                  hide-details
                  data-testid="quick-target-age"
                />
              </v-col>
            </v-row>

            <!-- 3 · spend + take-home -->
            <div v-else-if="card.key === 'spend'">
              <LakhInput
                v-model="answers.spend"
                label="Monthly spending"
                testid="quick-spend"
              />
              <div class="mt-4">
                <LakhInput
                  v-model="answers.income"
                  label="Household take-home per month"
                  testid="quick-income"
                />
              </div>
              <v-alert
                v-if="sanity"
                type="info"
                variant="tonal"
                density="compact"
                class="mt-4"
                data-testid="quick-sanity"
              >
                {{ sanity }}
              </v-alert>
            </div>

            <!-- 4 · all investments -->
            <div v-else-if="card.key === 'corpus'">
              <LakhInput v-model="answers.corpus" label="Total investments" testid="quick-corpus" />
              <div class="text-body-2 mt-4 mb-2">Are your mutual funds direct plans?</div>
              <div class="d-flex flex-wrap ga-2">
                <v-chip
                  v-for="[value, label] in DIRECT_CHIPS"
                  :key="label"
                  :color="answers.directPlans === value ? 'primary' : undefined"
                  :variant="answers.directPlans === value ? 'flat' : 'outlined'"
                  :data-testid="`quick-direct-${label.toLowerCase().replace(' ', '-')}`"
                  @click="answers.directPlans = value"
                >
                  {{ label }}
                </v-chip>
              </div>
            </div>

            <!-- 5 · monthly investing -->
            <LakhInput
              v-else-if="card.key === 'sip'"
              v-model="answers.sip"
              label="Invested every month"
              testid="quick-sip"
            />

            <!-- 6 · spouse -->
            <div v-else-if="card.key === 'spouse'">
              <v-switch
                v-model="answers.includeSpouse"
                color="primary"
                density="compact"
                hide-details
                label="I have a spouse with investments"
                data-testid="quick-spouse-toggle"
              />
              <LakhInput
                v-if="answers.includeSpouse"
                v-model="answers.spouseCorpus"
                label="Spouse's total investments"
                testid="quick-spouse-corpus"
              />
            </div>

            <!-- 7 · kids -->
            <div v-else-if="card.key === 'kids'">
              <div class="d-flex flex-wrap ga-2">
                <v-chip
                  v-for="count in KID_CHIPS"
                  :key="count"
                  :color="answers.kids === count ? 'fire-orange' : undefined"
                  :variant="answers.kids === count ? 'flat' : 'outlined'"
                  :data-testid="`quick-kids-${count}`"
                  @click="answers.kids = count"
                >
                  {{ count }}
                </v-chip>
              </div>
              <v-text-field
                v-if="(answers.kids ?? 0) > 0"
                v-model.number="answers.kidsAge"
                label="Their age"
                type="number"
                variant="outlined"
                density="comfortable"
                hide-details
                class="mt-4"
                data-testid="quick-kids-age"
              />
            </div>

            <!-- 8 · kids' big costs -->
            <div v-else-if="card.key === 'goals'">
              <LakhInput
                v-model="answers.education"
                label="Undergrad, all kids"
                testid="quick-education"
              />
              <div class="mt-4">
                <LakhInput
                  v-model="answers.postgrad"
                  label="Post-grad, if any"
                  testid="quick-postgrad"
                />
              </div>
              <div class="mt-4">
                <LakhInput
                  v-model="answers.wedding"
                  label="Weddings, all kids"
                  testid="quick-wedding"
                />
              </div>
            </div>

            <!-- 9 · big purchase -->
            <div v-else-if="card.key === 'house'">
              <v-switch
                v-model="answers.includeHouse"
                color="primary"
                density="compact"
                hide-details
                label="Count a big purchase"
                data-testid="quick-house-toggle"
              />
              <template v-if="answers.includeHouse">
                <LakhInput v-model="answers.house" label="Net cost today" testid="quick-house" />
                <v-text-field
                  v-model.number="answers.houseInYears"
                  label="In how many years?"
                  type="number"
                  variant="outlined"
                  density="comfortable"
                  hide-details
                  class="mt-4"
                  data-testid="quick-house-years"
                />
              </template>
              <p class="text-caption text-medium-emphasis mt-3" data-testid="quick-house-delta">
                {{ purchaseDelta }}
              </p>
            </div>

            <!-- 10 · home loan -->
            <div v-else-if="card.key === 'loan'">
              <v-switch
                v-model="answers.hasLoan"
                color="primary"
                density="compact"
                hide-details
                label="I have a home loan"
                data-testid="quick-loan-toggle"
              />
              <template v-if="answers.hasLoan">
                <LakhInput v-model="answers.emi" label="Monthly EMI" testid="quick-emi" />
                <v-row dense class="mt-2">
                  <v-col cols="6">
                    <v-text-field
                      :model-value="Math.round((answers.loanRate ?? 0) * 1000) / 10"
                      label="Interest rate (%)"
                      type="number"
                      step="0.1"
                      variant="outlined"
                      density="comfortable"
                      hide-details
                      data-testid="quick-loan-rate"
                      @update:model-value="answers.loanRate = (Number($event) || 0) / 100"
                    />
                  </v-col>
                  <v-col cols="6">
                    <v-text-field
                      v-model.number="answers.loanYearsLeft"
                      label="Years left"
                      type="number"
                      variant="outlined"
                      density="comfortable"
                      hide-details
                      data-testid="quick-loan-years"
                    />
                  </v-col>
                </v-row>
              </template>
              <v-alert
                v-if="overCommitted"
                type="warning"
                variant="tonal"
                density="compact"
                class="mt-4"
                data-testid="quick-overcommit-warning"
              >
                {{ overCommitted }}
              </v-alert>
            </div>
          </QuickCard>

          <v-alert
            v-if="blockedReason"
            type="warning"
            variant="tonal"
            density="compact"
            class="mt-4"
            data-testid="quick-blocked"
          >
            {{ blockedReason }}
          </v-alert>

          <p class="text-caption text-medium-emphasis mt-4" data-testid="quick-so-far">
            {{ soFar }}
          </p>
        </template>

        <QuickResult v-else :answers="answers" @edit="editAnswers" />
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.quick-page {
  padding-top: 32px;
  padding-bottom: 48px;
}
</style>
