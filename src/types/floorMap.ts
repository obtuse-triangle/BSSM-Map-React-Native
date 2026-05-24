export type FloorKey = string;

export interface FloorElement {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  interactive: boolean | null;
}

export interface Floor {
  label: string;
  elements: readonly FloorElement[];
}

export interface FloorMapData {
  version: number;
  school: string;
  floors: Record<string, Floor>;
}

export interface FloorListItem {
  floorKey: FloorKey;
  floor: Floor;
}
