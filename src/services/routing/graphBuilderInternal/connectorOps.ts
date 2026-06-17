/** Sort connectors for deterministic iteration order. */
export function sortConnectors(features: any[]): any[] {
  return [...features].sort((a, b) => {
    const at = a.properties.connectorType as string;
    const bt = b.properties.connectorType as string;
    if (at !== bt) return at.localeCompare(bt);
    const [af, ato] = a.properties.connectsLevels as [number, number];
    const [bf, bto] = b.properties.connectsLevels as [number, number];
    if (af !== bf) return af - bf;
    if (ato !== bto) return ato - bto;
    const [aLng] = a.geometry.coordinates as [number, number];
    const [bLng] = b.geometry.coordinates as [number, number];
    return aLng - bLng;
  });
}
