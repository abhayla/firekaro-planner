import { logger } from "./logger";

/**
 * Wati.io WhatsApp channel adapter (Phase 1 of the retention/engagement loop —
 * see docs/whatsapp-wati-integration.md). Pure HTTP wrapper around Wati's
 * sendTemplateMessage endpoint. No store/DB access; fetch + config are injectable
 * so the logic is unit-testable WITHOUT live credentials. The token is never
 * logged (Authorization is built locally and only the redacting logger is used).
 */

export interface WatiConfig {
  /** Tenant base URL, e.g. https://live-server-12345.wati.io (no trailing slash needed). */
  endpoint: string;
  /** Wati access token (Bearer). Sourced from env only — never committed. */
  token: string;
}

export interface WatiTemplateParam {
  name: string;
  value: string;
}

export interface SendTemplateInput {
  /** Destination WhatsApp number; normalized to digits (no '+'/spaces) before send. */
  whatsappNumber: string;
  /** Meta-approved template name (e.g. "firekaro_milestone"). */
  templateName: string;
  /** Wati broadcast label; defaults to templateName. */
  broadcastName?: string;
  parameters?: WatiTemplateParam[];
}

export interface WatiSendResult {
  ok: boolean;
  /** HTTP status (0 when the request never completed / channel not configured). */
  status: number;
  providerMessageId?: string;
  error?: string;
}

/**
 * Read Wati config from env. Returns null (not throws) when the channel is not
 * configured, so callers can degrade gracefully instead of crashing — sends are
 * an optional engagement side-effect, never on the request's critical path.
 */
export function getWatiConfig(env: NodeJS.ProcessEnv = process.env): WatiConfig | null {
  const endpoint = env.WATI_API_ENDPOINT?.trim();
  const token = env.WATI_API_TOKEN?.trim();
  if (!endpoint || !token) return null;
  return { endpoint, token };
}

export function isWhatsAppEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getWatiConfig(env) !== null;
}

/** Strip everything but digits — Wati expects the number without '+'/spaces/dashes. */
export function normalizeWhatsAppNumber(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

interface SendDeps {
  config?: WatiConfig | null;
  fetchImpl?: typeof fetch;
}

/**
 * Send a pre-approved WhatsApp template via Wati. Returns a normalized result
 * (never throws) so the caller's send-log + consent flow stay simple. CONSENT IS
 * THE CALLER'S RESPONSIBILITY — this adapter does not check opt-in; the trigger
 * layer (nudge-engine → delivery) gates on CommsConsent before calling here.
 */
export async function sendTemplateMessage(
  input: SendTemplateInput,
  deps: SendDeps = {},
): Promise<WatiSendResult> {
  const config = deps.config !== undefined ? deps.config : getWatiConfig();
  const fetchImpl = deps.fetchImpl ?? fetch;

  if (!config) {
    return {
      ok: false,
      status: 0,
      error: "WhatsApp channel not configured (WATI_API_ENDPOINT / WATI_API_TOKEN unset)",
    };
  }

  const number = normalizeWhatsAppNumber(input.whatsappNumber);
  if (!number) {
    return { ok: false, status: 0, error: "Invalid WhatsApp number (no digits)" };
  }
  if (!input.templateName?.trim()) {
    return { ok: false, status: 0, error: "Missing templateName" };
  }

  const base = config.endpoint.replace(/\/+$/, "");
  const url = `${base}/api/v1/sendTemplateMessage?whatsappNumber=${number}`;
  const body = {
    template_name: input.templateName,
    broadcast_name: input.broadcastName ?? input.templateName,
    parameters: input.parameters ?? [],
  };

  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    let parsed: Record<string, unknown> = {};
    try {
      parsed = (await res.json()) as Record<string, unknown>;
    } catch {
      // Non-JSON body — fall back to HTTP status for the verdict.
    }

    // Wati signals failure via { result: false } even on HTTP 200, so check both.
    const apiOk = res.ok && parsed.result !== false;
    const providerMessageId =
      typeof parsed.id === "string"
        ? parsed.id
        : typeof parsed.messageId === "string"
          ? (parsed.messageId as string)
          : undefined;

    if (!apiOk) {
      const error =
        (typeof parsed.info === "string" && parsed.info) ||
        (typeof parsed.message === "string" && parsed.message) ||
        `Wati send failed (HTTP ${res.status})`;
      logger.warn(
        { template: input.templateName, status: res.status },
        "WhatsApp template send failed",
      );
      return { ok: false, status: res.status, providerMessageId, error };
    }

    return { ok: true, status: res.status, providerMessageId };
  } catch (err) {
    logger.warn(
      { template: input.templateName, err: err instanceof Error ? err.message : String(err) },
      "WhatsApp template send threw",
    );
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Unknown network error",
    };
  }
}
