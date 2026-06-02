import { logger } from "./logger";
import type { ZohoLeadPayload } from "./zoho-lead-mapping";

/**
 * Thin Zoho CRM client — upserts a FireKaro lead into the PIFS Zoho CRM Leads
 * module. Mirrors the Wati adapter: env-driven, injectable fetch, degrades
 * gracefully (returns a result, never throws) so a CRM hiccup never breaks the
 * signup request. Defaults to the **India** data centre (.in). The OAuth token is
 * fetched per call from the refresh token and is NEVER logged.
 *
 * Runtime credentials (ZOHO_*) are a deploy-time escalation — provision them in
 * the VPS env; the connected Zoho MCP is Claude's access, not the app's.
 */

export interface ZohoConfig {
  accountsBase: string; // e.g. https://accounts.zoho.in
  apiBase: string; // e.g. https://www.zohoapis.in
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function getZohoConfig(env: NodeJS.ProcessEnv = process.env): ZohoConfig | null {
  const clientId = env.ZOHO_CLIENT_ID?.trim();
  const clientSecret = env.ZOHO_CLIENT_SECRET?.trim();
  const refreshToken = env.ZOHO_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  return {
    accountsBase: (env.ZOHO_ACCOUNTS_BASE?.trim() || "https://accounts.zoho.in").replace(/\/+$/, ""),
    apiBase: (env.ZOHO_API_BASE?.trim() || "https://www.zohoapis.in").replace(/\/+$/, ""),
    clientId,
    clientSecret,
    refreshToken,
  };
}

export function isZohoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getZohoConfig(env) !== null;
}

export interface ZohoUpsertResult {
  ok: boolean;
  status: number;
  id?: string;
  error?: string;
}

interface Deps {
  config?: ZohoConfig | null;
  fetchImpl?: typeof fetch;
}

async function getAccessToken(config: ZohoConfig, fetchImpl: typeof fetch): Promise<string | null> {
  const params = new URLSearchParams({
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetchImpl(`${config.accountsBase}/oauth/v2/token?${params.toString()}`, {
    method: "POST",
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string };
  return body.access_token ?? null;
}

/**
 * Upsert a lead into Zoho CRM Leads (dedup on Email). Returns a normalized result;
 * never throws. Consent/DPDP is the caller's responsibility — this only writes the
 * minimal lead the mapper produced.
 */
export async function upsertLead(lead: ZohoLeadPayload, deps: Deps = {}): Promise<ZohoUpsertResult> {
  const config = deps.config !== undefined ? deps.config : getZohoConfig();
  const fetchImpl = deps.fetchImpl ?? fetch;

  if (!config) {
    return {
      ok: false,
      status: 0,
      error: "Zoho not configured (ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN unset)",
    };
  }

  try {
    const token = await getAccessToken(config, fetchImpl);
    if (!token) return { ok: false, status: 0, error: "Zoho OAuth token fetch failed" };

    const res = await fetchImpl(`${config.apiBase}/crm/v2/Leads/upsert`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: [lead], duplicate_check_fields: ["Email"] }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      data?: Array<{ status?: string; message?: string; details?: { id?: string } }>;
      message?: string;
    };
    const rec = Array.isArray(body.data) ? body.data[0] : undefined;
    const ok = res.ok && rec?.status === "success";

    if (!ok) {
      const error = rec?.message || body.message || `Zoho upsert failed (HTTP ${res.status})`;
      logger.warn({ status: res.status }, "Zoho lead upsert failed");
      return { ok: false, status: res.status, error };
    }
    return { ok: true, status: res.status, id: rec?.details?.id };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Zoho lead upsert threw",
    );
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
