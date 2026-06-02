import {
  decideSend,
  type CommsChannel,
  type ConsentRecord,
  type FrequencyPolicy,
  type TemplateCategory,
} from "./comms-consent";
import { sendTemplateMessage, type WatiSendResult, type WatiTemplateParam } from "./wati-client";
import * as repo from "./comms-repo";

/**
 * WhatsApp sender — the production orchestration that turns a nudge into a sent +
 * logged message. Chains the proven pieces: consent/cap gate (decideSend) →
 * fail-closed Wati adapter → send-log. Deps are injectable so the orchestration is
 * unit-testable without a DB or network. This is what the scheduler/triggers call;
 * NOT the skill (that's dev-only — see docs/whatsapp-wati-integration.md).
 */

const DEFAULT_POLICY: FrequencyPolicy = { maxPerWindow: 4, windowHours: 24 };

export interface SendNudgeInput {
  userId: string;
  toNumber: string;
  templateName: string;
  category: TemplateCategory;
  parameters?: WatiTemplateParam[];
}

export interface SendNudgeResult {
  sent: boolean;
  /** "sent" | "send-failed" | a decideSend deny reason. */
  reason: string;
  logId?: string;
  providerStatus?: number;
}

export interface SenderDeps {
  getConsent: (userId: string, channel: CommsChannel) => Promise<ConsentRecord | null>;
  recentTimestamps: (userId: string, sinceHours: number) => Promise<string[]>;
  send: (input: {
    whatsappNumber: string;
    templateName: string;
    parameters?: WatiTemplateParam[];
  }) => Promise<WatiSendResult>;
  recordSend: (row: repo.RecordSendInput) => Promise<{ id: string }>;
  now: () => string;
  policy: FrequencyPolicy;
}

function defaultDeps(): SenderDeps {
  return {
    getConsent: repo.getConsent,
    recentTimestamps: repo.recentWhatsAppTimestamps,
    send: sendTemplateMessage,
    recordSend: repo.recordSend,
    now: () => new Date().toISOString(),
    policy: DEFAULT_POLICY,
  };
}

export async function sendNudge(
  input: SendNudgeInput,
  depsOverride: Partial<SenderDeps> = {},
): Promise<SendNudgeResult> {
  const deps = { ...defaultDeps(), ...depsOverride };

  const consent = await deps.getConsent(input.userId, "whatsapp");
  const recent = await deps.recentTimestamps(input.userId, deps.policy.windowHours);
  const decision = decideSend({
    channel: "whatsapp",
    category: input.category,
    consent,
    recentSendTimestamps: recent,
    now: deps.now(),
    policy: deps.policy,
  });

  // Denied → log a BLOCKED row (so the daily report shows suppressed sends) and stop.
  if (!decision.allowed) {
    const log = await deps.recordSend({
      userId: input.userId,
      toNumber: input.toNumber,
      templateName: input.templateName,
      category: input.category,
      status: "BLOCKED",
      failedDetail: decision.reason,
    });
    return { sent: false, reason: decision.reason, logId: log.id };
  }

  const result = await deps.send({
    whatsappNumber: input.toNumber,
    templateName: input.templateName,
    parameters: input.parameters,
  });
  const log = await deps.recordSend({
    userId: input.userId,
    toNumber: input.toNumber,
    templateName: input.templateName,
    category: input.category,
    status: result.ok ? "SENT" : "FAILED",
    failedDetail: result.ok ? null : (result.error ?? null),
    providerMessageId: result.providerMessageId ?? null,
  });

  return {
    sent: result.ok,
    reason: result.ok ? "sent" : "send-failed",
    logId: log.id,
    providerStatus: result.status,
  };
}
