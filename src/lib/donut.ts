// Pure SVG donut geometry — shared by every income-layout dashboard donut.
// No reactivity, no Vue imports — just maths, so it lives in lib/ alongside
// cashflow.ts and formatters.ts.

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/**
 * Path for a single donut segment between two angles (degrees, clockwise from
 * 12 o'clock). Splits a full circle into two arcs because SVG can't draw a
 * 360° arc in one path command.
 */
export function donutSegmentPath(
  startDeg: number,
  endDeg: number,
  opts: { cx?: number; cy?: number; rOut?: number; rIn?: number } = {},
): string {
  const { cx = 100, cy = 100, rOut = 90, rIn = 58 } = opts;
  const sweep = endDeg - startDeg;
  if (sweep >= 359.99) {
    return [
      donutSegmentPath(startDeg, startDeg + 180, opts),
      donutSegmentPath(startDeg + 180, startDeg + 360, opts),
    ].join(" ");
  }
  const p1 = polar(cx, cy, rOut, startDeg);
  const p2 = polar(cx, cy, rOut, endDeg);
  const p3 = polar(cx, cy, rIn, endDeg);
  const p4 = polar(cx, cy, rIn, startDeg);
  const large = sweep > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${rOut} ${rOut} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rIn} ${rIn} 0 ${large} 0 ${p4.x} ${p4.y} Z`;
}

export interface DonutDatum {
  key: string;
  value: number;
  color: string; // Vuetify theme color name, e.g. "primary"
}

export interface DonutSegment {
  key: string;
  color: string;
  path: string;
}

/** Build clockwise donut segments from values. Returns [] when total <= 0. */
export function buildDonutSegments(items: DonutDatum[], total: number): DonutSegment[] {
  if (total <= 0) return [];
  let cursor = 0;
  const out: DonutSegment[] = [];
  for (const it of items) {
    const sweep = (it.value / total) * 360;
    out.push({ key: it.key, color: it.color, path: donutSegmentPath(cursor, cursor + sweep) });
    cursor += sweep;
  }
  return out;
}
