import { buildRoutingGraph } from "./graphBuilder";
import { transformWgs84ToEpsg5183 } from "../../utils/coordinateTransform";
import type { RouteGraph } from "../../types/routing";

const DEFAULT_SNAP_THRESHOLD_METERS = 10;
const HIGH_ACCURACY_THRESHOLD_METERS = 25;

let cachedGraph = buildRoutingGraph();

function getGraph() {
  return cachedGraph;
}

/** Returns the cached routing graph (built once at module load). */
export function getRoutingGraph(): RouteGraph {
  return cachedGraph;
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function snapToGraph(
  lon: number,
  lat: number,
  level: number,
  accuracy?: number,
): { ok: true; nodeId: string; x: number; y: number } | { ok: false; reason: string } {
  try {
    if (accuracy !== undefined && accuracy > HIGH_ACCURACY_THRESHOLD_METERS) {
      return { ok: false, reason: "SNAP_OUT_OF_RANGE" };
    }

    const [x, y] = transformWgs84ToEpsg5183(lon, lat);
    const graph = getGraph();

    let bestNodeId = "";
    let bestNodeX = 0;
    let bestNodeY = 0;
    let bestDistance = Infinity;

    for (const node of graph.nodes.values()) {
      if (node.level !== level) continue;
      const d = distance(x, y, node.x, node.y);
      if (d < bestDistance || (d === bestDistance && node.id < bestNodeId)) {
        bestDistance = d;
        bestNodeId = node.id;
        bestNodeX = node.x;
        bestNodeY = node.y;
      }
    }

    if (!bestNodeId || bestDistance > DEFAULT_SNAP_THRESHOLD_METERS) {
      return { ok: false, reason: "SNAP_OUT_OF_RANGE" };
    }

    return {
      ok: true,
      nodeId: bestNodeId,
      x: bestNodeX,
      y: bestNodeY,
    };
  } catch {
    return { ok: false, reason: "SNAP_OUT_OF_RANGE" };
  }
}
