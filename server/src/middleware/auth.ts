import type { Context, Next } from "hono";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { apiError } from "../lib/api-utils";

/**
 * Auth middleware — copy-adapted from the root app's server/middleware/auth.ts.
 * Resolves the session userId (or the dev-bypass user) and puts it on the
 * context. userId comes ONLY from here, NEVER from a request body.
 *
 * 3-factor dev-bypass (rules/dev-bypass-auth.md): NODE_ENV!=='production' +
 * DEV_BYPASS_AUTH==='true' + the `x-dev-bypass: true` header — all three.
 * v6 dev user is dev@firekaro-v6.local (distinct from the root app's
 * dev@firekaro.local so the two never collide).
 */

declare module "hono" {
  interface ContextVariableMap {
    userId: string;
    user: { id: string; email: string; name: string | null };
  }
}

const DEV_BYPASS_EMAIL = "dev@firekaro-v6.local";
let devUserCache: { id: string; email: string; name: string | null } | null = null;

async function getOrCreateDevUser() {
  if (devUserCache) return devUserCache;
  let user = await prisma.user.findUnique({
    where: { email: DEV_BYPASS_EMAIL },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    user = await prisma.user.create({
      data: { email: DEV_BYPASS_EMAIL, emailVerified: true, name: "Dev v6" },
      select: { id: true, email: true, name: true },
    });
    logger.info({ userId: user.id }, "Created v6 dev-bypass user");
  }
  devUserCache = user;
  return user;
}

export async function authMiddleware(c: Context, next: Next) {
  const isProduction = process.env.NODE_ENV === "production";
  const devBypass =
    !isProduction &&
    process.env.DEV_BYPASS_AUTH === "true" &&
    c.req.header("x-dev-bypass") === "true";

  if (devBypass) {
    try {
      const devUser = await getOrCreateDevUser();
      c.set("userId", devUser.id);
      c.set("user", devUser);
      await next();
      return;
    } catch (error) {
      logger.error({ err: error }, "Failed to get/create v6 dev user");
      // fall through to real auth
    }
  }

  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      return apiError(c, "Unauthorized", 401);
    }
    c.set("userId", session.user.id);
    c.set("user", {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });
    await next();
  } catch (error) {
    logger.error({ err: error }, "Auth middleware error");
    return apiError(c, "Authentication failed", 401);
  }
}
