/** READ-ONLY probe — discover which Wati endpoints return delivery data for a
 * daily sent/delivered/failed report. Prints HTTP status + a body sample for
 * each candidate source so we build the report against what actually works.
 * Run from server/:  npx tsx scripts/wati-probe-report-sources.ts
 */
import "dotenv/config";
import { getWatiConfig } from "../src/lib/wati-client";

async function probe(label: string, url: string, auth: Record<string, string>) {
  try {
    const r = await fetch(url, { headers: auth });
    const body = await r.text();
    console.log(`\n### ${label}\n${url}\nHTTP ${r.status}\n${body.slice(0, 900)}`);
  } catch (e) {
    console.log(`\n### ${label}\n${url}\nERROR ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  const c = getWatiConfig();
  if (!c) {
    console.error("no config");
    process.exit(1);
  }
  const base = c.endpoint.replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${c.token}` };
  const TO = (process.env.WATI_TEST_RECIPIENTS ?? "").split(",")[0]?.trim();
if (!TO) throw new Error("WATI_TEST_RECIPIENTS is required (owner test number lives in GLOBAL.env)");

  await probe("V3 broadcasts list", `${base}/api/ext/v3/broadcasts`, auth);
  await probe("V3 broadcasts overview", `${base}/api/ext/v3/broadcasts/overview`, auth);
  await probe("V1 getMessages (per number)", `${base}/api/v1/getMessages/${TO}?pageSize=3`, auth);
  await probe("V1 getMessages (no number)", `${base}/api/v1/getMessages?pageSize=3`, auth);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
