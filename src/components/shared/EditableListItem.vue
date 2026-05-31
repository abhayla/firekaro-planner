<script setup lang="ts" generic="T">
/**
 * Q4 (v3) — reusable list-row wrapper with edit (pencil) + delete (trash) icons.
 * Pages slot in the row's display content; this component handles the affordance icons +
 * emits typed events.
 *
 * Use:
 *   <EditableListItem :item="row" @edit="openEdit(row.id)" @delete="onDelete(row.id)">
 *     <!-- per-row display markup -->
 *   </EditableListItem>
 */
defineProps<{
  item: T;
  /** Hide the edit pencil when the row isn't editable (e.g. system-managed auto rows). */
  editable?: boolean;
  /** Hide the delete trash when the row can't be removed (e.g. only-earner). */
  deletable?: boolean;
}>();

const emit = defineEmits<{
  (e: "edit", item: T): void;
  (e: "delete", item: T): void;
}>();

function onEditClick(value: T) {
  emit("edit", value);
}
function onDeleteClick(value: T) {
  emit("delete", value);
}
</script>

<template>
  <v-list-item class="editable-row">
    <slot />
    <template #append>
      <v-btn
        v-if="editable !== false"
        icon
        variant="text"
        size="x-small"
        aria-label="Edit"
        @click="onEditClick(item)"
      >
        <v-icon icon="mdi-pencil" />
      </v-btn>
      <v-btn
        v-if="deletable !== false"
        icon
        variant="text"
        size="x-small"
        aria-label="Delete"
        @click="onDeleteClick(item)"
      >
        <v-icon icon="mdi-delete" />
      </v-btn>
    </template>
  </v-list-item>
</template>
