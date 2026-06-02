import { describe, it, expect, vi } from "vitest";
import {
  upsertLead,
  getZohoConfig,
  isZohoEnabled,
  type ZohoConfig,
} from "./zoho-crm-client";
import { firekaroUserToZohoLead } from "./zoho-lead-mapping";

/**
 * Zoho CRM client — pins WITHOUT live credentials: graceful degrade when
 * unconfigured, OAuth token fetch then upsert, correct Zoho-oauthtoken auth +
 * dedup body, success id capture, error-record handling, and no-throw on network.
 */

const CONFIG: ZohoConfig = {
  accountsBase: "https://accounts.zoho.in",
  apiBase: "https://www.zohoapis.in",
  clientId: "cid",
  clientSecret: "csecret",
  refreshToken: "rtoken",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Fake fetch: token endpoint returns an access_token; the upsert endpoint returns `upsertBody`. */
function fakeFetch(upsertBody: unknown, upsertStatus = 200, accessToken: string | null = "atk") {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/oauth/v2/token")) {
      return jsonResponse(accessToken ? { access_token: accessToken } : {});
    }
    return jsonResponse(upsertBody, upsertStatus);
  });
}

describe("getZohoConfig / isZohoEnabled", () => {
  it("returns null when OAuth vars are missing", () => {
    expect(getZohoConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(isZohoEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("defaults to the India DC when bases are unset", () => {
    const c = getZohoConfig({
      ZOHO_CLIENT_ID: "a",
      ZOHO_CLIENT_SECRET: "b",
      ZOHO_REFRESH_TOKEN: "c",
    } as NodeJS.ProcessEnv);
    expect(c?.accountsBase).toBe("https://accounts.zoho.in");
    expect(c?.apiBase).toBe("https://www.zohoapis.in");
  });
});

describe("upsertLead", () => {
  const lead = firekaroUserToZohoLead({ name: "Abhay Kumar", email: "a@b.com", phone: "9199" });

  it("degrades gracefully (no throw) when Zoho is not configured", async () => {
    const r = await upsertLead(lead, { config: null });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it("fetches a token then upserts with Zoho-oauthtoken auth + dedup body", async () => {
    const fetchImpl = fakeFetch({ data: [{ status: "success", details: { id: "ZLEAD1" } }] });
    const r = await upsertLead(lead, { config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(r.ok).toBe(true);
    expect(r.id).toBe("ZLEAD1");

    // 2 calls: token, then upsert.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [upsertUrl, upsertInit] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(upsertUrl).toBe("https://www.zohoapis.in/crm/v2/Leads/upsert");
    expect((upsertInit.headers as Record<string, string>).Authorization).toBe("Zoho-oauthtoken atk");
    const sent = JSON.parse(upsertInit.body as string);
    expect(sent.data[0].Lead_Source).toBe("FireKaro");
    expect(sent.duplicate_check_fields).toEqual(["Email"]);
  });

  it("fails when the OAuth token cannot be obtained", async () => {
    const fetchImpl = fakeFetch({}, 200, null);
    const r = await upsertLead(lead, { config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/token/i);
  });

  it("surfaces a Zoho error record", async () => {
    const fetchImpl = fakeFetch({
      data: [{ status: "error", message: "DUPLICATE_DATA" }],
    });
    const r = await upsertLead(lead, { config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/DUPLICATE_DATA/);
  });

  it("never throws on a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ETIMEDOUT");
    });
    const r = await upsertLead(lead, { config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(r.error).toMatch(/ETIMEDOUT/);
  });
});
