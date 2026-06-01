declare module '*.geojson' {
  const value: import('./geojson').CampusGeoJSON;
  export default value;
}
