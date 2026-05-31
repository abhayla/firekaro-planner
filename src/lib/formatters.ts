// Ported verbatim from production src/utils/formatters.ts
export function formatINR(amount: number): string {
  if (typeof amount !== "number" || isNaN(amount)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatINRLakhs(amount: number): string {
  if (typeof amount !== "number" || isNaN(amount)) return "₹0";
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000) return `${(amount / 100000).toFixed(2)}L`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return formatINR(amount);
}

export function formatINRCompact(amount: number): string {
  if (typeof amount !== "number" || isNaN(amount)) return "₹0";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return formatINR(amount);
}

export function formatPercent(value: number, decimals = 1): string {
  if (typeof value !== "number" || isNaN(value)) return "0%";
  return `${value.toFixed(decimals)}%`;
}

export function parseINR(formatted: string): number {
  if (!formatted) return 0;
  const cleaned = formatted.replace(/[₹,\s]/g, "");
  if (/Cr$/i.test(cleaned)) return parseFloat(cleaned) * 10000000;
  if (/L$/i.test(cleaned)) return parseFloat(cleaned) * 100000;
  if (/K$/i.test(cleaned)) return parseFloat(cleaned) * 1000;
  return parseFloat(cleaned) || 0;
}

export function formatYearsMonths(years: number | null | undefined): string {
  if (years == null || !Number.isFinite(years)) return "—";
  const y = Math.max(0, Math.floor(years));
  const m = Math.max(0, Math.round((years - y) * 12));
  if (y === 0) return `${m}m`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}m`;
}
