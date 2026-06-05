<script setup lang="ts">
import { computed, ref } from "vue";
import { isAdultRole, type MemberDraft, type MemberRole } from "@/types/household";
import { ageFromDOB, dobFromAge } from "@/lib/age";
import { validateMemberHorizon, type HorizonIssue } from "@/lib/member-horizon";
import EmptyState from "@/components/shared/EmptyState.vue";

const members = defineModel<MemberDraft[]>("members", { required: true });

// Per-card expand state. Cards are a clean roster at rest; the editable field grid
// reveals on click. Newly-added people auto-expand so they can be filled.
const expandedIds = ref<Set<string>>(new Set());
function isExpanded(id: string): boolean {
  return expandedIds.value.has(id);
}
function toggleExpand(id: string): void {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

// Per-member colour coding (family-hub pattern) — each person gets a stable hue so
// they're individually identifiable. Role is conveyed by section + avatar badge.
const PALETTE = ["primary", "fire-orange", "success", "info", "secondary", "fire-blue", "warning", "fire-gold"];
function memberColor(id: string): string {
  const idx = members.value.findIndex((m) => m.id === id);
  return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
}
function colorVars(id: string) {
  const c = memberColor(id);
  return {
    "--accent": `rgb(var(--v-theme-${c}))`,
    "--accent-tint": `rgba(var(--v-theme-${c}), 0.07)`,
    "--accent-tint-2": `rgba(var(--v-theme-${c}), 0.14)`,
  };
}

// Q2.1 — role-aware defaults for the 6 onboarding fields. Earners: Married + Employed
// (matches India median household). Dependents: Single + Preschool stage (children).
function defaultsForRole(role: MemberRole) {
  if (role === "EARNER") {
    return {
      city: "Metro" as const,
      health: "Healthy" as const,
      educationStage: null,
      riskAppetite: "Moderate" as const,
      marital: "Married" as const,
      employmentStatus: "Employed" as const,
    };
  }
  if (role === "NON_EARNING_ADULT") {
    // gh #34: homemaker / non-earning spouse — adult, no education stage, no job.
    return {
      city: "Metro" as const,
      health: "Healthy" as const,
      educationStage: null,
      riskAppetite: "Conservative" as const,
      marital: "Married" as const,
      employmentStatus: null,
    };
  }
  return {
    city: "Metro" as const,
    health: "Healthy" as const,
    educationStage: "Preschool" as const,
    riskAppetite: "Conservative" as const,
    marital: "Single" as const,
    employmentStatus: null,
  };
}

function defaultName(role: MemberRole): string {
  if (role === "EARNER") return "Earner";
  if (role === "NON_EARNING_ADULT") return "Spouse";
  return "Dependent";
}

function addPerson(role: MemberRole) {
  const id = crypto.randomUUID().slice(0, 8);
  const adult = isAdultRole(role);
  members.value.push({
    id,
    name: defaultName(role),
    dateOfBirth: dobFromAge(adult ? 30 : 5),
    role,
    targetRetirementAge: role === "EARNER" ? 50 : null,
    // gh #34: a non-earning adult has a plan-to age (longevity to fund); a child does not.
    planToAge: adult ? 90 : null,
    relation: role === "EARNER" ? "" : role === "NON_EARNING_ADULT" ? "Spouse" : "Child",
    ...defaultsForRole(role),
  });
  expandedIds.value = new Set(expandedIds.value).add(id);
}

function removeAt(idx: number) {
  members.value.splice(idx, 1);
}

const earners = computed(() => members.value.filter((m) => m.role === "EARNER"));
const nonEarningAdults = computed(() => members.value.filter((m) => m.role === "NON_EARNING_ADULT"));
const dependents = computed(() => members.value.filter((m) => m.role === "DEPENDENT"));
const earnerCount = computed(() => earners.value.length);
const nonEarningAdultCount = computed(() => nonEarningAdults.value.length);
const dependentCount = computed(() => dependents.value.length);

// Initials for the identity avatar — up to two letters, derived from the name field.
function initials(name: string): string {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return "?";
}

interface SummaryItem {
  icon: string;
  label: string;
}
function earnerSummary(m: MemberDraft): SummaryItem[] {
  return [
    { icon: "mdi-beach", label: m.targetRetirementAge ? `Retires ${m.targetRetirementAge}` : "Retirement —" },
    { icon: "mdi-map-marker-outline", label: m.city },
    { icon: "mdi-briefcase-outline", label: m.employmentStatus ?? "—" },
    { icon: "mdi-chart-line-variant", label: `${m.riskAppetite} risk` },
    { icon: "mdi-heart-pulse", label: m.health },
    { icon: "mdi-ring", label: m.marital },
  ];
}
function dependentSummary(m: MemberDraft): SummaryItem[] {
  return [
    { icon: "mdi-school-outline", label: m.educationStage ?? "—" },
    { icon: "mdi-map-marker-outline", label: m.city },
    { icon: "mdi-heart-pulse", label: m.health },
  ];
}
function nonEarningAdultSummary(m: MemberDraft): SummaryItem[] {
  return [
    { icon: "mdi-timeline-clock-outline", label: m.planToAge ? `Plan to ${m.planToAge}` : "Plan-to —" },
    { icon: "mdi-map-marker-outline", label: m.city },
    { icon: "mdi-heart-pulse", label: m.health },
    { icon: "mdi-ring", label: m.marital },
  ];
}

// A5.x — horizon sanity validation. Earners only; blocks plan-to ≤ retire and
// horizon < 5, soft-warns horizon < 20 / > 60 and retirement < 35. The horizon
// chip on the Dashboard is the read-only display; this is the editing-time guard.
function horizonIssues(m: MemberDraft): HorizonIssue[] {
  if (m.role !== "EARNER") return [];
  return validateMemberHorizon({
    retirementAge: m.targetRetirementAge,
    planToAge: m.planToAge,
  });
}

const cityItems = [
  { title: "Metro (Mumbai/Delhi/Bangalore/etc.)", value: "Metro" },
  { title: "Tier-1 (Pune/Hyderabad/Chennai/etc.)", value: "Tier-1" },
  { title: "Tier-2 (smaller cities)", value: "Tier-2" },
];
const healthItems = [
  { title: "Healthy", value: "Healthy" },
  { title: "Chronic condition", value: "Chronic" },
  { title: "Special needs", value: "Special" },
];
const eduItems = [
  { title: "Preschool", value: "Preschool" },
  { title: "Primary", value: "Primary" },
  { title: "Secondary", value: "Secondary" },
  { title: "College", value: "College" },
];
const riskItems = [
  { title: "Conservative", value: "Conservative" },
  { title: "Moderate", value: "Moderate" },
  { title: "Aggressive", value: "Aggressive" },
];
const maritalItems = [
  { title: "Single", value: "Single" },
  { title: "Married", value: "Married" },
  { title: "Divorced", value: "Divorced" },
  { title: "Widowed", value: "Widowed" },
];
const employmentItems = [
  { title: "Employed", value: "Employed" },
  { title: "Self-employed", value: "Self-employed" },
  { title: "Contract", value: "Contract" },
  { title: "Business-owner", value: "Business-owner" },
];
</script>

<template>
  <div>
    <!-- ───── Earners ───── -->
    <div class="section-head">
      <span class="section-eyebrow">Earners</span>
      <span class="section-count">{{ earnerCount }}</span>
      <v-spacer />
      <v-btn size="small" color="primary" variant="tonal" rounded="lg" @click="addPerson('EARNER')">
        <v-icon icon="mdi-plus" class="mr-1" /> Add earner
      </v-btn>
    </div>

    <div v-if="earnerCount" class="person-grid">
      <div
        v-for="(m, idx) in earners"
        :key="m.id"
        class="person-card"
        :class="{ 'person-card--open': isExpanded(m.id) }"
        :style="{ ...colorVars(m.id), '--enter-delay': `${idx * 45}ms` }"
      >
        <div class="person-card__head" @click="toggleExpand(m.id)">
          <div class="person-card__avatar-wrap">
            <v-avatar size="46" class="person-card__avatar">
              <span class="person-card__initials">{{ initials(m.name) }}</span>
            </v-avatar>
            <span class="person-card__badge"><v-icon icon="mdi-account-tie" size="12" /></span>
          </div>
          <div class="person-card__id" @click.stop>
            <v-text-field
              v-model="m.name"
              variant="plain"
              density="compact"
              hide-details
              aria-label="Name"
              placeholder="Name"
              class="person-card__name-input"
            />
            <div class="person-card__role">Earner</div>
          </div>
          <v-chip size="small" variant="tonal" :color="memberColor(m.id)" class="person-card__age">
            Age {{ ageFromDOB(m.dateOfBirth) }}
          </v-chip>
          <v-btn
            icon
            variant="text"
            size="small"
            class="person-card__chevron"
            :aria-label="isExpanded(m.id) ? 'Collapse details' : 'Edit details'"
            @click.stop="toggleExpand(m.id)"
          >
            <v-icon :icon="isExpanded(m.id) ? 'mdi-chevron-up' : 'mdi-pencil-outline'" />
          </v-btn>
          <v-btn
            icon
            variant="text"
            size="small"
            :aria-label="`Remove ${m.name || 'earner'}`"
            @click.stop="removeAt(members.indexOf(m))"
          >
            <v-icon icon="mdi-delete-outline" />
          </v-btn>
        </div>

        <div v-if="!isExpanded(m.id)" class="person-card__summary">
          <span v-for="(s, i) in earnerSummary(m)" :key="i" class="summary-chip">
            <v-icon :icon="s.icon" size="13" />{{ s.label }}
          </span>
        </div>

        <v-expand-transition>
          <v-row v-if="isExpanded(m.id)" dense class="person-card__fields">
            <v-col cols="6" md="3">
              <v-text-field v-model="m.dateOfBirth" type="date" label="Date of birth" prepend-inner-icon="mdi-cake-variant-outline" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model.number="m.targetRetirementAge" type="number" label="Target retirement age" prepend-inner-icon="mdi-beach" variant="outlined" density="comfortable" hide-details min="30" max="80" data-testid="member-retire-age" />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model.number="m.planToAge" type="number" label="Plan-to age" prepend-inner-icon="mdi-timeline-clock-outline" variant="outlined" density="comfortable" hide-details min="50" max="110" data-testid="member-plan-to-age" />
            </v-col>
            <v-col cols="6" md="3">
              <v-select v-model="m.city" :items="cityItems" label="City tier" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <v-col cols="6" md="3">
              <v-select v-model="m.employmentStatus" :items="employmentItems" label="Employment" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <!-- A5.x — inline horizon sanity messages (blocking + soft-warn). -->
            <v-col v-if="horizonIssues(m).length" cols="12">
              <v-alert
                v-for="(issue, i) in horizonIssues(m)"
                :key="i"
                :type="issue.level === 'error' ? 'error' : 'warning'"
                variant="tonal"
                density="compact"
                class="mb-1"
                :data-testid="`member-horizon-${issue.level}`"
              >
                {{ issue.message }}
              </v-alert>
            </v-col>
            <v-col cols="12" sm="4">
              <v-select v-model="m.riskAppetite" :items="riskItems" label="Risk appetite" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <v-col cols="12" sm="4">
              <v-select v-model="m.health" :items="healthItems" label="Health" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <v-col cols="12" sm="4">
              <v-select v-model="m.marital" :items="maritalItems" label="Marital status" variant="outlined" density="comfortable" hide-details />
            </v-col>
          </v-row>
        </v-expand-transition>
      </div>
    </div>

    <EmptyState
      v-else
      icon="mdi-account-tie-outline"
      title="No earners yet"
      copy="Add at least one earner — their salary, age and target retirement age drive every income, tax and FIRE projection."
      cta-label="Add an earner"
      cta-icon="mdi-account-plus"
      @cta="addPerson('EARNER')"
    />

    <!-- ───── Non-earning adults (gh #34 — homemaker / non-earning spouse) ───── -->
    <div class="section-head mt-6">
      <span class="section-eyebrow">Non-earning adults</span>
      <span class="section-count">{{ nonEarningAdultCount }}</span>
      <v-spacer />
      <v-btn size="small" color="secondary" variant="tonal" rounded="lg" @click="addPerson('NON_EARNING_ADULT')">
        <v-icon icon="mdi-plus" class="mr-1" /> Add non-earning adult
      </v-btn>
    </div>

    <div v-if="nonEarningAdultCount" class="person-grid">
      <div
        v-for="(m, idx) in nonEarningAdults"
        :key="m.id"
        class="person-card"
        :class="{ 'person-card--open': isExpanded(m.id) }"
        :style="{ ...colorVars(m.id), '--enter-delay': `${idx * 45}ms` }"
      >
        <div class="person-card__head" @click="toggleExpand(m.id)">
          <div class="person-card__avatar-wrap">
            <v-avatar size="46" class="person-card__avatar">
              <span class="person-card__initials">{{ initials(m.name) }}</span>
            </v-avatar>
            <span class="person-card__badge"><v-icon icon="mdi-account-heart-outline" size="12" /></span>
          </div>
          <div class="person-card__id" @click.stop>
            <v-text-field
              v-model="m.name"
              variant="plain"
              density="compact"
              hide-details
              aria-label="Name"
              placeholder="Name"
              class="person-card__name-input"
            />
            <div class="person-card__role">{{ m.relation || "Non-earning adult" }}</div>
          </div>
          <v-chip size="small" variant="tonal" :color="memberColor(m.id)" class="person-card__age">
            Age {{ ageFromDOB(m.dateOfBirth) }}
          </v-chip>
          <v-btn
            icon
            variant="text"
            size="small"
            class="person-card__chevron"
            :aria-label="isExpanded(m.id) ? 'Collapse details' : 'Edit details'"
            @click.stop="toggleExpand(m.id)"
          >
            <v-icon :icon="isExpanded(m.id) ? 'mdi-chevron-up' : 'mdi-pencil-outline'" />
          </v-btn>
          <v-btn
            icon
            variant="text"
            size="small"
            :aria-label="`Remove ${m.name || 'non-earning adult'}`"
            @click.stop="removeAt(members.indexOf(m))"
          >
            <v-icon icon="mdi-delete-outline" />
          </v-btn>
        </div>

        <div v-if="!isExpanded(m.id)" class="person-card__summary">
          <span v-for="(s, i) in nonEarningAdultSummary(m)" :key="i" class="summary-chip">
            <v-icon :icon="s.icon" size="13" />{{ s.label }}
          </span>
        </div>

        <v-expand-transition>
          <v-row v-if="isExpanded(m.id)" dense class="person-card__fields">
            <v-col cols="6" md="3">
              <v-text-field v-model="m.dateOfBirth" type="date" label="Date of birth" prepend-inner-icon="mdi-cake-variant-outline" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model.number="m.planToAge" type="number" label="Plan-to age" prepend-inner-icon="mdi-timeline-clock-outline" variant="outlined" density="comfortable" hide-details min="50" max="110" data-testid="non-earning-plan-to-age" />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model="m.relation" label="Relation" prepend-inner-icon="mdi-account-heart-outline" variant="outlined" density="comfortable" hide-details placeholder="Spouse / Parent / …" />
            </v-col>
            <v-col cols="6" md="3">
              <v-select v-model="m.city" :items="cityItems" label="City tier" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <v-col cols="12" sm="4">
              <v-select v-model="m.riskAppetite" :items="riskItems" label="Risk appetite" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <v-col cols="12" sm="4">
              <v-select v-model="m.health" :items="healthItems" label="Health" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <v-col cols="12" sm="4">
              <v-select v-model="m.marital" :items="maritalItems" label="Marital status" variant="outlined" density="comfortable" hide-details />
            </v-col>
          </v-row>
        </v-expand-transition>
      </div>
    </div>

    <!-- ───── Dependents ───── -->
    <div class="section-head mt-6">
      <span class="section-eyebrow">Dependents</span>
      <span class="section-count">{{ dependentCount }}</span>
      <v-spacer />
      <v-btn size="small" color="fire-orange" variant="tonal" rounded="lg" @click="addPerson('DEPENDENT')">
        <v-icon icon="mdi-plus" class="mr-1" /> Add dependent
      </v-btn>
    </div>

    <div v-if="dependentCount" class="person-grid">
      <div
        v-for="(m, idx) in dependents"
        :key="m.id"
        class="person-card"
        :class="{ 'person-card--open': isExpanded(m.id) }"
        :style="{ ...colorVars(m.id), '--enter-delay': `${idx * 45}ms` }"
      >
        <div class="person-card__head" @click="toggleExpand(m.id)">
          <div class="person-card__avatar-wrap">
            <v-avatar size="46" class="person-card__avatar">
              <span class="person-card__initials">{{ initials(m.name) }}</span>
            </v-avatar>
            <span class="person-card__badge"><v-icon icon="mdi-baby-face-outline" size="12" /></span>
          </div>
          <div class="person-card__id" @click.stop>
            <v-text-field
              v-model="m.name"
              variant="plain"
              density="compact"
              hide-details
              aria-label="Name"
              placeholder="Name"
              class="person-card__name-input"
            />
            <div class="person-card__role">{{ m.relation || "Dependent" }}</div>
          </div>
          <v-chip size="small" variant="tonal" :color="memberColor(m.id)" class="person-card__age">
            Age {{ ageFromDOB(m.dateOfBirth) }}
          </v-chip>
          <v-btn
            icon
            variant="text"
            size="small"
            class="person-card__chevron"
            :aria-label="isExpanded(m.id) ? 'Collapse details' : 'Edit details'"
            @click.stop="toggleExpand(m.id)"
          >
            <v-icon :icon="isExpanded(m.id) ? 'mdi-chevron-up' : 'mdi-pencil-outline'" />
          </v-btn>
          <v-btn
            icon
            variant="text"
            size="small"
            :aria-label="`Remove ${m.name || 'dependent'}`"
            @click.stop="removeAt(members.indexOf(m))"
          >
            <v-icon icon="mdi-delete-outline" />
          </v-btn>
        </div>

        <div v-if="!isExpanded(m.id)" class="person-card__summary">
          <span v-for="(s, i) in dependentSummary(m)" :key="i" class="summary-chip">
            <v-icon :icon="s.icon" size="13" />{{ s.label }}
          </span>
        </div>

        <v-expand-transition>
          <v-row v-if="isExpanded(m.id)" dense class="person-card__fields">
            <v-col cols="6" md="3">
              <v-text-field v-model="m.dateOfBirth" type="date" label="Date of birth" prepend-inner-icon="mdi-cake-variant-outline" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field v-model="m.relation" label="Relation" prepend-inner-icon="mdi-account-heart-outline" variant="outlined" density="comfortable" hide-details placeholder="Child / Parent / …" />
            </v-col>
            <v-col cols="6" md="2">
              <v-select v-model="m.city" :items="cityItems" label="City tier" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <v-col cols="6" md="2">
              <v-select v-model="m.educationStage" :items="eduItems" label="Education stage" variant="outlined" density="comfortable" hide-details />
            </v-col>
            <v-col cols="12" md="2">
              <v-select v-model="m.health" :items="healthItems" label="Health" variant="outlined" density="comfortable" hide-details />
            </v-col>
          </v-row>
        </v-expand-transition>
      </div>
    </div>

    <EmptyState
      v-if="dependentCount === 0"
      icon="mdi-account-child-outline"
      title="No dependents added"
      copy="Add children or parents you support — their education stage, health, and city tier shape the cost projections you'll see on every dashboard."
    />
  </div>
</template>

<style scoped>
.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.section-eyebrow {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.section-count {
  font-family: "JetBrains Mono", monospace;
  font-size: 0.72rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.4);
  background: rgba(var(--v-theme-on-surface), 0.06);
  border-radius: 999px;
  padding: 1px 8px;
  font-variant-numeric: tabular-nums;
}

/* 2-up on desktop; an expanded card spans the full row for its field grid. */
.person-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  grid-auto-flow: dense;
}
@media (min-width: 960px) {
  .person-grid { grid-template-columns: 1fr 1fr; }
}

.person-card {
  --accent: rgb(var(--v-theme-primary));
  --accent-tint: rgba(var(--v-theme-primary), 0.07);
  --accent-tint-2: rgba(var(--v-theme-primary), 0.14);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-left: 4px solid var(--accent);
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
  overflow: hidden;
  transition: box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease;
  animation: card-enter 260ms ease both;
  animation-delay: var(--enter-delay, 0ms);
}
@keyframes card-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}
.person-card--open { grid-column: 1 / -1; box-shadow: 0 12px 30px -16px rgba(0, 0, 0, 0.28); }
/* Collapsed rows are clickable — lift + deepen the band on hover to signal "edit". */
.person-card:not(.person-card--open):hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px -16px rgba(0, 0, 0, 0.3);
  border-color: rgba(var(--v-theme-on-surface), 0.14);
}
.person-card:not(.person-card--open):hover .person-card__head { background: var(--accent-tint-2); }

