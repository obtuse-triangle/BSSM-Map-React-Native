import { StyleSheet, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';

// @ts-expect-error - GeoJSON import requires allowArbitraryExtensions + d.ts declaration
import campusData from '../../data/campus-wgs84.geojson';

const CAMPUS_BOUNDS: [number, number, number, number] = [128.9028, 35.1876, 128.9041, 35.1893];
const CAMPUS_CENTER: [number, number] = [128.9035, 35.1885];

export default function CampusMap() {
  return (
    <View style={styles.container}>
      <Map mapStyle="https://demotiles.maplibre.org/style.json" style={styles.map}>
        <Camera
          initialViewState={{
            center: CAMPUS_CENTER,
            zoom: 17,
            bounds: CAMPUS_BOUNDS,
          }}
        />
        <GeoJSONSource id="campus-polygons" data={campusData}>
          <Layer
            id="campus-fill"
            type="fill"
            paint={{
              'fill-color': '#e8e8e8',
              'fill-opacity': 0.7,
            }}
          />
          <Layer
            id="campus-outline"
            type="line"
            paint={{
              'line-color': '#333333',
              'line-width': 1,
            }}
          />
        </GeoJSONSource>
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
