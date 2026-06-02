import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { onUserCreated } from "./comms-signup";
import { logger } from "./logger";

/**
 * Better Auth — copy-adapted from the root app's server/lib/auth.ts, pointed at
 * firekaro_v6. Google sign-in + 7-day sessions; every record keyed by the real
 * userId. A user.create.after hook seeds default comms consent + syncs a minimal
 * lead to the PIFS Zoho CRM (both best-effort — never block signup).
 */
export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Fire-and-forget: signup must not wait on or fail due to CRM/consent.
          void onUserCreated({ id: user.id, email: user.email, name: user.name }).catch((e) =>
            logger.warn({ err: e instanceof Error ? e.message : String(e) }, "onUserCreated failed"),
          );
        },
      },
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  trustedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:5175"],
});