.person-card__head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px 12px 18px;
  background: var(--accent-tint);
  cursor: pointer;
  transition: background 150ms ease;
}
.person-card__avatar-wrap {
  position: relative;
  flex: 0 0 auto;
}
.person-card__avatar {
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 62%, white)) !important;
  box-shadow: 0 0 0 3px var(--accent-tint-2);
}
.person-card__badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 19px;
  height: 19px;
  border-radius: 50%;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.person-card__badge :deep(.v-icon) { color: var(--accent); }
.person-card__initials {
  font-weight: 800;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
  color: #fff;
}
.person-card__id { flex: 1 1 auto; min-width: 0; cursor: text; }
.person-card__name-input { margin-top: -6px; }
.person-card__name-input :deep(input) {
  font-weight: 800;
  font-size: 1.15rem;
  letter-spacing: -0.01em;
  color: rgba(var(--v-theme-on-surface), 0.95);
}
.person-card__role {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
  margin-top: -2px;
}
.person-card__age { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.person-card__chevron :deep(.v-icon) { color: var(--accent) !important; }

.person-card__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 18px 14px;
}
.summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.72);
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 8px;
  padding: 4px 10px;
}
.summary-chip :deep(.v-icon) { color: var(--accent); opacity: 0.85; }

.person-card__fields {
  padding: 14px 18px 18px;
  animation: fields-reveal 220ms ease both;
}
@keyframes fields-reveal {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .person-card,
  .person-card__head { transition: none; }
  .person-card:not(.person-card--open):hover { transform: none; }
  .person-card,
  .person-card__fields { animation: none; }
}
</style>
