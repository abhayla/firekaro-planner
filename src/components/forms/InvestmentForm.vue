<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { formatINRCompact } from "@/lib/formatters";
import { canonicalizeSegments } from "@/lib/contribution-schedule";
import type { Investment, InvestmentType } from "@/types/household";
import { typeColor } from "@/lib/investment-traits";
import PanelCard from "@/components/shared/PanelCard.vue";
import EntityRow from "@/components/shared/EntityRow.vue";

const household = useHouseholdStore();

const TYPES: { value: InvestmentType; label: string; placeholder: string; allowJoint: boolean }[] = [
  { value: "Stocks", label: "Stocks", placeholder: "My equity portfolio", allowJoint: true },
  { value: "MutualFunds", label: "Mutual Funds", placeholder: "SIP basket", allowJoint: true },
  { value: "PPF", label: "PPF", placeholder: "PPF account", allowJoint: false },
  { value: "NPS", label: "NPS", placeholder: "NPS Tier-I", allowJoint: false },
  { value: "RealEstate", label: "Real Estate", placeholder: "Mumbai apartment", allowJoint: true },
  { value: "Gold", label: "Gold", placeholder: "SGB / physical / ETF", allowJoint: true },
  { value: "FD", label: "FD / Bonds", placeholder: "Emergency fund FD", allowJoint: true },
  { value: "Crypto", label: "Crypto / Other", placeholder: "Crypto wallet", allowJoint: true },
  { value: "EPF_VPF", label: "EPF · VPF (auto)", placeholder: "EPF", allowJoint: false },
  { value: "ESOP", label: "ESOP", placeholder: "Company A vested shares", allowJoint: false },
  // v5 audit Entry #18 / #20 — International equity + listed REITs (P4).
  { value: "International", label: "International Equity", placeholder: "US index FoF", allowJoint: true },
  { value: "REIT", label: "REIT", placeholder: "Embassy REIT", allowJoint: true },
];

function valueLabel(t: InvestmentType): string {
  switch (t) {
    case "PPF":
    case "EPF_VPF":
    case "NPS":
      return "Balance at FY start";
    case "FD":
      return "Current balance";
    case "ESOP":
      return "Vested value (derived)";
    default:
      return "Current market value";
  }
}

const memberOptions = computed(() => [
  ...household.members.map((m) => ({ value: m.id, label: m.name || "Earner" })),
  { value: "Joint", label: "Joint" },
]);
const earnerOptions = computed(() =>
  household.earners.map((m) => ({ value: m.id, label: m.name || "Earner" })),
);

// Q9 (v3) — per-type natural-granularity fields. Tradable types (Stocks, MutualFunds,
// Crypto, Physical Gold) auto-derive value from qty × price. Non-tradables (PPF, NPS, FD,
// RealEstate) use the existing `value` field as the stored balance / market value.
const draft = ref<{
  type: InvestmentType;
  label: string;
  value: number | null;
  monthlyContribution: number | null;
  ownerId: string;
  holdingsCount: number | null;
  vpfTopUp: number;
  // ESOP-specific (Q20B mid-fidelity)
  totalGrantValue: number | null;
  vestedPercent: number;
  // Q9 v3 per-type fields
  qty: number | null;
  pricePerShare: number | null;
  units: number | null;
  navPerUnit: number | null;
  openingYear: number | null;
  npsTier: "I" | "II";
  city: "Metro" | "Tier-1" | "Tier-2";
  ownership: "Self" | "Rented" | "Co-owned";
  purchaseYear: number | null;
  subtype: "Physical" | "SGB" | "ETF";
  grams: number | null;
  pricePerGram: number | null;
  principal: number | null;
  interestRate: number | null;
  maturityYear: number | null;
  bank: string;
  coin: string;
  pricePerCoin: number | null;
  // v5 P4 — strand-fixing fields (schema already exists in types/household.ts)
  internationalRoute: "FoF" | "LRS-Direct" | "GIFT-City";
  realEstateRole: "PrimaryResidence" | "Investment" | "Inherited";
  grantorCountry: "India" | "US" | "Other";
  exercisePrice: number | null;
  fmvAtVest: number | null;
  bucket: 1 | 2 | 3 | 4 | null;
}>({
  type: "Stocks",
  label: "",
  value: null,
  monthlyContribution: null,
  ownerId: household.earners[0]?.id ?? household.members[0]?.id ?? "you",
  holdingsCount: null,
  vpfTopUp: 0,
  totalGrantValue: null,
  vestedPercent: 0,
  qty: null,
  pricePerShare: null,
  units: null,
  navPerUnit: null,
  openingYear: null,
  npsTier: "I",
  city: "Metro",
  ownership: "Self",
  purchaseYear: null,
  subtype: "Physical",
  grams: null,
  pricePerGram: null,
  principal: null,
  interestRate: null,
  maturityYear: null,
  bank: "",
  coin: "",
  pricePerCoin: null,
  internationalRoute: "FoF",
  realEstateRole: "Investment",
  grantorCountry: "India",
  exercisePrice: null,
  fmvAtVest: null,
  bucket: null,
});

