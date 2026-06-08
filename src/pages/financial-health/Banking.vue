<script setup lang="ts">
import { computed } from "vue";
import { useHouseholdStore } from "@/stores/household";
import { useFireDerive } from "@/lib/useFireDerive";
import { formatINRCompact } from "@/lib/formatters";
import { isEmergencyFundEligible } from "@/lib/investment-traits";
import EmptyState from "@/components/shared/EmptyState.vue";
import LeafPageHeader from "@/components/income-layout/LeafPageHeader.vue";
import MetricCard from "@/components/shared/MetricCard.vue";
import PanelCard from "@/components/shared/PanelCard.vue";
import EntityRow from "@/components/shared/EntityRow.vue";
import MemberLensBadge from "@/components/shared/MemberLensBadge.vue";

const household = useHouseholdStore();
const fire = useFireDerive();

// "Banking" = liquid-asset slice of investments (FD + Cash & Other tagged liquid). #81 Phase 3:
// member-LENSED — reads the SAME-SCOPE resolver's split-scoped list (member-owned at 100% + Joint at
// the household split %), so a selected adult sees only THEIR share of liquid — coherent with the
// Emergency-Fund / Net-Worth figures (one Joint convention). Default lens = full household (byte-identical).
const liquidAssets = computed(() =>
  fire.memberFinancials.value.scopedInvestments.filter(isEmergencyFundEligible),
);
const totalLiquid = computed(() => liquidAssets.value.reduce((s, i) => s + i.value, 0));

function ownerNameFor(id: string): string {
  if (id === "Joint") return "Joint";
  return household.members.find((m) => m.id === id)?.name ?? "—";
}
</script>

<template>
  <v-container fluid class="py-6 banking-page">
    <LeafPageHeader
      eyebrow="Financial Health · Banking"
      title="Banking"
      description="Liquid assets — what you can reach in days. Reuses the FD and Cash entries from Investments → Holdings."
    >
      <template #actions>
        <MemberLensBadge />
      </template>
    </LeafPageHeader>

    <v-row dense class="mb-1">
      <v-col cols="12" sm="6" md="4">
        <MetricCard
          icon="mdi-bank-outline"
          icon-color="primary"
          label="Total liquid assets"
          :value="formatINRCompact(totalLiquid)"
          :footnote="`across ${liquidAssets.length} entr${liquidAssets.length === 1 ? 'y' : 'ies'}`"
        />
      </v-col>
    </v-row>

    <template v-if="liquidAssets.length > 0">
      <div class="section-eyebrow">Your liquid assets</div>
      <PanelCard>
        <EntityRow
          v-for="i in liquidAssets"
          :key="i.id"
          :title="i.label || i.type"
          :value="formatINRCompact(i.value)"
          :accent="i.type === 'FD' ? 'info' : 'secondary'"
        >
          <template #leading>
            <v-chip size="x-small" variant="tonal" :color="i.type === 'FD' ? 'info' : 'secondary'">
              {{ i.type === "FD" ? "FD/Bonds" : "Cash/Other" }}
            </v-chip>
          </template>
          <template #meta>Owner: {{ ownerNameFor(i.ownerId) }}</template>
        </EntityRow>
      </PanelCard>
    </template>

    <EmptyState
      v-else
      icon="mdi-bank-outline"
      title="No liquid assets yet"
      copy="Add FDs, savings, or money-market entries on Investments → Holdings. They feed your emergency-fund coverage and FIRE liquidity buffer."
      cta-label="Open Holdings"
      cta-route="/investments/holdings"
    />
  </v-container>
</template>

<style scoped>
.banking-page {
  max-width: 1280px;
}
</style>
