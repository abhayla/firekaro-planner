import { nextTick, ref, type Ref } from "vue";

/**
 * #69 — shared mechanism for every inline "Add X" block that binds Vuetify `:rules`
 * to its draft fields and resets the draft after a successful add.
 *
 * Vuetify's `v-text-field`/`v-select` validate on every value change once a field has been
 * touched. Resetting a draft ref back to "" / null after `addX()` succeeds counts as a value
 * change, so a touched field re-validates against its now-empty value and shows a stale
 * "required" / "must be > 0" error on a form the user just used correctly. Calling
 * `resetValidation()` synchronously right after the draft reset runs BEFORE Vue has flushed the
 * reactive update that triggers Vuetify's own re-validation watcher, so that re-validation fires
 * afterwards and immediately re-shows the error. Waiting a `nextTick()` first lets the draft's
 * empty values reach the DOM, then `resetValidation()` clears the validation state that the
 * update just set — leaving `validate()` on submit/blur untouched, so a genuinely empty required
 * field still errors normally.
 */
export function useInlineAddForm() {
  const addForm: Ref<{ resetValidation: () => void } | null> = ref(null);

  async function resetAfterAdd() {
    await nextTick();
    addForm.value?.resetValidation();
  }

  return { addForm, resetAfterAdd };
}