// Auto-derived value for tradable types (Stocks, MutualFunds, Crypto, Physical Gold).
const derivedTradableValue = computed<number | null>(() => {
  const t = draft.value.type;
  if (t === "Stocks" && draft.value.qty && draft.value.pricePerShare) {
    return Math.round(draft.value.qty * draft.value.pricePerShare);
  }
  if (t === "MutualFunds" && draft.value.units && draft.value.navPerUnit) {
    return Math.round(draft.value.units * draft.value.navPerUnit);
  }
  if (t === "Crypto" && draft.value.qty && draft.value.pricePerCoin) {
    return Math.round(draft.value.qty * draft.value.pricePerCoin);
  }
  if (t === "Gold" && draft.value.subtype === "Physical" && draft.value.grams && draft.value.pricePerGram) {
    return Math.round(draft.value.grams * draft.value.pricePerGram);
  }
  if (t === "Gold" && draft.value.subtype !== "Physical" && draft.value.units && draft.value.navPerUnit) {
    return Math.round(draft.value.units * draft.value.navPerUnit);
  }
  return null;
});

function placeholderForType(t: InvestmentType): string {
  return TYPES.find((x) => x.value === t)?.placeholder ?? "";
}

// v5 P4 (A8.1/A8.4) — time-horizon buckets for the SORR-aware /investments/buckets page.
const BUCKET_OPTIONS = [
  { value: null, title: "— (unbucketed)" },
  { value: 1, title: "Bucket 1 · 0–3 yr (cash/FD)" },
  { value: 2, title: "Bucket 2 · 3–10 yr (debt/hybrid)" },
  { value: 3, title: "Bucket 3 · 10–25 yr (equity)" },
  { value: 4, title: "Bucket 4 · 25+ yr (growth)" },
];
const INTL_ROUTE_OPTIONS = ["FoF", "LRS-Direct", "GIFT-City"];
const RE_ROLE_OPTIONS = [
  { value: "PrimaryResidence", title: "Primary residence (excluded from FIRE corpus)" },
  { value: "Investment", title: "Investment (counts toward corpus)" },
  { value: "Inherited", title: "Inherited" },
];
const GRANTOR_COUNTRY_OPTIONS = ["India", "US", "Other"];

watch(
  () => draft.value.type,
  (t) => {
    if (t === "EPF_VPF" || t === "ESOP") {
      const e = household.earners[0]?.id;
      if (e) draft.value.ownerId = e;
    }
    if (t !== "Stocks") draft.value.holdingsCount = null;
  },
);

// ESOP derived: vested value = totalGrant × vestedPercent / 100 per Q20B
const esopVestedValue = computed(() => {
  if (!draft.value.totalGrantValue) return 0;
  return Math.round((draft.value.totalGrantValue * draft.value.vestedPercent) / 100);
});
const esopUnvestedValue = computed(() => {
  if (!draft.value.totalGrantValue) return 0;
  return draft.value.totalGrantValue - esopVestedValue.value;
});

// Q5 (v3) — reactive validation, type-aware.
const positiveRules = [(v: number | null | undefined) => (v !== null && v !== undefined && v > 0) || "Must be > 0"];
const percentRules = [(v: number | null | undefined) => (v !== null && v !== undefined && v >= 0 && v <= 100) || "0-100"];
const isAddValid = computed(() => {
  if (draft.value.type === "ESOP") {
    return draft.value.totalGrantValue !== null && draft.value.totalGrantValue > 0 &&
      draft.value.vestedPercent >= 0 && draft.value.vestedPercent <= 100;
  }
  if (draft.value.type === "EPF_VPF") {
    return draft.value.value !== null && draft.value.value >= 0;
  }
  // Q9 v3: tradables can satisfy via derived value (qty × price) OR direct value entry.
  const effective = derivedTradableValue.value ?? draft.value.value;
  return effective !== null && effective > 0;
});
const isEditValid = computed(() => {
  if (!editing.value) return false;
  if (editing.value.type === "ESOP") {
    return Number(editing.value.totalGrantValue ?? 0) > 0 &&
      Number(editing.value.vestedPercent ?? 0) >= 0 && Number(editing.value.vestedPercent ?? 0) <= 100;
  }
  return Number(editing.value.value) > 0;
});

