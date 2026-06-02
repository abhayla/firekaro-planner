import { ref } from "vue";

/**
 * DPDP comms-consent composable — reads/writes the signed-in user's WhatsApp
 * consent via `/api/comms/consent` (the backend built this session). Follows the
 * ServerAdapter call convention: explicit base URL + `credentials: "include"` for
 * the session cookie + the dev-bypass header in dev. Used by the Preferences
 * "Notifications" section. Two flags map to the consent model: base channel consent
 * (un-revoked) gates utility alerts; marketingOptIn gates the marketing nudges.
 */

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3100";
const devBypass = String(import.meta.env.VITE_DEV_BYPASS) === "true";

function buildHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["content-type"] = "application/json";
  if (devBypass) h["x-dev-bypass"] = "true";
  return h;
}

interface ConsentRow {
  channel: string;
  marketingOptIn: boolean;
  revokedAt: string | null;
}

export function useCommsConsent() {
  const whatsappEnabled = ref(false); // base consent: a whatsapp row exists + not revoked
  const marketingOptIn = ref(false);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  function apply(wa: ConsentRow | undefined) {
    whatsappEnabled.value = !!wa && !wa.revokedAt;
    marketingOptIn.value = !!wa?.marketingOptIn;
  }

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${baseUrl}/api/comms/consent`, {
        credentials: "include",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: ConsentRow[] };
      apply((body.data ?? []).find((r) => r.channel === "whatsapp"));
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load preferences";
    } finally {
      loading.value = false;
    }
  }

  async function save() {
    saving.value = true;
    error.value = null;
    try {
      const res = await fetch(`${baseUrl}/api/comms/consent`, {
        method: "PUT",
        credentials: "include",
        headers: buildHeaders(true),
        body: JSON.stringify({
          channel: "whatsapp",
          marketingOptIn: marketingOptIn.value,
          revoked: !whatsappEnabled.value,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: ConsentRow };
      apply(body.data);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to save preferences";
    } finally {
      saving.value = false;
    }
  }

  /** Toggling WhatsApp off also clears the marketing opt-in. */
  async function onWhatsappToggle() {
    if (!whatsappEnabled.value) marketingOptIn.value = false;
    await save();
  }

  return {
    whatsappEnabled,
    marketingOptIn,
    loading,
    saving,
    error,
    load,
    save,
    onWhatsappToggle,
  };
}
