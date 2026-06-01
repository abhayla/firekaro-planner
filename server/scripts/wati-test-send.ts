/**
 * Dev utility — list Wati approved templates and send ONE to the allowlisted test
 * number via the guarded adapter (server/src/lib/wati-client). Run from server/:
 *   npx tsx scripts/wati-test-send.ts [templateName]
 * The adapter's fail-closed allowlist (WATI_TEST_RECIPIENTS) still applies, so this
 * can only message the approved number even if invoked carelessly.
 */
import "dotenv/config";
import { getWatiConfig, sendTemplateMessage } from "../src/lib/wati-client";

const TO = process.env.WATI_TEST_RECIPIENTS?.split(",")[0]?.trim() ?? "";

async function main() {
  const config = getWatiConfig();
  if (!config) {
    console.error("✗ Wati not configured (WATI_API_ENDPOINT / WATI_API_TOKEN missing).");
    process.exit(1);
  }
  console.log(`Endpoint: ${config.endpoint}`);
  console.log(`Token: ${config.token.slice(0, 12)}…(${config.token.length} chars)`);
  console.log(`Test recipient: ${TO || "(none set!)"}`);

  // 1) List approved templates so we send something Meta has actually approved.
  const base = config.endpoint.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/v1/getMessageTemplates`, {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  const raw = (await res.json()) as {
    messageTemplates?: Array<{
      elementName: string;
      status?: string;
      category?: string;
      customParams?: Array<{ paramName: string; paramValue?: string }>;
    }>;
  };
  const all = raw.messageTemplates ?? [];
  console.log(`\nTemplates found: ${all.length}`);
  for (const t of all) {
    console.log(
      `  - ${t.elementName}  [${t.status ?? "?"}/${t.category ?? "?"}]  params=${(t.customParams ?? []).map((p) => p.paramName).join(",") || "none"}`,
    );
  }

  const approved = all.filter((t) => (t.status ?? "").toUpperCase() === "APPROVED");
  const wanted = process.argv[2];
  const chosen = wanted
    ? all.find((t) => t.elementName === wanted)
    : (approved[0] ?? all[0]);

  if (!chosen) {
    console.error("\n✗ No template available to send. Create/approve one in Wati first.");
    process.exit(2);
  }

  const parameters = (chosen.customParams ?? []).map((p) => ({
    name: p.paramName,
    value: p.paramValue && p.paramValue.length > 0 ? p.paramValue : "Abhay",
  }));

  console.log(`\nSending template "${chosen.elementName}" to ${TO} …`);
  const result = await sendTemplateMessage({
    whatsappNumber: TO,
    templateName: chosen.elementName,
    parameters,
  });
  console.log("\nResult:", JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 3);
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(99);
});