function addInvestment() {
  if (!isAddValid.value) return;
  if (draft.value.type === "ESOP") {
    if (!draft.value.totalGrantValue) return;
    household.addInvestment({
      type: "ESOP",
      label: draft.value.label || undefined,
      value: esopVestedValue.value,
      ownerId: draft.value.ownerId,
      totalGrantValue: Number(draft.value.totalGrantValue),
      vestedPercent: Number(draft.value.vestedPercent),
      // v5 P4 (A24.1/A24.2) — grant origin + exercise economics, feed esop-tax.ts.
      grantorCountry: draft.value.grantorCountry,
      exercisePrice: draft.value.exercisePrice !== null ? Number(draft.value.exercisePrice) : undefined,
      fmvAtVest: draft.value.fmvAtVest !== null ? Number(draft.value.fmvAtVest) : undefined,
      ...(draft.value.bucket !== null ? { bucket: draft.value.bucket } : {}),
    });
  } else if (draft.value.type === "EPF_VPF") {
    if (draft.value.value === null) return;
    const memberId = draft.value.ownerId;
    const m = household.members.find((x) => x.id === memberId);
    if (m?.salary) {
      household.updateMember(memberId, {
        salary: { ...m.salary, vpfTopUpPercent: draft.value.vpfTopUp },
      });
    }
    household.autoFlowSalaryToEPF();
    const inv = household.data.investments.find(
      (i) => i.type === "EPF_VPF" && i.ownerId === memberId,
    );
    if (inv) inv.value = Number(draft.value.value);
  } else {
    // Q9 v3 — for tradables prefer derived value (qty × price) when available; fall back
    // to the user-entered `value` so legacy add path still works.
    const value = derivedTradableValue.value ?? draft.value.value;
    if (value === null) return;
    const t = draft.value.type;
    const next: Omit<Investment, "id"> = {
      type: t,
      label: draft.value.label || undefined,
      value: Number(value),
      monthlyContribution:
        draft.value.monthlyContribution !== null && draft.value.monthlyContribution !== undefined
          ? Number(draft.value.monthlyContribution)
          : undefined,
      ownerId: draft.value.ownerId,
      holdingsCount:
        t === "Stocks" && draft.value.holdingsCount !== null
          ? Number(draft.value.holdingsCount)
          : undefined,
      // Q9 v3 per-type fields — populate the ones relevant to the chosen type
      ...(t === "Stocks" && draft.value.qty !== null
        ? { qty: Number(draft.value.qty), pricePerShare: Number(draft.value.pricePerShare ?? 0) }
        : {}),
      ...(t === "MutualFunds" && draft.value.units !== null
        ? { units: Number(draft.value.units), navPerUnit: Number(draft.value.navPerUnit ?? 0) }
        : {}),
      ...(t === "PPF" && draft.value.openingYear !== null
        ? { openingYear: Number(draft.value.openingYear) }
        : {}),
      ...(t === "NPS"
        ? {
            npsTier: draft.value.npsTier,
            openingYear:
              draft.value.openingYear !== null ? Number(draft.value.openingYear) : undefined,
          }
        : {}),
      ...(t === "RealEstate"
        ? {
            city: draft.value.city,
            ownership: draft.value.ownership,
            purchaseYear:
              draft.value.purchaseYear !== null ? Number(draft.value.purchaseYear) : undefined,
            // v5 P4 (A20.1) — role drives FIRE-corpus inclusion (Primary excluded).
            realEstateRole: draft.value.realEstateRole,
          }
        : {}),
      ...(t === "International"
        ? { internationalRoute: draft.value.internationalRoute } // v5 P4 (A18.2)
        : {}),
      // v5 P4 (A8.4) — optional time-horizon bucket; unstrands /investments/buckets.
      ...(draft.value.bucket !== null ? { bucket: draft.value.bucket } : {}),
      ...(t === "Gold"
        ? {
            subtype: draft.value.subtype,
            ...(draft.value.subtype === "Physical" && draft.value.grams !== null
              ? { grams: Number(draft.value.grams), pricePerGram: Number(draft.value.pricePerGram ?? 0) }
              : {}),
            ...(draft.value.subtype !== "Physical" && draft.value.units !== null
              ? { units: Number(draft.value.units), navPerUnit: Number(draft.value.navPerUnit ?? 0) }
              : {}),
          }
        : {}),
      ...(t === "FD"
        ? {
            principal: draft.value.principal !== null ? Number(draft.value.principal) : Number(value),
            interestRate:
              draft.value.interestRate !== null ? Number(draft.value.interestRate) : undefined,
            maturityYear:
              draft.value.maturityYear !== null ? Number(draft.value.maturityYear) : undefined,
            bank: draft.value.bank || undefined,
          }
        : {}),
      ...(t === "Crypto"
        ? {
            coin: draft.value.coin || undefined,
            qty: draft.value.qty !== null ? Number(draft.value.qty) : undefined,
            pricePerCoin:
              draft.value.pricePerCoin !== null ? Number(draft.value.pricePerCoin) : undefined,
          }
        : {}),
    };
    household.addInvestment(next);
  }
  draft.value = {
    type: draft.value.type,
    label: "",
    value: null,
    monthlyContribution: null,
    ownerId: draft.value.ownerId,
    holdingsCount: null,
    vpfTopUp: 0,
    totalGrantValue: null,
    vestedPercent: 0,
    qty: null,
    pricePerShare: null,
    units: null,
    navPerUnit: null,
    openingYear: null,
    npsTier: draft.value.npsTier,
    city: draft.value.city,
    ownership: draft.value.ownership,
    purchaseYear: null,
    subtype: draft.value.subtype,
    grams: null,
    pricePerGram: null,
    principal: null,
    interestRate: null,
    maturityYear: null,
    bank: draft.value.bank,
    coin: "",
    pricePerCoin: null,
    internationalRoute: draft.value.internationalRoute,
    realEstateRole: draft.value.realEstateRole,
    grantorCountry: draft.value.grantorCountry,
    exercisePrice: null,
    fmvAtVest: null,
    bucket: null,
  };
}

