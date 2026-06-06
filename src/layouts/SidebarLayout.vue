<script setup lang="ts">
import { ref, watch } from "vue";
import { useDisplay } from "vuetify";
import SidebarNav from "@/layouts/SidebarNav.vue";
import AppBar from "@/layouts/AppBar.vue";
import TaxStalenessBanner from "@/components/shared/TaxStalenessBanner.vue";

// Below the md breakpoint (<960px) the 260px sidebar collapses to a temporary
// overlay drawer toggled by the app-bar hamburger; on desktop it stays a
// permanent rail. drawer state tracks the breakpoint so it opens on desktop
// and starts closed on narrow viewports.
const { smAndDown } = useDisplay();
const drawer = ref(!smAndDown.value);
watch(smAndDown, (narrow) => {
  drawer.value = !narrow;
});
</script>

<template>
  <v-layout class="sidebar-layout">
    <v-navigation-drawer
      v-model="drawer"
      :permanent="!smAndDown"
      :temporary="smAndDown"
      width="260"
    >
      <SidebarNav />
    </v-navigation-drawer>
    <v-app-bar density="compact" flat color="surface">
      <v-app-bar-nav-icon
        v-if="smAndDown"
        aria-label="Toggle navigation"
        @click="drawer = !drawer"
      />
      <AppBar />
    </v-app-bar>
    <v-main>
      <main aria-label="Main content">
        <TaxStalenessBanner />
        <slot />
      </main>
    </v-main>
  </v-layout>
</template>

<style scoped>
.sidebar-layout {
  min-height: 100vh;
}
</style>
