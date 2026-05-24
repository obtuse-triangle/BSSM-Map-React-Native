export interface PercentPoint {
  x: number;
  y: number;
}

export interface PercentRect extends PercentPoint {
  width: number;
  height: number;
}

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutRect extends LayoutPoint {
  width: number;
  height: number;
}

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export const clampPercent = (value: number): number => {
  return clamp(value, 0, 100);
};

export const percentToLayout = (percent: number, layoutSize: number): number => {
  return (percent / 100) * layoutSize;
};

export const percentPointToLayoutPoint = (
  point: PercentPoint,
  layoutWidth: number,
  layoutHeight: number,
): LayoutPoint => {
  return {
    x: percentToLayout(point.x, layoutWidth),
    y: percentToLayout(point.y, layoutHeight),
  };
};

export const percentRectToLayoutRect = (
  rect: PercentRect,
  layoutWidth: number,
  layoutHeight: number,
): LayoutRect => {
  return {
    x: percentToLayout(rect.x, layoutWidth),
    y: percentToLayout(rect.y, layoutHeight),
    width: percentToLayout(rect.width, layoutWidth),
    height: percentToLayout(rect.height, layoutHeight),
  };
};
