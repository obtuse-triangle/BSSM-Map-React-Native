import React, { useEffect, useRef, useState } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useRouteStore } from '../../store/routeStore';
import { useMapStore } from '../../store/mapStore';
import { buildRoutingGraph } from '../../services/routing/graphBuilder';
import { buildRouteLayerData } from './routeLayerData';
import type { RouteGeoJsonFeature } from '../../services/routing/routeGeoJson';

let nodeCoordCache: Map<string, [number, number]> | null = null;

function getNodeCoords(): Map<string, [number, number]> {
  if (!nodeCoordCache) {
    const graph = buildRoutingGraph();
    nodeCoordCache = new Map<string, [number, number]>();
    for (const [id, node] of graph.nodes) {
      nodeCoordCache.set(id, [node.x, node.y]);
    }
  }
  return nodeCoordCache;
}

type FeatureCollection = {
  type: 'FeatureCollection';
  features: RouteGeoJsonFeature[];
};

type PointFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: { label: string };
};

type PointFeatureCollection = {
  type: 'FeatureCollection';
  features: PointFeature[];
};

type OptionLayerState = {
  id: string;
  color: string;
  active: FeatureCollection | null;
  dimmed: FeatureCollection | null;
};

const ROUTE_PALETTE = [
  '#2979FF',
  '#FF7043',
  '#66BB6A',
  '#AB47BC',
  '#FFCA28',
];

function RoutePathLayer() {
  const [optionLayers, setOptionLayers] = useState<OptionLayerState[]>([]);
  const [originData, setOriginData] = useState<PointFeatureCollection | null>(null);
  const [destinationData, setDestinationData] = useState<PointFeatureCollection | null>(null);
  const lastSignatureRef = useRef<string>('');

  useEffect(() => {
    const rebuild = () => {
      const state = useRouteStore.getState();
      const { routeOptions, selectedRouteIndex } = state;
      const selectedLevel = useMapStore.getState().selectedLevel;

      const signature = `${routeOptions.length}:${selectedRouteIndex}:${selectedLevel}:${routeOptions
        .map((o) => (o.result.ok ? o.result.estimatedTimeSeconds : 0))
        .join(',')}`;
      if (signature === lastSignatureRef.current && originData !== null) {
        return;
      }
      lastSignatureRef.current = signature;

      const nodeCoords = getNodeCoords();
      const layers: OptionLayerState[] = [];

      routeOptions.forEach((option, idx) => {
        const color = ROUTE_PALETTE[idx % ROUTE_PALETTE.length];
        const { activeFeatures, dimmedFeatures } = buildRouteLayerData(
          option.result,
          selectedLevel,
          nodeCoords,
        );

        layers.push({
          id: `route-option-${idx}`,
          color,
          active: activeFeatures.length > 0
            ? { type: 'FeatureCollection', features: activeFeatures }
            : null,
          dimmed: dimmedFeatures.length > 0
            ? { type: 'FeatureCollection', features: dimmedFeatures }
            : null,
        });
      });

      setOptionLayers(layers);

      const origin = state.routeOrigin;
      const dest = state.routeDestination;

      setOriginData(
        origin && origin.level === selectedLevel
          ? {
              type: 'FeatureCollection',
              features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: origin.coordinates },
                properties: { label: '출' },
              }],
            }
          : null,
      );

      setDestinationData(
        dest && dest.level === selectedLevel
          ? {
              type: 'FeatureCollection',
              features: [{
                type: 'Feature',
                geometry: { type: 'Point', coordinates: dest.coordinates },
                properties: { label: '도' },
              }],
            }
          : null,
      );
    };

    rebuild();

    const unsubRoute = useRouteStore.subscribe(rebuild);
    const unsubLevel = useMapStore.subscribe((s, p) => {
      if (s.selectedLevel === p.selectedLevel) return;
      rebuild();
    });

    return () => {
      unsubRoute();
      unsubLevel();
    };
  }, []);

  if (optionLayers.length === 0 && !originData && !destinationData) {
    return null;
  }

  const { selectedRouteIndex } = useRouteStore.getState();

  return (
    <>
      {optionLayers.map((layer, idx) => {
        const isSelected = idx === selectedRouteIndex;
        const activeWidth = isSelected ? 5 : 3;
        const activeOpacity = isSelected ? 1.0 : 0.55;
        const dimmedWidth = isSelected ? 2.5 : 1.5;
        const dimmedOpacity = isSelected ? 0.35 : 0.18;

        return (
          <React.Fragment key={layer.id}>
            {layer.dimmed && (
              <GeoJSONSource id={`${layer.id}-dimmed-source`} data={layer.dimmed}>
                <Layer
                  id={`${layer.id}-dimmed`}
                  type="line"
                  paint={{
                    'line-color': layer.color,
                    'line-opacity': dimmedOpacity,
                    'line-width': dimmedWidth,
                  }}
                />
              </GeoJSONSource>
            )}

            {layer.active && (
              <GeoJSONSource id={`${layer.id}-active-source`} data={layer.active}>
                <Layer
                  id={`${layer.id}-active`}
                  type="line"
                  paint={{
                    'line-color': layer.color,
                    'line-opacity': activeOpacity,
                    'line-width': activeWidth,
                  }}
                />
              </GeoJSONSource>
            )}
          </React.Fragment>
        );
      })}

      {originData && (
        <GeoJSONSource id="route-origin-source" data={originData}>
          <Layer
            id="route-origin-marker"
            type="circle"
            paint={{
              'circle-radius': 10,
              'circle-color': '#34C759',
              'circle-opacity': 1.0,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#FFFFFF',
            }}
          />
          <Layer
            id="route-origin-label"
            type="symbol"
            layout={{
              'text-field': ['get', 'label'],
              'text-size': 12,
              'text-anchor': 'center',
              'text-justify': 'center',
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': '#FFFFFF' }}
          />
        </GeoJSONSource>
      )}

      {destinationData && (
        <GeoJSONSource id="route-destination-source" data={destinationData}>
          <Layer
            id="route-destination-marker"
            type="circle"
            paint={{
              'circle-radius': 10,
              'circle-color': '#FF3B30',
              'circle-opacity': 1.0,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#FFFFFF',
            }}
          />
          <Layer
            id="route-destination-label"
            type="symbol"
            layout={{
              'text-field': ['get', 'label'],
              'text-size': 12,
              'text-anchor': 'center',
              'text-justify': 'center',
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': '#FFFFFF' }}
          />
        </GeoJSONSource>
      )}
    </>
  );
}

export default React.memo(RoutePathLayer);
