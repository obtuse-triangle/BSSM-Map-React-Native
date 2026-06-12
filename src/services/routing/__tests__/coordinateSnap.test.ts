import { buildRoutingGraph } from '../graphBuilder';
import { snapToGraph } from '../coordinateSnap';
import { transformEpsg5183ToWgs84 } from '../../../utils/coordinateTransform';

describe('snapToGraph', () => {
  const graph = buildRoutingGraph();

  it('snaps a known campus coordinate to the nearest node on the correct level', () => {
    const node = [...graph.nodes.values()].find((n) => n.level === 1);
    expect(node).toBeDefined();
    if (!node) return;

    const [lon, lat] = transformEpsg5183ToWgs84(node.x, node.y);
    const result = snapToGraph(lon, lat, 1);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodeId).toBe(node.id);
    expect(result.x).toBeCloseTo(node.x, 6);
    expect(result.y).toBeCloseTo(node.y, 6);
  });

  it('returns SNAP_OUT_OF_RANGE for a far-away coordinate', () => {
    const result = snapToGraph(0, 0, 1);
    expect(result).toEqual({ ok: false, reason: 'SNAP_OUT_OF_RANGE' });
  });

  it('returns SNAP_OUT_OF_RANGE when accuracy is greater than 25m', () => {
    const node = [...graph.nodes.values()].find((n) => n.level === 1);
    expect(node).toBeDefined();
    if (!node) return;

    const [lon, lat] = transformEpsg5183ToWgs84(node.x, node.y);
    const result = snapToGraph(lon, lat, 1, 30);

    expect(result).toEqual({ ok: false, reason: 'SNAP_OUT_OF_RANGE' });
  });

  it('respects the requested level when snapping connector coordinates', () => {
    const connectorEdge = graph.edges.find((edge) => edge.edgeType === 'connector');
    expect(connectorEdge).toBeDefined();
    if (!connectorEdge) return;

    const fromNode = graph.nodes.get(connectorEdge.from);
    const toNode = graph.nodes.get(connectorEdge.to);
    expect(fromNode).toBeDefined();
    expect(toNode).toBeDefined();
    if (!fromNode || !toNode) return;

    const [lon, lat] = transformEpsg5183ToWgs84(toNode.x, toNode.y);
    const result = snapToGraph(lon, lat, fromNode.level);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snappedNode = graph.nodes.get(result.nodeId);
    expect(snappedNode).toBeDefined();
    expect(snappedNode?.level).toBe(fromNode.level);
    expect(result.nodeId).not.toBe(toNode.id);
  });
});
