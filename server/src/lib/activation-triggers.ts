import type { PrismaClient } from "@prisma/client";
import { logger } from "./logger";

/**
 * #44 — the three funnel events that fire SERVER-SIDE, from facts only the server holds.
 *
 * Why server-side and not three more client calls: `signed_up`, `returned_7d` and
 * `data_refreshed` are each defined by something the browser cannot be trusted to know —
 * "is this the FIRST authenticated /me for this account", "is now ≥7 days after the account was
 * created", "is this the SECOND-or-later document write". Deriving them from the DB makes them
 * un-spoofable and idempotent; deriving them in the client would make them a matter of opinion.
 *
 * FIRE-AND-FORGET, ALWAYS: a counter must never fail, slow, or change the request it is counting.
 * Every function here swallows its own errors into a log line and returns the decision it made,
 * so a caller can be tested without a DB and a broken counter can never break the planner.
 */

/** The anonId recorded for a server-derived event — the browser's uuid is not in scope here. */
export const SERVER_ANON_ID = "server";

/** 7 days in milliseconds — the `returned_7d` threshold. */
export const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type EventName = "signed_up" | "returned_7d" | "data_refreshed";

/** Pure: has this user already had this event recorded? (the idempotency predicate) */
export function decideOnce(alreadyRecorded: boolean): boolean {
  return !alreadyRecorded;
}

/** Pure: is `now` at least 7 days after the account was created? */
export function isReturnedAfter7d(userCreatedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - userCreatedAt.getTime() >= RETURN_WINDOW_MS;
}

/** Pure: is this write a REFRESH (i.e. not the user's very first document write)? */
export function isDataRefresh(priorWriteCount: number): boolean {
  return priorWriteCount >= 1;
}

async function hasEvent(prisma: PrismaClient, userId: string, event: EventName): Promise<boolean> {
  const found = await prisma.activationEvent.findFirst({ where: { userId, event }, select: { id: true } });
  return found !== null;
}

async function record(prisma: PrismaClient, userId: string, event: EventName): Promise<void> {
  await prisma.activationEvent.create({ data: { userId, anonId: SERVER_ANON_ID, event } });
}

/**
 * Called from GET /api/planner/me — the first authenticated request any signed-in client makes.
 * Records `signed_up` exactly once per account, and `returned_7d` exactly once, the first time a
 * /me lands 7+ days after the account was created.
 */
export async function onAuthenticatedMe(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<{ signedUp: boolean; returned7d: boolean }> {
  const out = { signedUp: false, returned7d: false };
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (!user) return out;

    if (decideOnce(await hasEvent(prisma, userId, "signed_up"))) {
      await record(prisma, userId, "signed_up");
      out.signedUp = true;
    }
    if (
      isReturnedAfter7d(user.createdAt, now) &&
      decideOnce(await hasEvent(prisma, userId, "returned_7d"))
    ) {
      await record(prisma, userId, "returned_7d");
      out.returned7d = true;
    }
  } catch (err) {
    logger.warn({ err, userId }, "#44 onAuthenticatedMe — activation event not recorded");
  }
  return out;
}

/**
 * Called after any successful PUT to a planner document. Records `data_refreshed` once per account,
 * on the SECOND-or-later write — the first write is setup, not a refresh, so counting it would make
 * every signup look like an engaged user.
 *
 * "Has this user written before?" is answered by the DB, not by a counter we keep: `userUiPrefs`
 * (and every other planner table) carries `createdAt`/`updatedAt`, so a row whose `updatedAt` is
 * strictly later than its `createdAt` is proof of a second write. That is the whole test — no extra
 * marker table, no client claim.
 */
export async function onPlannerDocumentWrite(
  prisma: PrismaClient,
  userId: string,
): Promise<{ dataRefreshed: boolean }> {
  try {
    if (!decideOnce(await hasEvent(prisma, userId, "data_refreshed"))) return { dataRefreshed: false };
    const [uiRow, householdRows] = await Promise.all([
      prisma.userUiPrefs.findUnique({ where: { userId }, select: { createdAt: true, updatedAt: true } }),
      prisma.member.count({ where: { userId } }),
    ]);
    const uiWrittenTwice = uiRow != null && uiRow.updatedAt.getTime() > uiRow.createdAt.getTime();
    // Either the ui document has been written more than once, or the household already has rows
    // from an earlier request — both mean this PUT is not the account's first write.
    const priorWrites = (uiWrittenTwice ? 1 : 0) + (householdRows > 0 ? 1 : 0);
    if (!isDataRefresh(priorWrites)) return { dataRefreshed: false };
    await record(prisma, userId, "data_refreshed");
    return { dataRefreshed: true };
  } catch (err) {
    logger.warn({ err, userId }, "#44 onPlannerDocumentWrite — activation event not recorded");
    return { dataRefreshed: false };
  }
}
