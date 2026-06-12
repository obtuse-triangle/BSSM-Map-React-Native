import type { RoutingConnectorFeature } from '../types/routing';

declare const fc: {
  type: 'FeatureCollection';
  features: RoutingConnectorFeature[];
};

export default fc;
