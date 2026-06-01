<script setup lang="ts">
import { ref } from "vue";
import { authClient } from "@/lib/auth-client";

/**
 * v6 login UI. Triggers Better Auth Google social sign-in; on success the browser
 * is redirected to Google, then back to `callbackURL`, where the `main.ts` boot
 * seam resolves the session (`GET /api/planner/me`) and installs ServerAuthProvider.
 * The router's onboarding guard then routes the authenticated user appropriately.
 */
const signingIn = ref(false);
const error = ref("");

async function signInWithGoogle() {
  signingIn.value = true;
  error.value = "";
  try {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: window.location.origin, // re-boot → session resolved → onboarding guard routes
    });
    // On success Better Auth redirects to Google; control does not return here.
  } catch {
    error.value = "Sign-in could not start. Please try again.";
    signingIn.value = false;
  }
}
</script>

<template>
  <v-container class="fill-height d-flex align-center justify-center">
    <v-card variant="outlined" max-width="420" class="pa-8 text-center" rounded="xl">
      <div class="text-h5 font-weight-bold mb-1">FireKaro</div>
      <div class="text-body-2 text-medium-emphasis mb-6">
        Sign in to plan your financial independence.
      </div>

      <v-btn
        :loading="signingIn"
        color="primary"
        variant="flat"
        size="large"
        block
        prepend-icon="mdi-google"
        @click="signInWithGoogle"
      >
        Sign in with Google
      </v-btn>

      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        density="compact"
        class="mt-4 text-left"
      >
        {{ error }}
      </v-alert>
    </v-card>
  </v-container>
</template>
