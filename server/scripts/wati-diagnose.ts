/** Diagnostic — why a Wati template send returned 200 but did not deliver.
 * Prints the template's APPROVAL STATUS + exact params, the RAW send response,
 * and recent message statuses for the test number. Run from server/:
 *   npx tsx scripts/wati-diagnose.ts [templateName]
 */
import "dotenv/config";
import { getWatiConfig } from "../src/lib/wati-client";

const TO = (process.env.WATI_TEST_RECIPIENTS ?? "").split(",")[0]?.trim() || "917972672473";
const NAME = process.argv[2] ?? "firekaro_welcome_2026_06_02";

async function main() {
  const c = getWatiConfig();
  if (!c) {
    console.error("✗ no Wati config");
    process.exit(1);
  }
  const base = c.endpoint.replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${c.token}` };

  // 1) Template status + exact param structure.
  const tr = await fetch(`${base}/api/v1/getMessageTemplates`, { headers: auth });
  const tj = (await tr.json()) as { messageTemplates?: Array<Record<string, unknown>> };
  const tpl = (tj.messageTemplates ?? []).find((t) => t.elementName === NAME);
  console.log("=== TEMPLATE ===");
  console.log(tpl ? JSON.stringify(tpl, null, 2) : `NOT FOUND: ${NAME}`);

  // READ-ONLY — do NOT send again. Inspect the status of the message already sent.
  console.log("\n=== RECENT MESSAGES (status of the already-sent message) ===");
  const mr = await fetch(`${base}/api/v1/getMessages/${TO}?pageSize=8`, { headers: auth });
  console.log("HTTP", mr.status);
  console.log((await mr.text()).slice(0, 4000));
}

main().catch((e) => {
  console.error("error:", e);
  process.exit(99);
});
