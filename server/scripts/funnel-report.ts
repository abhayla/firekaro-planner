import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ratio } from "../src/lib/funnel-ratio";

/**
 * #44 — the funnel report: the five counts and the two conversion ratios.
 *
 * Run:  cd server && npx tsx scripts/funnel-report.ts [--days 30]
 *
 * READ-ONLY. Counts rows in `activation_event`; writes nothing. A count of 0 prints as 0, and a
 * ratio whose denominator is 0 prints "n/a" — never 0%, which would read as a real measurement of
 * a funnel nobody has entered yet.
 */

const EVENTS = ["quick_opened", "quick_completed", "signed_up", "returned_7d", "data_refreshed"] as const;

function parseDays(argv: string[]): number | null {
  const i = argv.indexOf("--days");
  if (i < 0) return null;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

async function main(): Promise<void> {
  const days = parseDays(process.argv.slice(2));
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
  const prisma = new PrismaClient();
  try {
    const counts: Record<string, number> = {};
    for (const event of EVENTS) {
      counts[event] = await prisma.activationEvent.count({
        where: { event, ...(since ? { createdAt: { gte: since } } : {}) },
      });
    }

    const window = since ? `last ${days} days (since ${since.toISOString().slice(0, 10)})` : "all time";
    console.log(`\nFireKaro activation funnel — ${window}\n`);
    for (const event of EVENTS) {
      console.log(`  ${event.padEnd(16)} ${String(counts[event]).padStart(8)}`);
    }
    console.log("\n  Conversions");
    console.log(
      `    quick_opened -> quick_completed   ${ratio(counts.quick_completed!, counts.quick_opened!)}`,
    );
    console.log(
      `    quick_completed -> signed_up      ${ratio(counts.signed_up!, counts.quick_completed!)}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