function ownerNameFor(id: string): string {
  if (id === "Joint") return "Joint";
  return household.members.find((m) => m.id === id)?.name ?? "—";
}
function typeLabelFor(t: InvestmentType): string {
  return TYPES.find((x) => x.value === t)?.label ?? t;
}

const allowJoint = computed(() => TYPES.find((x) => x.value === draft.value.type)?.allowJoint ?? true);
const ownerChoiceList = computed(() => (allowJoint.value ? memberOptions.value : earnerOptions.value));

const reTotalValue = computed(() =>
  household.data.investments
    .filter((i) => i.type === "RealEstate")
    .reduce((s, i) => s + i.value, 0),
);
const reNeedsLoanPrompt = computed(() => {
  if (reTotalValue.value < 2000000) return false;
  const hasHomeLoan = household.data.liabilities.some((l) => l.type === "HomeLoan");
  return !hasHomeLoan;
});

const derivedMonthlyForEPF = computed(() => {
  if (draft.value.type !== "EPF_VPF") return null;
  const m = household.members.find((x) => x.id === draft.value.ownerId);
  if (!m?.salary?.annualCTC) return 0;
  const basic = m.salary.annualCTC * 0.4;
  const top = draft.value.vpfTopUp / 100;
  const annual = basic * 0.12 * (1 + top) + basic * 0.12;
  return Math.round(annual / 12);
});

// Q4 (v3) — pencil-edit dialog pattern. EPF_VPF intentionally excluded — those are
// derived from salary and should be edited via the Salary screen.
const editing = ref<Investment | null>(null);
const showEdit = computed({
  get: () => !!editing.value,
  set: (v) => { if (!v) editing.value = null; },
});
// #46 — opt-in "Plan a future change" editor state (transient UI; collapsed by default).
// On save it builds the per-investment contributionSchedule (DISPLAY/PLAN metadata only —
// never corpus inflow, gh #11). Initialised from the first existing segment when editing.
const planFutureChange = ref(false);
const scheduleStepUp = ref<number>(0);
const scheduleStartAge = ref<number | null>(null);
const scheduleStopAge = ref<number | null>(null);

function startEdit(row: Investment) {
  if (row.type === "EPF_VPF") return; // not directly editable; managed by autoflow
  editing.value = { ...row };
  const seg = row.contributionSchedule?.[0];
  planFutureChange.value = !!seg;
  scheduleStepUp.value = seg?.stepUpPercentPerYear ?? 0;
  scheduleStartAge.value = seg?.startAtAge ?? null;
  scheduleStopAge.value = seg?.endAtAge ?? null;
}
const editingEsopVested = computed(() => {
  if (!editing.value || editing.value.type !== "ESOP") return 0;
  return Math.round(((editing.value.totalGrantValue ?? 0) * (editing.value.vestedPercent ?? 0)) / 100);
});
function saveEdit() {
  if (!editing.value) return;
  if (editing.value.type === "ESOP") {
    household.updateInvestment(editing.value.id, {
      label: editing.value.label || undefined,
      value: editingEsopVested.value,
      ownerId: editing.value.ownerId,
      totalGrantValue: Number(editing.value.totalGrantValue ?? 0),
      vestedPercent: Number(editing.value.vestedPercent ?? 0),
      grantorCountry: editing.value.grantorCountry,
      exercisePrice: editing.value.exercisePrice ?? undefined,
      fmvAtVest: editing.value.fmvAtVest ?? undefined,
      bucket: editing.value.bucket ?? undefined,
    });
  } else {
    const monthly =
      editing.value.monthlyContribution !== undefined && editing.value.monthlyContribution !== null
        ? Number(editing.value.monthlyContribution)
        : undefined;
    // #46 — build the opt-in plan when the user enabled it AND there's a base amount to ramp.
    // Canonicalised so a no-op re-save doesn't trip the server diff. Off ⇒ clear any prior plan
    // (scalar/default path). DISPLAY/PLAN metadata only — never corpus inflow (gh #11).
    const hasPlan =
      planFutureChange.value &&
      !!monthly &&
      monthly > 0 &&
      (scheduleStepUp.value > 0 || scheduleStartAge.value !== null || scheduleStopAge.value !== null);
    const contributionSchedule = hasPlan
      ? canonicalizeSegments([
          {
            amount: monthly as number,
            startAtAge: scheduleStartAge.value ?? 0,
            ...(scheduleStopAge.value !== null ? { endAtAge: scheduleStopAge.value } : {}),
            ...(scheduleStepUp.value > 0 ? { stepUpPercentPerYear: scheduleStepUp.value } : {}),
          },
        ])
      : undefined;
    household.updateInvestment(editing.value.id, {
      label: editing.value.label || undefined,
      value: Number(editing.value.value),
      monthlyContribution: monthly,
      ownerId: editing.value.ownerId,
      holdingsCount:
        editing.value.type === "Stocks" && editing.value.holdingsCount !== undefined
          ? Number(editing.value.holdingsCount)
          : undefined,
      realEstateRole:
        editing.value.type === "RealEstate" ? editing.value.realEstateRole : undefined,
      bucket: editing.value.bucket ?? undefined,
      contributionSchedule,
    });
  }
  editing.value = null;
}
</script>

