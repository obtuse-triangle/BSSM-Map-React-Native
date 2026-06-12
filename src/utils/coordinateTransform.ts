import proj4 from 'proj4';

/**
 * EPSG:5183 — Korean TM Central Belt (GRS80)
 * Used for domestic Korean survey / GIS data.
 * Central meridian: 129°E, Latitude of origin: 38°N
 * False easting: 200,000 m, False northing: 500,000 m
 */
export const EPSG_5183 =
  '+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs';

/**
 * EPSG:4326 — WGS84 longitude/latitude
 */
export const EPSG_4326 = '+proj=longlat +datum=WGS84 +no_defs';

/**
 * Transform an EPSG:5183 (Korean TM) coordinate pair to WGS84 [longitude, latitude].
 *
 * @param x - Easting in metres (EPSG:5183)
 * @param y - Northing in metres (EPSG:5183)
 * @returns A tuple of [longitude, latitude] in decimal degrees
 * @throws {Error} If either coordinate is NaN or non-finite
 */
export function transformEpsg5183ToWgs84(
  x: number,
  y: number,
): [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(
      `CoordinateTransform: x and y must be finite numbers. Received x=${x}, y=${y}`,
    );
  }

  const result = proj4(EPSG_5183, EPSG_4326, [x, y]) as [number, number];
  return result;
}

/**
 * Transform a WGS84 [longitude, latitude] coordinate pair to EPSG:5183 (Korean TM).
 *
 * This is the exact inverse of {@link transformEpsg5183ToWgs84}.
 *
 * @param lon - Longitude in decimal degrees (WGS84)
 * @param lat - Latitude in decimal degrees (WGS84)
 * @returns A tuple of [x, y] in metres (EPSG:5183 easting, northing)
 * @throws {Error} If either coordinate is NaN or non-finite
 */
export function transformWgs84ToEpsg5183(
  lon: number,
  lat: number,
): [number, number] {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error(
      `CoordinateTransform: lon and lat must be finite numbers. Received lon=${lon}, lat=${lat}`,
    );
  }

  const result = proj4(EPSG_4326, EPSG_5183, [lon, lat]) as [number, number];
  return result;
}
