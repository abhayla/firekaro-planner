import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { makeAdapter } from "@/lib/storage-adapter";
import { getAuthProvider } from "@/lib/auth-provider";

// Storage now routes through @/lib/storage-adapter — namespaced by userId per ADR-0001.
const ENTITY_KEY = "ui";

interface UiPersistedShape {
  isFamilyView?: boolean;
  viewingMemberId?: string | null;
  currentFY?: string;
}

// Q10.1 (v3) — dark mode removed. darkMode field dropped from this store; older
// localStorage shapes are tolerated by hydrate (extra keys are simply ignored).
export const useUiStore = defineStore("ui", () => {
  const isFamilyView = ref(false);
  const viewingMemberId = ref<string | null>(null);
  const currentFY = ref("2026-27");
  const adapter = makeAdapter(getAuthProvider());

  function hydrate() {
    const parsed = adapter.get<UiPersistedShape>(ENTITY_KEY);
    if (parsed) {
      if (typeof parsed.isFamilyView === "boolean") isFamilyView.value = parsed.isFamilyView;
      if (typeof parsed.viewingMemberId === "string") viewingMemberId.value = parsed.viewingMemberId;
      if (typeof parsed.currentFY === "string") currentFY.value = parsed.currentFY;
    }
  }

  function persist() {
    adapter.set<UiPersistedShape>(ENTITY_KEY, {
      isFamilyView: isFamilyView.value,
      viewingMemberId: viewingMemberId.value,
      currentFY: currentFY.value,
    });
  }

  watch([isFamilyView, viewingMemberId, currentFY], persist, { deep: true });

  function toggleFamilyView() {
    isFamilyView.value = !isFamilyView.value;
  }
  function setViewingMemberId(id: string | null) {
    viewingMemberId.value = id;
  }
  function setCurrentFY(fy: string) {
    currentFY.value = fy;
  }

  return {
    isFamilyView,
    viewingMemberId,
    currentFY,
    hydrate,
    toggleFamilyView,
    setViewingMemberId,
    setCurrentFY,
  };
});
