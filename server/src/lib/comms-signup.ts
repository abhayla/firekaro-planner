import { prisma } from "./prisma";
import { upsertLead } from "./zoho-crm-client";
import { firekaroUserToZohoLead } from "./zoho-lead-mapping";
import { logger } from "./logger";

/**
 * Signup side-effects: when a new FireKaro user is created (Better Auth
 * databaseHooks.user.create.after), seed a default WhatsApp consent row (marketing
 * OFF — DPDP opt-in is explicit) and sync a minimal lead to the PIFS Zoho CRM.
 * BOTH are best-effort — a CRM/DB hiccup must NEVER break the signup flow.
 */

export interface NewUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

export interface SignupDeps {
  createDefaultConsent: (userId: string) => Promise<void>;
  syncLead: (user: NewUser) => Promise<{ ok: boolean }>;
}

function defaultDeps(): SignupDeps {
  return {
    createDefaultConsent: async (userId) => {
      await prisma.commsConsent.upsert({
        where: { userId_channel: { userId, channel: "whatsapp" } },
        create: { userId, channel: "whatsapp", marketingOptIn: false },
        update: {},
      });
    },
    syncLead: async (user) =>
      upsertLead(firekaroUserToZohoLead({ name: user.name, email: user.email })),
  };
}

export async function onUserCreated(
  user: NewUser,
  depsOverride: Partial<SignupDeps> = {},
): Promise<void> {
  const deps = { ...defaultDeps(), ...depsOverride };

  try {
    await deps.createDefaultConsent(user.id);
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "default consent seed failed");
  }

  try {
    const r = await deps.syncLead(user);
    if (!r.ok) logger.warn({ userId: user.id }, "Zoho lead sync returned not-ok on signup");
  } catch (e) {
    logger.warn({ err: e instanceof Error ? e.message : String(e) }, "Zoho lead sync failed on signup");
  }
}
