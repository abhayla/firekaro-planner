<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { useUiStore } from "@/stores/ui";
import SidebarLayout from "@/layouts/SidebarLayout.vue";
import CommandPalette from "@/components/command-palette/CommandPalette.vue";

const ui = useUiStore();
const cmdkOpen = ref(false);

function onGlobalKeydown(e: KeyboardEvent) {
  // Cmd-K / Ctrl-K opens palette
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    cmdkOpen.value = true;
    return;
  }
  // `/` opens palette when not focused in an input
  if (e.key === "/" && !cmdkOpen.value) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault();
    cmdkOpen.value = true;
  }
}

onMounted(() => {
  ui.hydrate();
  window.addEventListener("keydown", onGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
});

const isDemo = computed(() => true);
</script>

<template>
  <v-app>
    <router-view v-slot="{ Component, route }">
      <transition name="page" mode="out-in" appear>
        <SidebarLayout v-if="route.meta?.layout === 'sidebar'" :key="route.path">
          <component :is="Component" />
        </SidebarLayout>
        <component v-else :is="Component" :key="route.path" />
      </transition>
    </router-view>

    <v-chip
      v-if="isDemo"
      size="x-small"
      color="warning"
      variant="flat"
      class="demo-chip"
    >
      [DEMO]
    </v-chip>

    <!-- v4 Stage E — Cmd-K command palette (global; opens on Cmd-K / Ctrl-K / `/`) -->
    <CommandPalette v-model="cmdkOpen" />
  </v-app>
</template>

<style scoped>
.demo-chip {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 9999;
  font-weight: 600;
  letter-spacing: 0.05em;
}
</style>
