import { describe, it, expect, vi } from "vitest";
import {
  sendTemplateMessage,
  getWatiConfig,
  isWhatsAppEnabled,
  normalizeWhatsAppNumber,
  type WatiConfig,
} from "./wati-client";

/**
 * Wati WhatsApp adapter — pins the contract WITHOUT live credentials: graceful
 * degradation when unconfigured, correct URL/headers/body shape, number
 * normalization, the Wati `{ result: false }`-on-200 failure mode, HTTP errors,
 * and network throws. Consent gating is the caller's job — not asserted here.
 */

const CONFIG: WatiConfig = { endpoint: "https://live-server-99999.wati.io", token: "test-token" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getWatiConfig / isWhatsAppEnabled", () => {
  it("returns null when env vars are absent", () => {
    expect(getWatiConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(isWhatsAppEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("returns config when both vars are present", () => {
    const env = {
      WATI_API_ENDPOINT: "https://x.wati.io",
      WATI_API_TOKEN: "tok",
    } as NodeJS.ProcessEnv;
    expect(getWatiConfig(env)).toEqual({ endpoint: "https://x.wati.io", token: "tok" });
    expect(isWhatsAppEnabled(env)).toBe(true);
  });

  it("treats whitespace-only / partial config as unconfigured", () => {
    expect(getWatiConfig({ WATI_API_ENDPOINT: "  ", WATI_API_TOKEN: "tok" } as NodeJS.ProcessEnv)).toBeNull();
    expect(getWatiConfig({ WATI_API_ENDPOINT: "https://x.wati.io" } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe("normalizeWhatsAppNumber", () => {
  it("strips '+', spaces, and dashes to digits only", () => {
    expect(normalizeWhatsAppNumber("+91 98765-43210")).toBe("919876543210");
    expect(normalizeWhatsAppNumber("(91) 79726 72473")).toBe("917972672473");
  });
  it("handles empty/undefined", () => {
    expect(normalizeWhatsAppNumber("")).toBe("");
    expect(normalizeWhatsAppNumber(undefined as unknown as string)).toBe("");
  });
});

describe("sendTemplateMessage", () => {
  it("degrades gracefully (no throw) when channel is not configured", async () => {
    const res = await sendTemplateMessage(
      { whatsappNumber: "919876543210", templateName: "firekaro_welcome" },
      { config: null },
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(res.error).toMatch(/not configured/i);
  });

  it("rejects an empty number and a missing template without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const noNumber = await sendTemplateMessage(
      { whatsappNumber: "+++", templateName: "t" },
      { config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(noNumber.ok).toBe(false);
    expect(noNumber.error).toMatch(/number/i);

    const noTemplate = await sendTemplateMessage(
      { whatsappNumber: "919876543210", templateName: "" },
      { config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(noTemplate.ok).toBe(false);
    expect(noTemplate.error).toMatch(/template/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts to the right URL with Bearer auth and the Wati body shape", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: true, id: "msg_123" }));
    const res = await sendTemplateMessage(
      {
        whatsappNumber: "+91 98765-43210",
        templateName: "firekaro_milestone",
        parameters: [
          { name: "1", value: "Abhay" },
          { name: "2", value: "₹1 Cr" },
        ],
      },
      { config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(res.ok).toBe(true);
    expect(res.providerMessageId).toBe("msg_123");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://live-server-99999.wati.io/api/v1/sendTemplateMessage?whatsappNumber=919876543210",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const sent = JSON.parse(init.body as string);
    expect(sent.template_name).toBe("firekaro_milestone");
    expect(sent.broadcast_name).toBe("firekaro_milestone");
    expect(sent.parameters).toHaveLength(2);
  });

  it("treats { result: false } on HTTP 200 as a failure (Wati's failure mode)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ result: false, info: "number not on WhatsApp" }),
    );
    const res = await sendTemplateMessage(
      { whatsappNumber: "919876543210", templateName: "firekaro_welcome" },
      { config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(200);
    expect(res.error).toMatch(/not on WhatsApp/);
  });

  it("propagates HTTP errors", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "unauthorized" }, 401));
    const res = await sendTemplateMessage(
      { whatsappNumber: "919876543210", templateName: "firekaro_welcome" },
      { config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.error).toMatch(/unauthorized/);
  });

  it("never throws on a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const res = await sendTemplateMessage(
      { whatsappNumber: "919876543210", templateName: "firekaro_welcome" },
      { config: CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(res.error).toMatch(/ECONNREFUSED/);
  });
});
