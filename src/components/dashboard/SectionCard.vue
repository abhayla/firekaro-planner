<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import Sparkline from "@/components/shared/Sparkline.vue";
import DeltaChip from "@/components/shared/DeltaChip.vue";

const props = defineProps<{
  title: string;
  headline: string;
  subLine?: string;
  icon: string;
  color?: string;
  route: string;
  status?: "ok" | "warn" | "info";
  delta?: number;
  deltaFormat?: "currency" | "percent" | "raw";
  invertColors?: boolean;
  sparklineData?: number[];
}>();

const router = useRouter();

function open() {
  router.push(props.route);
}

const statusColor = computed(() => {
  if (props.status === "ok") return "success";
  if (props.status === "warn") return "warning";
  return undefined;
});

const sparklineColor = computed(() => {
  if (props.color === "success") return "var(--color-success)";
  if (props.color === "error") return "var(--color-error)";
  if (props.color === "warning") return "var(--color-warning)";
  if (props.color === "info") return "var(--color-info)";
  if (props.color === "fire-orange") return "var(--color-warning)";
  return "var(--color-primary)";
});
</script>

<template>
  <v-card
    variant="outlined"
    class="section-card lift-on-hover interactive-card pa-4 h-100"
    @click="open"
  >
    <div class="d-flex align-center mb-2">
      <v-icon :icon="icon" :color="color ?? 'primary'" size="22" class="mr-2" />
      <span class="text-subtitle-2 section-card__title flex-grow-1">{{ title }}</span>
      <v-chip
        v-if="statusColor"
        size="x-small"
        :color="statusColor"
        variant="tonal"
        class="mr-1"
      >
        {{ status }}
      </v-chip>
      <v-icon icon="mdi-chevron-right" size="small" class="section-card__chevron" />
    </div>
    <div class="d-flex align-end justify-space-between ga-2">
      <div class="flex-grow-1 min-w-0">
        <div class="section-card__headline text-currency">{{ headline }}</div>
        <div class="d-flex align-center ga-2 mt-1 flex-wrap">
          <DeltaChip
            v-if="delta !== undefined"
            :value="delta"
            :format="deltaFormat ?? 'percent'"
            :invert-colors="invertColors ?? false"
          />
          <div v-if="subLine" class="section-card__sub">{{ subLine }}</div>
        </div>
      </div>
      <Sparkline
        v-if="sparklineData && sparklineData.length"
        :data="sparklineData"
        :width="60"
        :height="28"
        :color="sparklineColor"
        :fill="true"
      />
    </div>
  </v-card>
</template>

<style scoped>
.section-card {
  cursor: pointer;
}

.section-card__title {
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  font-size: 11px;
}

.section-card__chevron {
  color: var(--text-muted);
}

.section-card__headline {
  font-size: var(--type-xl);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-tight);
  color: var(--text-primary);
  line-height: var(--leading-tight);
}

.section-card__sub {
  font-size: var(--type-xs);
  color: var(--text-muted);
}
</style>
