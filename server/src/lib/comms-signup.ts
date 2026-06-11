import { prisma } from "./prisma";
import { upsertLead } from "./zoho-crm-client";
import { firekaroUserToZohoLead } from "./zoho-lead-mapping";
import { alreadySent } from "./comms-repo";
import { triggerWelcome } from "./whatsapp-triggers";
import { logger } from "./logger";
import { notifyOwner } from "./owner-notify";

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

/**
 * Welcome-on-consent (D3): the welcome WhatsApp fires when a number is FIRST saved
 * with an un-revoked consent — NOT at OAuth signup (no number exists then). Pure
 * decision + send, deps-injectable for unit testing. Idempotent via the "welcome"
 * dedupe key (alreadySent). Best-effort — the caller must not let it break the
 * consent PUT response.
 */
export interface WelcomeTarget {
  userId: string;
  whatsappNumber: string | null;
  revoked: boolean;
  firstName: string;
}

export interface WelcomeDeps {
  alreadyWelcomed: (userId: string) => Promise<boolean>;
  fireWelcome: (t: { userId: string; toNumber: string; firstName: string }) => Promise<{ sent: boolean; reason: string }>;
}

function defaultWelcomeDeps(): WelcomeDeps {
  return {
    alreadyWelcomed: (userId) => alreadySent(userId, "welcome"),
    fireWelcome: (t) => triggerWelcome(t).then((r) => ({ sent: r.sent, reason: r.reason })),
  };
}

export async function maybeSendWelcome(
  target: WelcomeTarget,
  depsOverride: Partial<WelcomeDeps> = {},
): Promise<{ fired: boolean; reason: string }> {
  const deps = { ...defaultWelcomeDeps(), ...depsOverride };
  if (!target.whatsappNumber || target.revoked) return { fired: false, reason: "no-number-or-revoked" };
  if (await deps.alreadyWelcomed(target.userId)) return { fired: false, reason: "already-welcomed" };
  const r = await deps.fireWelcome({
    userId: target.userId,
    toNumber: target.whatsappNumber,
    firstName: target.firstName,
  });
  return { fired: r.sent, reason: r.reason };
}

export async function onUserCreated(
  user: NewUser,
  depsOverride: Partial<SignupDeps> = {},
): Promise<void> {
  const deps = { ...defaultDeps(), ...depsOverride };

  // Owner joy-ping: a real new user signed up (the early-stage signal worth
  // watching per-event). Fire-and-forget; unique dedupeKey so every signup pings.
  notifyOwner("P1", "New FireKaro signup", {
    type: "signup",
    body: user.email ?? user.name ?? user.id,
    dedupeKey: `signup:${user.id}`,
  });

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
