// Geometry primitives and grid sampling for EPSG:5183 routing graph construction.

export interface PolygonData {
  exteriorRing: [number, number][];
  interiorRings: [number, number][][];
}

export interface NodeEntry {
  id: string;
  x: number;
  y: number;
}

// ── Point-in-polygon (planar ray casting for EPSG:5183) ─────────────

export function pointInRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y) {
      const ix = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (x < ix) inside = !inside;
    }
  }
  return inside;
}

/** True if (x,y) is inside the polygon exterior but outside all interior rings. */
export function isInsidePolygon(x: number, y: number, poly: PolygonData): boolean {
  if (!pointInRing(x, y, poly.exteriorRing)) return false;
  for (const hole of poly.interiorRings) {
    if (pointInRing(x, y, hole)) return false;
  }
  return true;
}

/** True if (x,y) is inside at least one polygon from a list. */
export function isInsideAnyPolygon(
  x: number,
  y: number,
  polygons: PolygonData[],
): boolean {
  for (const poly of polygons) {
    if (isInsidePolygon(x, y, poly)) return true;
  }
  return false;
}

// ── Planar helpers ──────────────────────────────────────────────────

export function euclidean(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function computeBbox(
  ring: [number, number][],
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

// ── Grid sampling ────────────────────────────────────────────────────

/**
 * Sample interior points of a polygon on a regular grid at `spacing` metres.
 * Only points that pass the point-in-polygon test (exterior + holes) are returned.
 * A small inset from the bounding-box edge avoids boundary numerical issues.
 */
export function sampleGrid(poly: PolygonData, spacing: number): [number, number][] {
  const bb = computeBbox(poly.exteriorRing);
  const inset = spacing * 0.05;
  const points: [number, number][] = [];

  const startX = bb.minX + inset;
  const endX = bb.maxX - inset;
  const startY = bb.minY + inset;
  const endY = bb.maxY - inset;

  for (let x = startX; x <= endX; x += spacing) {
    for (let y = startY; y <= endY; y += spacing) {
      if (isInsidePolygon(x, y, poly)) {
        points.push([x, y]);
      }
    }
  }

  return points;
}

export function segmentInsidePolygons(
  x1: number, y1: number,
  x2: number, y2: number,
  polygons: PolygonData[],
  samples: number = 2,
): boolean {
  for (let s = 1; s < samples; s++) {
    const t = s / samples;
    const mx = x1 + (x2 - x1) * t;
    const my = y1 + (y2 - y1) * t;
    if (!isInsideAnyPolygon(mx, my, polygons)) return false;
  }
  return true;
}
