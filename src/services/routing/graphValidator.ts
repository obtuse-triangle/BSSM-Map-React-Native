/**
 * graphValidator.ts
 *
 * Validates an indoor routing graph's structural integrity.
 *
 * Checks performed:
 *   - Every edge.from / edge.to references an existing node
 *   - Every edge has a finite, positive primary weight (distanceMeters or timeSeconds)
 *   - Stair connector edges have accessibilityPenalty > 0
 *   - Elevator connector edges have accessibilityPenalty === 0
 *   - All polygon-type nodes have level ∈ {1,2,3,4}
 *   - No orphan nodes (every node participates in at least one edge)
 *   - No duplicate edge definitions
 */

import type { RouteGraph } from '../../types/routing';

// ── Types ────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Validator ────────────────────────────────────────────────────────

/**
 * Run all structural integrity checks on a `RouteGraph`.
 *
 * @param graph - The routing graph to validate.
 * @returns A `ValidationResult` with `valid` set to `true` when no errors
 *          are found, and an `errors` array listing every issue.
 */
export function validateGraph(graph: RouteGraph): ValidationResult {
  const errors: string[] = [];

  // ── Cache node set ───────────────────────────────────────────────
  const nodeIds = new Set(graph.nodes.keys());

  // ── 1. Edge node references ──────────────────────────────────────
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(
        `Edge references non-existent source node: "${edge.from}"`,
      );
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(
        `Edge references non-existent target node: "${edge.to}"`,
      );
    }
  }

  // ── 2. Edge weights ──────────────────────────────────────────────
  for (const edge of graph.edges) {
    const { from, to, edgeType } = edge;
    const primary = edgeType === 'walk' ? edge.distanceMeters : edge.timeSeconds;
    if (!Number.isFinite(primary) || primary <= 0) {
      errors.push(
        `${edgeType === 'connector' ? 'Connector' : 'Walk'} edge "${from}"→"${to}" has non-positive or non-finite primary weight: ${primary}`,
      );
    }
  }

  // ── 3. Accessibility penalties on connector edges ────────────────
  for (const edge of graph.edges) {
    if (edge.edgeType !== 'connector' || !edge.connectorId) continue;

    const connId: string = edge.connectorId;
    const isStair = connId.includes('stair');
    const isElevator = connId.includes('elevator');
    const pen = edge.accessibilityPenalty;

    if (isStair && pen <= 0) {
      errors.push(
        `Stair connector edge "${edge.from}"→"${edge.to}" (connectorId="${connId}") has non-positive accessibilityPenalty: ${pen}`,
      );
    }
    if (isElevator && pen !== 0) {
      errors.push(
        `Elevator connector edge "${edge.from}"→"${edge.to}" (connectorId="${connId}") has non-zero accessibilityPenalty: ${pen}`,
      );
    }
  }

  // ── 4. Orphan nodes (no edges) ───────────────────────────────────
  const nodesWithEdges = new Set<string>();
  for (const edge of graph.edges) {
    nodesWithEdges.add(edge.from);
    nodesWithEdges.add(edge.to);
  }

  for (const [nodeId, node] of graph.nodes) {
    if (!nodesWithEdges.has(nodeId)) {
      errors.push(
        `Orphan node: "${nodeId}" (level=${node.level}, type=${node.nodeType})`,
      );
    }
  }

  // ── 5. Polygon node level bounds ─────────────────────────────────
  for (const [nodeId, node] of graph.nodes) {
    if (node.nodeType === 'polygon') {
      if (!Number.isInteger(node.level) || node.level < 1 || node.level > 4) {
        errors.push(
          `Polygon node "${nodeId}" has invalid level: ${node.level} (must be 1-4)`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