<template>
  <div>
    <PanelCard title="Add an investment" icon="mdi-plus-circle-outline" icon-color="primary" class="mb-4">
      <v-row dense align="center">
        <v-col cols="12" md="3">
          <v-select
            v-model="draft.type"
            :items="TYPES"
            item-title="label"
            item-value="value"
            label="Type"
            density="compact"
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-text-field
            v-model="draft.label"
            label="Label (optional)"
            :placeholder="placeholderForType(draft.type)"
            density="compact"
          />
        </v-col>
        <!-- Value field — different label and binding for ESOP -->
        <v-col cols="6" md="2" v-if="draft.type !== 'ESOP'">
          <v-text-field
            v-model.number="draft.value"
            type="number"
            :label="valueLabel(draft.type) + ' *'"
            prefix="₹"
            density="compact"
            :rules="positiveRules"
          />
        </v-col>
        <v-col cols="6" md="2" v-else>
          <v-text-field
            v-model.number="draft.totalGrantValue"
            type="number"
            label="Total grant *"
            prefix="₹"
            density="compact"
            :rules="positiveRules"
          />
        </v-col>
        <!-- Secondary field: monthly contribution / VPF top-up / vested % -->
        <v-col cols="6" md="2">
          <v-text-field
            v-if="draft.type !== 'EPF_VPF' && draft.type !== 'ESOP'"
            v-model.number="draft.monthlyContribution"
            type="number"
            label="Monthly contribution"
            prefix="₹"
            density="compact"
          />
          <v-text-field
            v-else-if="draft.type === 'EPF_VPF'"
            v-model.number="draft.vpfTopUp"
            type="number"
            label="VPF top-up %"
            suffix="%"
            density="compact"
            min="0"
            max="50"
            step="0.5"
          />
          <v-text-field
            v-else
            v-model.number="draft.vestedPercent"
            type="number"
            label="Vested %"
            suffix="%"
            density="compact"
            min="0"
            max="100"
            step="5"
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-select
            v-model="draft.ownerId"
            :items="ownerChoiceList"
            item-title="label"
            item-value="value"
            label="Owner"
            density="compact"
          />
        </v-col>
        <v-col cols="6" md="3">
          <v-select
            v-model="draft.bucket"
            :items="BUCKET_OPTIONS"
            item-title="title"
            item-value="value"
            label="Horizon bucket (optional)"
            density="compact"
            data-testid="investment-bucket-select"
          />
        </v-col>
        <v-col v-if="draft.type === 'Stocks'" cols="6" md="3">
          <v-text-field
            v-model.number="draft.holdingsCount"
            type="number"
            label="# holdings"
            density="compact"
            placeholder="optional"
          />
        </v-col>
      </v-row>
      <div v-if="draft.type === 'EPF_VPF'" class="text-caption text-medium-emphasis mt-1">
        Derived monthly contribution: ~{{ formatINRCompact(derivedMonthlyForEPF ?? 0) }}/mo
        (40% of CTC as basic × 12% employee + employer × (1 + VPF top-up)).
      </div>

      <!-- v5 P4 (A24.1/A24.2) — ESOP grant details: origin country + exercise economics. -->
      <v-row v-if="draft.type === 'ESOP'" dense class="mt-1">
        <v-col cols="12" md="4">
          <v-select
            v-model="draft.grantorCountry"
            :items="GRANTOR_COUNTRY_OPTIONS"
            label="Grant country"
            density="compact"
            data-testid="esop-grantor-country"
          />
        </v-col>
        <v-col cols="6" md="4">
          <v-text-field
            v-model.number="draft.exercisePrice"
            type="number"
            label="Exercise price / share"
            prefix="₹"
            density="compact"
            data-testid="esop-exercise-price"
          />
        </v-col>
        <v-col cols="6" md="4">
          <v-text-field
            v-model.number="draft.fmvAtVest"
            type="number"
            label="FMV at vest / share"
            prefix="₹"
            density="compact"
            data-testid="esop-fmv-at-vest"
          />
        </v-col>
        <v-col cols="12" v-if="draft.grantorCountry === 'US'">
          <v-alert type="warning" density="compact" variant="tonal" class="mt-1">
            US-granted equity must be reported in Schedule FA of your ITR, and US-situs assets
            above $60,000 can attract US estate tax for Indian residents.
          </v-alert>
        </v-col>
      </v-row>

      <!-- Q9 v3 — per-type natural-granularity inputs. Optional supplements; for tradables,
           if filled in they auto-derive the value (overrides the simple Current value above). -->
      <v-expansion-panels v-if="!['ESOP','EPF_VPF'].includes(draft.type)" variant="accordion" class="mt-3">
        <v-expansion-panel title="More details (optional)">
          <template #text>
            <v-row dense v-if="draft.type === 'Stocks'">
              <v-col cols="6" md="4">
                <v-text-field v-model.number="draft.qty" type="number" label="Quantity" density="compact" />
              </v-col>
              <v-col cols="6" md="4">
                <v-text-field v-model.number="draft.pricePerShare" type="number" label="Avg price / share" prefix="₹" density="compact" />
              </v-col>
              <v-col cols="12" md="4" v-if="derivedTradableValue">
                <div class="text-caption text-medium-emphasis pt-2">
                  Derived value: <strong>{{ formatINRCompact(derivedTradableValue) }}</strong>
                </div>
              </v-col>
            </v-row>
            <v-row dense v-if="draft.type === 'MutualFunds'">
              <v-col cols="6" md="4">
                <v-text-field v-model.number="draft.units" type="number" label="Units" density="compact" />
              </v-col>
              <v-col cols="6" md="4">
                <v-text-field v-model.number="draft.navPerUnit" type="number" label="NAV / unit" prefix="₹" density="compact" />
              </v-col>
              <v-col cols="12" md="4" v-if="derivedTradableValue">
                <div class="text-caption text-medium-emphasis pt-2">
                  Derived value: <strong>{{ formatINRCompact(derivedTradableValue) }}</strong>
                </div>
              </v-col>
            </v-row>
            <v-row dense v-if="draft.type === 'PPF'">
              <v-col cols="12" md="6">
                <v-text-field v-model.number="draft.openingYear" type="number" label="Account opening year" density="compact" placeholder="e.g. 2018" />
              </v-col>
            </v-row>
            <v-row dense v-if="draft.type === 'NPS'">
              <v-col cols="6" md="4">
                <v-select v-model="draft.npsTier" :items="[{value:'I',title:'Tier I'},{value:'II',title:'Tier II'}]" item-title="title" item-value="value" label="Tier" density="compact" />
              </v-col>
              <v-col cols="6" md="4">
                <v-text-field v-model.number="draft.openingYear" type="number" label="Opening year" density="compact" placeholder="e.g. 2019" />
              </v-col>
            </v-row>
            <v-row dense v-if="draft.type === 'RealEstate'">
              <v-col cols="12" md="6">
                <v-select
                  v-model="draft.realEstateRole"
                  :items="RE_ROLE_OPTIONS"
                  item-title="title"
                  item-value="value"
                  label="Role"
                  density="compact"
                  data-testid="re-role-select"
                />
              </v-col>
              <v-col cols="6" md="3">
                <v-select v-model="draft.city" :items="['Metro','Tier-1','Tier-2']" label="City tier" density="compact" />
              </v-col>
              <v-col cols="6" md="3">
                <v-select v-model="draft.ownership" :items="['Self','Rented','Co-owned']" label="Ownership" density="compact" />
              </v-col>
              <v-col cols="6" md="4">
                <v-text-field v-model.number="draft.purchaseYear" type="number" label="Purchase year" density="compact" />
              </v-col>
              <v-col cols="12" v-if="draft.realEstateRole === 'Investment'">
                <v-alert type="info" density="compact" variant="tonal" class="mt-1">
                  Investment real estate is illiquid in FIRE planning — a sale takes months and the
                  price is uncertain. It counts toward your corpus but can't be drawn down quickly.
                </v-alert>
              </v-col>
            </v-row>
            <v-row dense v-if="draft.type === 'International'">
              <v-col cols="12" md="6">
                <v-select
                  v-model="draft.internationalRoute"
                  :items="INTL_ROUTE_OPTIONS"
                  label="Investment route"
                  density="compact"
                  data-testid="intl-route-select"
                />
              </v-col>
              <v-col cols="12">
                <v-alert type="info" density="compact" variant="tonal" class="mt-1">
                  LRS-Direct and GIFT-City routes count toward the ₹25 lakh/yr LRS cap and attract
                  20% TCS above ₹10 lakh (claimable against tax). FoF (Indian mutual fund) avoids
                  both — simplest for most households.
                </v-alert>
              </v-col>
            </v-row>
            <v-row dense v-if="draft.type === 'Gold'">
              <v-col cols="6" md="3">
                <v-select v-model="draft.subtype" :items="['Physical','SGB','ETF']" label="Form" density="compact" />
              </v-col>
              <template v-if="draft.subtype === 'Physical'">
                <v-col cols="6" md="3">
                  <v-text-field v-model.number="draft.grams" type="number" label="Grams" density="compact" />
                </v-col>
                <v-col cols="6" md="3">
                  <v-text-field v-model.number="draft.pricePerGram" type="number" label="Price/gram" prefix="₹" density="compact" />
                </v-col>
              </template>
              <template v-else>
                <v-col cols="6" md="3">
                  <v-text-field v-model.number="draft.units" type="number" label="Units / bonds" density="compact" />
                </v-col>
                <v-col cols="6" md="3">
                  <v-text-field v-model.number="draft.navPerUnit" type="number" label="NAV / unit" prefix="₹" density="compact" />
                </v-col>
              </template>
              <v-col cols="12" md="3" v-if="derivedTradableValue">
                <div class="text-caption text-medium-emphasis pt-2">
                  Derived: <strong>{{ formatINRCompact(derivedTradableValue) }}</strong>
                </div>
              </v-col>
            </v-row>
            <v-row dense v-if="draft.type === 'FD'">
              <v-col cols="6" md="3">
                <v-text-field v-model.number="draft.principal" type="number" label="Principal" prefix="₹" density="compact" />
              </v-col>
              <v-col cols="6" md="3">
                <v-text-field v-model.number="draft.interestRate" type="number" label="Interest %" suffix="%" step="0.1" density="compact" />
              </v-col>
              <v-col cols="6" md="3">
                <v-text-field v-model.number="draft.maturityYear" type="number" label="Maturity year" density="compact" />
              </v-col>
              <v-col cols="6" md="3">
                <v-text-field v-model="draft.bank" label="Bank" density="compact" placeholder="HDFC / SBI" />
              </v-col>
            </v-row>
            <v-row dense v-if="draft.type === 'Crypto'">
              <v-col cols="6" md="3">
                <v-text-field v-model="draft.coin" label="Coin" density="compact" placeholder="BTC / ETH / SOL" />
              </v-col>
              <v-col cols="6" md="3">
                <v-text-field v-model.number="draft.qty" type="number" label="Quantity" density="compact" />
              </v-col>
              <v-col cols="6" md="3">
                <v-text-field v-model.number="draft.pricePerCoin" type="number" label="Price / coin" prefix="₹" density="compact" />
              </v-col>
              <v-col cols="12" md="3" v-if="derivedTradableValue">
                <div class="text-caption text-medium-emphasis pt-2">
                  Derived: <strong>{{ formatINRCompact(derivedTradableValue) }}</strong>
                </div>
              </v-col>
            </v-row>
          </template>
        </v-expansion-panel>
      </v-expansion-panels>
      <div v-if="draft.type === 'ESOP' && draft.totalGrantValue" class="text-caption text-medium-emphasis mt-1">
        Vested value (counted in corpus): <strong>{{ formatINRCompact(esopVestedValue) }}</strong>
        · Unvested (informational, excluded from projection): {{ formatINRCompact(esopUnvestedValue) }}
      </div>
      <div class="text-right mt-2">
        <v-btn size="small" variant="flat" color="primary" :disabled="!isAddValid" @click="addInvestment">
          <v-icon icon="mdi-plus" class="mr-1" /> Add investment
        </v-btn>
      </div>
    </PanelCard>

    <v-alert
      v-if="reNeedsLoanPrompt"
      type="info"
      density="compact"
      variant="tonal"
      class="mb-3"
      closable
    >
      Do you have an outstanding loan on your Real Estate ({{ formatINRCompact(reTotalValue) }} added)? Add it on the Liabilities step so we can model the EMI + interest correctly.
    </v-alert>

    <template v-if="household.data.investments.length">
      <div class="section-eyebrow">Your holdings</div>
      <PanelCard>
        <EntityRow
          v-for="i in household.data.investments"
          :key="i.id"
          :title="i.label || typeLabelFor(i.type)"
          :value="formatINRCompact(i.value)"
          :accent="typeColor(i.type)"
        >
          <template #leading>
            <v-chip size="x-small" variant="tonal" :color="typeColor(i.type)">{{ typeLabelFor(i.type) }}</v-chip>
          </template>
          <template #meta>
            <span>Owner: {{ ownerNameFor(i.ownerId) }}</span>
            <span v-if="i.monthlyContribution"> · +{{ formatINRCompact(i.monthlyContribution) }}/mo</span>
            <span v-if="i.holdingsCount"> · {{ i.holdingsCount }} holdings</span>
            <span v-if="i.type === 'ESOP' && i.totalGrantValue"> · {{ i.vestedPercent }}% vested of {{ formatINRCompact(i.totalGrantValue) }}</span>
            <span
              v-if="i.contributionSchedule?.[0]?.stepUpPercentPerYear"
              class="text-primary"
              data-testid="contribution-plan-indicator"
            >
              · planned +{{ i.contributionSchedule[0].stepUpPercentPerYear }}%/yr
            </span>
          </template>
          <template #trailing>
            <v-btn v-if="i.type !== 'EPF_VPF'" icon size="x-small" variant="text" aria-label="Edit" @click="startEdit(i)">
              <v-icon icon="mdi-pencil" />
            </v-btn>
            <v-btn icon size="x-small" variant="text" aria-label="Delete" @click="household.removeInvestment(i.id)">
              <v-icon icon="mdi-delete" />
            </v-btn>
          </template>
        </EntityRow>
      </PanelCard>
    </template>

    <v-dialog v-model="showEdit" max-width="800" persistent>
      <v-card v-if="editing">
        <v-card-title>Edit investment</v-card-title>
        <v-divider />
        <v-card-text style="max-height: 70vh; overflow-y: auto">
          <v-row dense>
            <v-col cols="12" md="6">
              <v-text-field v-model="editing.label" label="Label" density="comfortable" />
            </v-col>
            <v-col cols="12" md="6">
              <v-select v-model="editing.ownerId" :items="memberOptions" item-title="label" item-value="value" label="Owner" density="comfortable" />
            </v-col>
            <template v-if="editing.type === 'ESOP'">
              <v-col cols="6" md="6">
                <v-text-field v-model.number="editing.totalGrantValue" type="number" label="Total grant *" prefix="₹" density="comfortable" :rules="positiveRules" />
              </v-col>
              <v-col cols="6" md="6">
                <v-text-field v-model.number="editing.vestedPercent" type="number" label="Vested % *" suffix="%" density="comfortable" min="0" max="100" step="5" :rules="percentRules" />
              </v-col>
              <v-col cols="12" md="4">
                <v-select v-model="editing.grantorCountry" :items="GRANTOR_COUNTRY_OPTIONS" label="Grant country" density="comfortable" />
              </v-col>
              <v-col cols="6" md="4">
                <v-text-field v-model.number="editing.exercisePrice" type="number" label="Exercise price / share" prefix="₹" density="comfortable" />
              </v-col>
              <v-col cols="6" md="4">
                <v-text-field v-model.number="editing.fmvAtVest" type="number" label="FMV at vest / share" prefix="₹" density="comfortable" />
              </v-col>
              <v-col cols="12">
                <div class="text-caption text-medium-emphasis">
                  Vested value (counted in corpus): <strong>{{ formatINRCompact(editingEsopVested) }}</strong>
                </div>
              </v-col>
            </template>
            <template v-else>
              <v-col cols="6" md="6">
                <v-text-field v-model.number="editing.value" type="number" label="Current value *" prefix="₹" density="comfortable" :rules="positiveRules" />
              </v-col>
              <v-col cols="6" md="6">
                <v-text-field v-model.number="editing.monthlyContribution" type="number" label="Monthly contribution (optional)" prefix="₹" density="comfortable" />
              </v-col>
              <v-col v-if="editing.type === 'Stocks'" cols="6" md="6">
                <v-text-field v-model.number="editing.holdingsCount" type="number" label="# holdings (optional)" density="comfortable" />
              </v-col>
              <v-col v-if="editing.type === 'RealEstate'" cols="12" md="6">
                <v-select v-model="editing.realEstateRole" :items="RE_ROLE_OPTIONS" item-title="title" item-value="value" label="Role" density="comfortable" />
              </v-col>
              <!-- #46 — opt-in "Plan a future change": step-up % + optional start/stop age. -->
              <v-col cols="12">
                <v-switch
                  v-model="planFutureChange"
                  color="primary"
                  density="compact"
                  hide-details
                  label="Plan a future change to this contribution"
                  data-testid="plan-future-change-toggle"
                />
                <v-expand-transition>
                  <div v-if="planFutureChange" class="mt-1">
                    <v-row dense>
                      <v-col cols="12" md="4">
                        <v-text-field
                          v-model.number="scheduleStepUp"
                          type="number"
                          label="Annual step-up"
                          suffix="%"
                          density="comfortable"
                          min="0"
                          max="15"
                          step="1"
                          hint="Real, above inflation (max 15)"
                          persistent-hint
                          data-testid="plan-stepup-field"
                        />
                      </v-col>
                      <v-col cols="6" md="4">
                        <v-text-field
                          v-model.number="scheduleStartAge"
                          type="number"
                          label="Starts at age (optional)"
                          density="comfortable"
                          placeholder="now"
                          data-testid="plan-start-age-field"
                        />
                      </v-col>
                      <v-col cols="6" md="4">
                        <v-text-field
                          v-model.number="scheduleStopAge"
                          type="number"
                          label="Stops at age (optional)"
                          density="comfortable"
                          placeholder="never"
                          data-testid="plan-stop-age-field"
                        />
                      </v-col>
                    </v-row>
                    <div class="text-caption text-medium-emphasis">
                      A plan for this holding — shown on its card. It does not change your headline
                      FIRE date (only your overall savings rate does).
                    </div>
                  </div>
                </v-expand-transition>
              </v-col>
            </template>
            <v-col cols="12" md="6">
              <v-select v-model="editing.bucket" :items="BUCKET_OPTIONS" item-title="title" item-value="value" label="Horizon bucket (optional)" density="comfortable" data-testid="edit-bucket-select" />
            </v-col>
          </v-row>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="outlined" @click="editing = null">Cancel</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!isEditValid" @click="saveEdit">
            <v-icon icon="mdi-content-save" class="mr-1" />
            Save changes
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
