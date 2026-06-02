/**
 * Daily WhatsApp delivery report — sent / delivered / read / FAILED + failure
 * reasons, built ONLY on the confirmed Wati endpoint (getMessages/{number}, V1).
 *
 * Run from server/:
 *   npx tsx scripts/wati-daily-report.ts                 # numbers from WATI_TEST_RECIPIENTS
 *   npx tsx scripts/wati-daily-report.ts --numbers 91...,91...   # explicit list
 *   npx tsx scripts/wati-daily-report.ts --since-hours 48
 *
 * NUMBER SOURCE: today this reads WATI_TEST_RECIPIENTS / --numbers. Once the
 * backend send-log (WhatsAppSendLog) exists, swap `recipientNumbers()` to read
 * the distinct numbers FireKaro messaged in the window — that makes it a true
 * all-users daily report. (Webhook capture is the robust long-term source — see
 * docs/meta-whatsapp-delivery-policies.md §11.)
 */
import "dotenv/config";
import { getWatiConfig } from "../src/lib/wati-client";

interface WatiMsg {
  statusString?: string;
  failedDetail?: string;
  eventDescription?: string;
  created?: string;
}

/** Bucket a failure reason to the Meta error class (see policy doc §9). */
function classifyFailure(detail = ""): string {
  const d = detail.toLowerCase();
  if (/higher quality messaging|marketing/.test(d)) return "131049 per-user marketing cap";
  if (/not.*whatsapp|undeliverable.*not a|invalid/.test(d)) return "131026 not on WhatsApp / invalid";
  if (/window|re-?engage|expired/.test(d)) return "131047 outside 24h window";
  if (/spam|rate/.test(d)) return "131048 spam-rate limit";
  return `other: ${detail || "unknown"}`;
}

function templateOf(m: WatiMsg): string {
  const match = /using \\?"?([\w-]+)\\?"? template/.exec(m.eventDescription ?? "");
  return match?.[1] ?? "(none)";
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function recipientNumbers(): string[] {
  const explicit = arg("--numbers");
  const raw = explicit ?? process.env.WATI_TEST_RECIPIENTS ?? "";
  return raw
    .split(",")
    .map((n) => n.replace(/\D/g, ""))
    .filter(Boolean);
}

async function main() {
  const c = getWatiConfig();
  if (!c) {
    console.error("✗ Wati not configured");
    process.exit(1);
  }
  const base = c.endpoint.replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${c.token}` };
  const sinceHours = Number(arg("--since-hours") ?? 24);
  const cutoff = Date.now() - sinceHours * 3600_000;
  const numbers = recipientNumbers();

  if (numbers.length === 0) {
    console.error("✗ no recipient numbers (set WATI_TEST_RECIPIENTS or pass --numbers)");
    process.exit(2);
  }

  const counts = { SENT: 0, DELIVERED: 0, READ: 0, FAILED: 0, OTHER: 0 };
  const failBuckets = new Map<string, number>();
  const failByTemplate = new Map<string, number>();
  let total = 0;

  for (const num of numbers) {
    const r = await fetch(`${base}/api/v1/getMessages/${num}?pageSize=100`, { headers: auth });
    if (!r.ok) {
      console.error(`! getMessages ${num} -> HTTP ${r.status}`);
      continue;
    }
    const j = (await r.json()) as { messages?: { items?: WatiMsg[] } };
    const items = (j.messages?.items ?? []).filter((m) => {
      const t = m.created ? Date.parse(m.created) : NaN;
      return Number.isFinite(t) && t >= cutoff;
    });
    for (const m of items) {
      total++;
      const s = (m.statusString ?? "OTHER").toUpperCase();
      if (s in counts) (counts as Record<string, number>)[s]++;
      else counts.OTHER++;
      if (s === "FAILED") {
        const reason = classifyFailure(m.failedDetail);
        failBuckets.set(reason, (failBuckets.get(reason) ?? 0) + 1);
        const tpl = templateOf(m);
        failByTemplate.set(tpl, (failByTemplate.get(tpl) ?? 0) + 1);
      }
    }
  }

  const pct = (n: number) => (total ? ((n / total) * 100).toFixed(1) : "0.0");
  const lines: string[] = [];
  lines.push(`WhatsApp delivery report — last ${sinceHours}h`);
  lines.push(`Recipients checked: ${numbers.length}   Messages: ${total}`);
  lines.push(`  Delivered: ${counts.DELIVERED} (${pct(counts.DELIVERED)}%)   Read: ${counts.READ}`);
  lines.push(`  Sent-only (accepted, not yet delivered): ${counts.SENT}`);
  lines.push(`  FAILED: ${counts.FAILED} (${pct(counts.FAILED)}%)`);
  if (failBuckets.size) {
    lines.push(`  Failure reasons:`);
    for (const [reason, n] of [...failBuckets.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`    - ${reason} …… ${n}`);
    }
    lines.push(`  Failing templates:`);
    for (const [tpl, n] of [...failByTemplate.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`    - ${tpl} …… ${n}`);
    }
  }
  if (counts.OTHER) lines.push(`  Other/unknown status: ${counts.OTHER}`);
  console.log(lines.join("\n"));
}

main().catch((e) => {
  console.error("error:", e);
  process.exit(99);
});
