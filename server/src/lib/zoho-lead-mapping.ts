/**
 * Pure mapping: a FireKaro signup ("lead") → a Zoho CRM Leads payload.
 *
 * Decision (docs/whatsapp-wati-integration.md + retention-engagement-features.md):
 * FireKaro users are synced into the EXISTING PIFS Zoho CRM (same DB as broker
 * leads), distinguished by `Lead_Source = "FireKaro"`, with MINIMAL data only —
 * name + contact handle. NEVER financial PII (salary/PAN/plan) — DPDP minimisation.
 *
 * Pure + no IO so it's fully testable; the Zoho client (zoho-crm-client) does the
 * network upsert. Zoho Leads requires `Last_Name`; this guarantees a non-empty one.
 */

export const FIREKARO_LEAD_SOURCE = "FireKaro";

export interface FireKaroLead {
  /** Full name as entered at signup (may be a single word, or empty). */
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface ZohoLeadPayload {
  Last_Name: string; // required by Zoho
  First_Name?: string;
  Email?: string;
  Phone?: string;
  Lead_Source: string;
  Description?: string;
}

const clean = (v: string | null | undefined): string => (v ?? "").trim();

/** Derive a guaranteed-non-empty Last_Name when the name is missing/single-word. */
function splitName(full: string): { first?: string; last: string } {
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { last: "" };
  if (parts.length === 1) return { last: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export function firekaroUserToZohoLead(lead: FireKaroLead): ZohoLeadPayload {
  const email = clean(lead.email);
  const phone = clean(lead.phone);
  const { first, last } = splitName(clean(lead.name));

  // Last_Name is mandatory in Zoho — fall back to email local-part, then phone,
  // then a literal so the upsert never fails validation.
  const lastName = last || email.split("@")[0] || phone || "FireKaro Lead";

  const payload: ZohoLeadPayload = {
    Last_Name: lastName,
    Lead_Source: FIREKARO_LEAD_SOURCE,
    Description: "Lead captured from the FireKaro app.",
  };
  if (first) payload.First_Name = first;
  if (email) payload.Email = email;
  if (phone) payload.Phone = phone;
  return payload;
}
