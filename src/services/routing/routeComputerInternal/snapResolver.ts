import { snapToGraph } from '../coordinateSnap';
import type {
  RouteDestination,
  RouteOrigin,
} from '../../../types/routing';

export function resolveAndSnap(
  input: RouteOrigin | RouteDestination,
): { ok: true; nodeId: string; x: number; y: number } | { ok: false; reason: string } {
  const [lon, lat] = input.coordinates;
  const accuracy = 'type' in input && input.type === 'user_location' ? input.accuracy : undefined;
  return snapToGraph(lon, lat, input.level, accuracy);
}
