/**
 * Campus WGS84 bounds for BSSM (Busan Software Meister High School).
 *
 * These values are derived from the campus GeoJSON feature validation
 * (see `src/data/validate-geojson.ts`).  Any BLE WCL coordinate that falls
 * outside these bounds is rejected as invalid.
 */
export const CAMPUS_BOUNDS = {
  /** Minimum longitude (decimal degrees) */
  minLongitude: 128.9027,
  /** Maximum longitude (decimal degrees) */
  maxLongitude: 128.9042,
  /** Minimum latitude (decimal degrees) */
  minLatitude: 35.1875,
  /** Maximum latitude (decimal degrees) */
  maxLatitude: 35.1894,
} as const;
