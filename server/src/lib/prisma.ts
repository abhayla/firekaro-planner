import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client — copy-adapted from the root app's server/lib/prisma.ts.
 * globalThis caching prevents connection-pool exhaustion under tsx watch reload.
 */
declare global {
  // eslint-disable-next-line no-var
  var prismaV6: PrismaClient | undefined;
}

const isProduction = process.env.NODE_ENV === "production";

export const prisma =
  globalThis.prismaV6 ||
  new PrismaClient({
    log: isProduction ? ["error"] : ["error", "warn"],
  });

if (!isProduction) {
  globalThis.prismaV6 = prisma;
}
