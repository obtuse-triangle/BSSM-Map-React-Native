/**
 * [LEGACY - deprecated in favor of CampusMap]
 * 
 * This component uses the old SVG-based map rendering with map-percent coordinates.
 * It is preserved for RTT/BLE indoor positioning reference but should not be used
 * in production. The MapLibre-based CampusMap component replaces this entirely.
 * 
 * @see src/components/map/CampusMap.tsx — the replacement
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import Svg, { Circle, G, Rect, Text as SvgText } from 'react-native-svg';

import type { AccessPoint } from '../../types/accessPoint';
import type { Floor, FloorElement, FloorKey } from '../../types/floorMap';
import type { IndoorPosition } from '../../types/position';
import { FeedbackStateCard } from '../feedback/FeedbackStateCard';

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

const LANDSCAPE_MAP_HEIGHT = 100;
const PORTRAIT_MAP_WIDTH = 100;
const PORTRAIT_MAP_HEIGHT = 165;
const INITIAL_VIEW_MARGIN = 1.04;
const MIN_SCALE = 0.85;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.5;
const MIN_PINCH_SCALE = 0.05;
const CAMERA_TIMING_CONFIG = { duration: 160 };
const DOUBLE_TAP_DRAG_MAX_DELAY_MS = 300;
const DOUBLE_TAP_DRAG_MAX_TAP_DURATION_MS = 240;
const DOUBLE_TAP_DRAG_MAX_DISTANCE = 26;
const DOUBLE_TAP_DRAG_PIXELS_PER_SCALE = 170;

type Camera = {
  x: number;
  y: number;
  width: number;
};

type TouchPoint = {
  x: number;
  y: number;
};

type TwoTouchMetrics = {
  distance: number;
  valid: 0 | 1;
  x: number;
  y: number;
};

type NativeFloorMapProps = {
  floorKey: FloorKey | null;
  floor: Floor | undefined;
  topObstructionHeight: number;
  bottomObstructionHeight: number;
  selectedRoomId: number | null;
  onSelectRoom: (room: FloorElement) => void;
  accessPoints: readonly AccessPoint[];
  currentPosition: IndoorPosition | null;
  showApMarkers: boolean;
};

const clamp = (value: number, min: number, max: number) => {
  'worklet';

  return Math.min(Math.max(value, min), max);
};

const getViewportAspect = (width: number, height: number) => {
  return width > 0 && height > 0 ? width / height : 0;
};

const percentToWorldSize = (percent: number) => {
  return (percent / 100) * LANDSCAPE_MAP_HEIGHT;
};

const landscapePointToPortraitPoint = (x: number, y: number) => {
  return {
    x: LANDSCAPE_MAP_HEIGHT - y,
    y: x,
  };
};

const landscapeRectToPortraitRect = (x: number, y: number, width: number, height: number) => {
  return {
    x: LANDSCAPE_MAP_HEIGHT - y - height,
    y: x,
    width: height,
    height: width,
  };
};

const getInitialViewWidth = (viewportWidth: number, viewportHeight: number) => {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return 0;
  }

  return PORTRAIT_MAP_HEIGHT * INITIAL_VIEW_MARGIN * (viewportWidth / viewportHeight);
};

const getViewHeight = (viewWidth: number, viewportAspect: number) => {
  'worklet';

  return viewportAspect > 0 ? viewWidth / viewportAspect : 0;
};

const clampAxis = (position: number, viewSize: number, worldSize: number, slack: number) => {
  'worklet';

  if (viewSize >= worldSize) {
    const centered = (worldSize - viewSize) / 2;

    return clamp(position, centered - slack, centered + slack);
  }

  return clamp(position, -slack, worldSize - viewSize + slack);
};

const clampCamera = (x: number, y: number, viewWidth: number, viewportAspect: number) => {
  'worklet';

  const viewHeight = getViewHeight(viewWidth, viewportAspect);
  const panSlackX = Math.min(12, Math.max(4, viewWidth * 0.16));
  const panSlackY = Math.min(16, Math.max(4, viewHeight * 0.14));

  return {
    x: clampAxis(x, viewWidth, PORTRAIT_MAP_WIDTH, panSlackX),
    y: clampAxis(y, viewHeight, PORTRAIT_MAP_HEIGHT, panSlackY),
  };
};

const getTwoTouchMetrics = (touches: readonly TouchPoint[], topOffset: number): TwoTouchMetrics => {
  'worklet';

  if (touches.length < 2) {
    return { distance: 0, valid: 0, x: 0, y: 0 };
  }

  const firstTouch = touches[0];
  const secondTouch = touches[1];
  const deltaX = secondTouch.x - firstTouch.x;
  const deltaY = secondTouch.y - firstTouch.y;

  return {
    distance: Math.hypot(deltaX, deltaY),
    valid: 1,
    x: (firstTouch.x + secondTouch.x) / 2,
    y: (firstTouch.y + secondTouch.y) / 2 - topOffset,
  };
};

const getGestureTimestamp = () => {
  'worklet';

  return typeof performance === 'undefined' ? Date.now() : performance.now();
};

const getDistance = (x1: number, y1: number, x2: number, y2: number) => {
  'worklet';

  return Math.hypot(x2 - x1, y2 - y1);
};

const getRoomLabelFontSize = (layout: { width: number; height: number }, label: string) => {
  const lengthFactor = Math.max(0.58, 1 - Math.max(0, label.length - 5) * 0.055);
  const roomFit = Math.min(layout.width * 0.15, layout.height * 0.24, 2.15);

  return Math.max(1.05, roomFit * lengthFactor);
};

export function NativeFloorMap({
  floorKey,
  floor,
  topObstructionHeight,
  bottomObstructionHeight,
  selectedRoomId,
  onSelectRoom,
  accessPoints,
  currentPosition,
  showApMarkers,
}: NativeFloorMapProps) {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const cameraWidth = useSharedValue(0);
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);
  const pinchStartWidth = useSharedValue(0);
  const pinchStartFocalX = useSharedValue(0);
  const pinchStartFocalY = useSharedValue(0);
  const pinchStartDistance = useSharedValue(0);
  const pinchActive = useSharedValue(0);
  const panSequenceBlocked = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const panStartWidth = useSharedValue(0);
  const oneFingerZoomActive = useSharedValue(0);
  const oneFingerZoomFirstTapReady = useSharedValue(0);
  const oneFingerZoomFirstTapAt = useSharedValue(0);
  const oneFingerZoomFirstTapX = useSharedValue(0);
  const oneFingerZoomFirstTapY = useSharedValue(0);
  const oneFingerZoomCandidate = useSharedValue(0);
  const oneFingerZoomDownAt = useSharedValue(0);
  const oneFingerZoomDownX = useSharedValue(0);
  const oneFingerZoomDownY = useSharedValue(0);
  const oneFingerZoomStartX = useSharedValue(0);
  const oneFingerZoomStartY = useSharedValue(0);
  const oneFingerZoomStartWidth = useSharedValue(0);
  const oneFingerZoomFocalX = useSharedValue(0);
  const oneFingerZoomFocalY = useSharedValue(0);
  const oneFingerZoomStartTouchY = useSharedValue(0);
  const viewportSizeRef = useRef(viewportSize);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, width: 0 });
  const viewportCameraMetricsRef = useRef({ initialViewWidth: 0, viewportAspect: 0 });

  const viewportWidth = viewportSize.width;
  const viewportHeight = viewportSize.height;
  const visibleTopOffset = Math.max(0, Math.min(topObstructionHeight, Math.max(0, viewportHeight - 1)));
  const effectiveViewportHeight = Math.max(1, viewportHeight - visibleTopOffset - bottomObstructionHeight);
  const viewportAspect = useMemo(() => getViewportAspect(viewportWidth, effectiveViewportHeight), [effectiveViewportHeight, viewportWidth]);
  const initialViewWidth = useMemo(() => getInitialViewWidth(viewportWidth, effectiveViewportHeight), [effectiveViewportHeight, viewportWidth]);
  const minViewWidth = useMemo(() => (initialViewWidth > 0 ? initialViewWidth / MAX_SCALE : 0), [initialViewWidth]);
  const maxViewWidth = useMemo(() => (initialViewWidth > 0 ? initialViewWidth / MIN_SCALE : 0), [initialViewWidth]);

  useEffect(() => {
    viewportSizeRef.current = viewportSize;
  }, [viewportSize]);

  const syncCameraRef = useCallback((x: number, y: number, width: number) => {
    cameraRef.current = { x, y, width };
  }, []);

  const setSharedCamera = useCallback(
    (nextCamera: Camera, animated = false) => {
      if (viewportAspect <= 0 || nextCamera.width <= 0) {
        return;
      }

      const clamped = clampCamera(nextCamera.x, nextCamera.y, nextCamera.width, viewportAspect);
      cameraRef.current = { x: clamped.x, y: clamped.y, width: nextCamera.width };

      if (animated) {
        cameraX.value = withTiming(clamped.x, CAMERA_TIMING_CONFIG);
        cameraY.value = withTiming(clamped.y, CAMERA_TIMING_CONFIG);
        cameraWidth.value = withTiming(nextCamera.width, CAMERA_TIMING_CONFIG);
      } else {
        cameraX.value = clamped.x;
        cameraY.value = clamped.y;
        cameraWidth.value = nextCamera.width;
      }

      pinchStartX.value = clamped.x;
      pinchStartY.value = clamped.y;
      pinchStartWidth.value = nextCamera.width;
      pinchStartFocalX.value = viewportWidth / 2;
      pinchStartFocalY.value = effectiveViewportHeight / 2;
      pinchStartDistance.value = 0;
      pinchActive.value = 0;
      panSequenceBlocked.value = 0;
      panStartX.value = clamped.x;
      panStartY.value = clamped.y;
      panStartWidth.value = nextCamera.width;
      oneFingerZoomActive.value = 0;
      oneFingerZoomCandidate.value = 0;
      oneFingerZoomFirstTapReady.value = 0;
      oneFingerZoomStartX.value = clamped.x;
      oneFingerZoomStartY.value = clamped.y;
      oneFingerZoomStartWidth.value = nextCamera.width;
    },
    [
      cameraWidth,
      cameraX,
      cameraY,
      effectiveViewportHeight,
      oneFingerZoomActive,
      oneFingerZoomCandidate,
      oneFingerZoomFirstTapReady,
      oneFingerZoomStartWidth,
      oneFingerZoomStartX,
      oneFingerZoomStartY,
      panSequenceBlocked,
      panStartWidth,
      panStartX,
      panStartY,
      pinchActive,
      pinchStartDistance,
      pinchStartFocalX,
      pinchStartFocalY,
      pinchStartWidth,
      pinchStartX,
      pinchStartY,
      viewportAspect,
      viewportWidth,
    ],
  );

  const resetCamera = useCallback(() => {
    if (viewportAspect <= 0 || initialViewWidth <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
      return;
    }

    const initialViewHeight = getViewHeight(initialViewWidth, viewportAspect);
    const centeredX = (PORTRAIT_MAP_WIDTH - initialViewWidth) / 2;
    const centeredY = (PORTRAIT_MAP_HEIGHT - initialViewHeight) / 2;
    const clamped = clampCamera(centeredX, centeredY, initialViewWidth, viewportAspect);

    const nextCamera = { x: clamped.x, y: clamped.y, width: initialViewWidth };

    setSharedCamera(nextCamera);
  }, [initialViewWidth, setSharedCamera, viewportAspect, viewportHeight, viewportWidth]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    const nextHeight = Math.round(event.nativeEvent.layout.height);

    if (nextWidth !== viewportSizeRef.current.width || nextHeight !== viewportSizeRef.current.height) {
      setViewportSize({ width: nextWidth, height: nextHeight });
    }
  };

  useEffect(() => {
    if (viewportAspect <= 0 || initialViewWidth <= 0 || minViewWidth <= 0 || maxViewWidth <= 0) {
      return;
    }

    const previousMetrics = viewportCameraMetricsRef.current;
    const currentCamera = cameraRef.current;

    viewportCameraMetricsRef.current = { initialViewWidth, viewportAspect };

    if (currentCamera.width <= 0 || previousMetrics.initialViewWidth <= 0 || previousMetrics.viewportAspect <= 0) {
      resetCamera();
      return;
    }

    if (previousMetrics.initialViewWidth === initialViewWidth && previousMetrics.viewportAspect === viewportAspect) {
      return;
    }

    const currentScale = previousMetrics.initialViewWidth / currentCamera.width;
    const nextWidth = clamp(initialViewWidth / currentScale, minViewWidth, maxViewWidth);
    const currentCenterX = currentCamera.x + currentCamera.width / 2;
    const currentCenterY = currentCamera.y + getViewHeight(currentCamera.width, previousMetrics.viewportAspect) / 2;
    const nextViewHeight = getViewHeight(nextWidth, viewportAspect);

    setSharedCamera({
      x: currentCenterX - nextWidth / 2,
      y: currentCenterY - nextViewHeight / 2,
      width: nextWidth,
    });
  }, [initialViewWidth, maxViewWidth, minViewWidth, resetCamera, setSharedCamera, viewportAspect]);

  const roomLayouts = useMemo(() => {
    if (!floor) {
      return [];
    }

    return floor.elements.map((element) => {
      const layout = landscapeRectToPortraitRect(element.x, element.y, element.width, element.height);
      const label = element.name.trim();

      return {
        element,
        fontSize: label ? getRoomLabelFontSize(layout, label) : 0,
        interactive: element.interactive === true,
        label,
        layout,
        selected: element.id === selectedRoomId,
      };
    });
  }, [floor, selectedRoomId]);

  const roomNodes = useMemo(() => {
    return roomLayouts.map(({ element, fontSize, interactive, label, layout, selected }) => {
      const fill = selected ? '#1d4ed8' : interactive ? '#dbeafe' : '#e2e8f0';
      const stroke = selected ? '#1d4ed8' : interactive ? '#60a5fa' : '#cbd5e1';
      const labelColor = selected ? '#ffffff' : '#0f172a';

      return (
        <G key={element.id}>
          <Rect
            fill={fill}
            height={layout.height}
            onPress={interactive ? () => onSelectRoom(element) : undefined}
            rx={0.35}
            ry={0.35}
            stroke={stroke}
            strokeWidth={selected ? 0.75 : 0.55}
            width={layout.width}
            x={layout.x}
            y={layout.y}
          />
          {label ? (
            <SvgText
              fill={labelColor}
              fontSize={fontSize}
              fontWeight="700"
              pointerEvents="none"
              textAnchor="middle"
              x={layout.x + layout.width / 2}
              y={layout.y + layout.height / 2 + fontSize * 0.34}
            >
              {label}
            </SvgText>
          ) : null}
        </G>
      );
    });
  }, [onSelectRoom, roomLayouts]);

  const accessPointNodes = useMemo(() => {
    if (!floor || !floorKey || !showApMarkers) {
      return null;
    }

    return accessPoints.map((accessPoint) => {
      const position = landscapePointToPortraitPoint(accessPoint.x, accessPoint.y);

      return (
        <G key={accessPoint.id} pointerEvents="none">
          <Circle cx={position.x} cy={position.y} fill="#1d4ed8" r={1.35} stroke="#ffffff" strokeWidth={0.4} />
          <SvgText fill="#ffffff" fontSize={1.05} fontWeight="800" textAnchor="middle" x={position.x} y={position.y + 0.36}>
            AP
          </SvgText>
        </G>
      );
    });
  }, [accessPoints, floor, floorKey, showApMarkers]);

  const currentPositionNode = useMemo(() => {
    if (!currentPosition || !floorKey || currentPosition.floorKey !== floorKey) {
      return null;
    }

    const position = landscapePointToPortraitPoint(currentPosition.x, currentPosition.y);
    const accuracyRadius = percentToWorldSize(Math.max(4, Math.min(currentPosition.accuracyMeters * 1.2, 18)));

    return (
      <G pointerEvents="none">
        <Circle
          cx={position.x}
          cy={position.y}
          fill="rgba(37, 99, 235, 0.12)"
          r={accuracyRadius}
          stroke="rgba(37, 99, 235, 0.42)"
          strokeWidth={0.75}
        />
        <Circle cx={position.x} cy={position.y} fill="#ffffff" r={1.9} stroke="#1d4ed8" strokeWidth={1.7} />
        <Circle cx={position.x} cy={position.y} fill="#1d4ed8" r={0.75} />
      </G>
    );
  }, [currentPosition, floorKey]);

  const mapCanvasStyle = useAnimatedStyle(
    () => {
      const activeCameraWidth = cameraWidth.value > 0 ? cameraWidth.value : initialViewWidth;
      const worldPixelsPerUnit = activeCameraWidth > 0 && viewportWidth > 0 ? viewportWidth / activeCameraWidth : 0;

      if (worldPixelsPerUnit <= 0) {
        return {
          height: 0,
          width: 0,
        };
      }

      return {
        height: PORTRAIT_MAP_HEIGHT * worldPixelsPerUnit,
        transform: [
          { translateX: -cameraX.value * worldPixelsPerUnit },
          { translateY: visibleTopOffset - cameraY.value * worldPixelsPerUnit },
        ],
        width: PORTRAIT_MAP_WIDTH * worldPixelsPerUnit,
      };
    },
    [initialViewWidth, visibleTopOffset, viewportWidth],
  );

  const pinchGesture = useMemo(() => {
    return Gesture.Pinch()
      .onBegin(() => {
        pinchActive.value = 1;
        panSequenceBlocked.value = 1;
        oneFingerZoomActive.value = 0;
        oneFingerZoomCandidate.value = 0;
        cancelAnimation(cameraX);
        cancelAnimation(cameraY);
        cancelAnimation(cameraWidth);
      })
      .onTouchesDown((event) => {
        if (event.numberOfTouches < 2 || viewportAspect <= 0 || viewportWidth <= 0 || effectiveViewportHeight <= 0 || cameraWidth.value <= 0) {
          return;
        }

        const metrics = getTwoTouchMetrics(event.allTouches, visibleTopOffset);

        if (metrics.valid === 0 || metrics.distance <= 0) {
          return;
        }

        pinchActive.value = 1;
        panSequenceBlocked.value = 1;
        pinchStartX.value = cameraX.value;
        pinchStartY.value = cameraY.value;
        pinchStartWidth.value = cameraWidth.value;
        pinchStartFocalX.value = clamp(metrics.x, 0, viewportWidth);
        pinchStartFocalY.value = clamp(metrics.y, 0, effectiveViewportHeight);
        pinchStartDistance.value = metrics.distance;
      })
      .onTouchesMove((event) => {
        if (
          event.numberOfTouches < 2 ||
          viewportAspect <= 0 ||
          viewportWidth <= 0 ||
          effectiveViewportHeight <= 0 ||
          minViewWidth <= 0 ||
          maxViewWidth <= 0 ||
          cameraWidth.value <= 0
        ) {
          return;
        }

        const metrics = getTwoTouchMetrics(event.allTouches, visibleTopOffset);

        if (metrics.valid === 0 || metrics.distance <= 0) {
          return;
        }

        if (pinchStartWidth.value <= 0 || pinchStartDistance.value <= 0 || pinchActive.value === 0) {
          pinchActive.value = 1;
          panSequenceBlocked.value = 1;
          pinchStartX.value = cameraX.value;
          pinchStartY.value = cameraY.value;
          pinchStartWidth.value = cameraWidth.value;
          pinchStartFocalX.value = clamp(metrics.x, 0, viewportWidth);
          pinchStartFocalY.value = clamp(metrics.y, 0, effectiveViewportHeight);
          pinchStartDistance.value = metrics.distance;
          return;
        }

        const focalX = clamp(metrics.x, 0, viewportWidth);
        const focalY = clamp(metrics.y, 0, effectiveViewportHeight);
        const previousWidth = cameraWidth.value;
        const scale = Math.max(metrics.distance / Math.max(pinchStartDistance.value, 1), MIN_PINCH_SCALE);
        const nextWidth = clamp(previousWidth / scale, minViewWidth, maxViewWidth);
        const startWorldPerPixel = previousWidth / viewportWidth;
        const nextWorldPerPixel = nextWidth / viewportWidth;
        const focalWorldX = cameraX.value + pinchStartFocalX.value * startWorldPerPixel;
        const focalWorldY = cameraY.value + pinchStartFocalY.value * startWorldPerPixel;
        const clamped = clampCamera(
          focalWorldX - focalX * nextWorldPerPixel,
          focalWorldY - focalY * nextWorldPerPixel,
          nextWidth,
          viewportAspect,
        );

        cameraX.value = clamped.x;
        cameraY.value = clamped.y;
        cameraWidth.value = nextWidth;
        pinchStartX.value = clamped.x;
        pinchStartY.value = clamped.y;
        pinchStartWidth.value = nextWidth;
        pinchStartFocalX.value = focalX;
        pinchStartFocalY.value = focalY;
        pinchStartDistance.value = metrics.distance;
      })
      .onTouchesUp((event) => {
        if (event.numberOfTouches < 2) {
          pinchActive.value = 0;
          pinchStartDistance.value = 0;
          runOnJS(syncCameraRef)(cameraX.value, cameraY.value, cameraWidth.value);
        }
      })
      .onTouchesCancelled(() => {
        pinchActive.value = 0;
        pinchStartDistance.value = 0;
      })
      .onFinalize(() => {
        pinchActive.value = 0;
        pinchStartDistance.value = 0;

        if (viewportAspect <= 0 || cameraWidth.value <= 0) {
          return;
        }

        const clamped = clampCamera(cameraX.value, cameraY.value, cameraWidth.value, viewportAspect);

        cameraX.value = clamped.x;
        cameraY.value = clamped.y;
        runOnJS(syncCameraRef)(clamped.x, clamped.y, cameraWidth.value);
      });
  }, [
    cameraWidth,
    cameraX,
    cameraY,
    effectiveViewportHeight,
    maxViewWidth,
    minViewWidth,
    oneFingerZoomActive,
    oneFingerZoomCandidate,
    panSequenceBlocked,
    pinchActive,
    pinchStartDistance,
    pinchStartFocalX,
    pinchStartFocalY,
    pinchStartWidth,
    pinchStartX,
    pinchStartY,
    syncCameraRef,
    viewportAspect,
    viewportWidth,
    visibleTopOffset,
  ]);

  const oneFingerZoomGesture = useMemo(() => {
    return Gesture.Manual()
      .onTouchesDown((event, stateManager) => {
        const touch = event.allTouches[0] ?? event.changedTouches[0];

        if (!touch) {
          return;
        }

        if (event.numberOfTouches !== 1) {
          const wasActive = oneFingerZoomActive.value === 1;

          oneFingerZoomActive.value = 0;
          oneFingerZoomCandidate.value = 0;
          oneFingerZoomFirstTapReady.value = 0;

          if (wasActive) {
            runOnJS(syncCameraRef)(cameraX.value, cameraY.value, cameraWidth.value);
            stateManager.end();
          }

          return;
        }

        const now = getGestureTimestamp();
        const localX = clamp(touch.x, 0, viewportWidth);
        const localY = clamp(touch.y - visibleTopOffset, 0, effectiveViewportHeight);
        const isDoubleTapDragStart =
          oneFingerZoomFirstTapReady.value === 1 &&
          now - oneFingerZoomFirstTapAt.value <= DOUBLE_TAP_DRAG_MAX_DELAY_MS &&
          getDistance(localX, localY, oneFingerZoomFirstTapX.value, oneFingerZoomFirstTapY.value) <= DOUBLE_TAP_DRAG_MAX_DISTANCE;

        if (
          isDoubleTapDragStart &&
          viewportAspect > 0 &&
          viewportWidth > 0 &&
          effectiveViewportHeight > 0 &&
          initialViewWidth > 0 &&
          minViewWidth > 0 &&
          maxViewWidth > 0 &&
          cameraWidth.value > 0
        ) {
          cancelAnimation(cameraX);
          cancelAnimation(cameraY);
          cancelAnimation(cameraWidth);

          oneFingerZoomActive.value = 1;
          oneFingerZoomCandidate.value = 0;
          oneFingerZoomFirstTapReady.value = 0;
          panSequenceBlocked.value = 1;
          oneFingerZoomStartX.value = cameraX.value;
          oneFingerZoomStartY.value = cameraY.value;
          oneFingerZoomStartWidth.value = cameraWidth.value;
          oneFingerZoomFocalX.value = localX;
          oneFingerZoomFocalY.value = localY;
          oneFingerZoomStartTouchY.value = localY;
          stateManager.begin();
          stateManager.activate();
          return;
        }

        if (oneFingerZoomFirstTapReady.value === 1 && now - oneFingerZoomFirstTapAt.value > DOUBLE_TAP_DRAG_MAX_DELAY_MS) {
          oneFingerZoomFirstTapReady.value = 0;
        }

        oneFingerZoomActive.value = 0;
        oneFingerZoomCandidate.value = 1;
        oneFingerZoomDownAt.value = now;
        oneFingerZoomDownX.value = localX;
        oneFingerZoomDownY.value = localY;
      })
      .onTouchesMove((event, stateManager) => {
        const touch = event.allTouches[0] ?? event.changedTouches[0];

        if (!touch) {
          return;
        }

        if (event.numberOfTouches !== 1) {
          const wasActive = oneFingerZoomActive.value === 1;

          oneFingerZoomActive.value = 0;
          oneFingerZoomCandidate.value = 0;

          if (wasActive) {
            runOnJS(syncCameraRef)(cameraX.value, cameraY.value, cameraWidth.value);
            stateManager.end();
          }

          return;
        }

        const localX = clamp(touch.x, 0, viewportWidth);
        const localY = clamp(touch.y - visibleTopOffset, 0, effectiveViewportHeight);

        if (oneFingerZoomActive.value === 1) {
          if (
            viewportAspect <= 0 ||
            viewportWidth <= 0 ||
            effectiveViewportHeight <= 0 ||
            initialViewWidth <= 0 ||
            minViewWidth <= 0 ||
            maxViewWidth <= 0 ||
            oneFingerZoomStartWidth.value <= 0
          ) {
            return;
          }

          const startScale = initialViewWidth / oneFingerZoomStartWidth.value;
          const dragScale = Math.pow(2, (localY - oneFingerZoomStartTouchY.value) / DOUBLE_TAP_DRAG_PIXELS_PER_SCALE);
          const nextScale = clamp(startScale * dragScale, MIN_SCALE, MAX_SCALE);
          const nextWidth = clamp(initialViewWidth / nextScale, minViewWidth, maxViewWidth);
          const startWorldPerPixel = oneFingerZoomStartWidth.value / viewportWidth;
          const nextWorldPerPixel = nextWidth / viewportWidth;
          const anchorWorldX = oneFingerZoomStartX.value + oneFingerZoomFocalX.value * startWorldPerPixel;
          const anchorWorldY = oneFingerZoomStartY.value + oneFingerZoomFocalY.value * startWorldPerPixel;
          const clamped = clampCamera(
            anchorWorldX - oneFingerZoomFocalX.value * nextWorldPerPixel,
            anchorWorldY - oneFingerZoomFocalY.value * nextWorldPerPixel,
            nextWidth,
            viewportAspect,
          );

          cameraX.value = clamped.x;
          cameraY.value = clamped.y;
          cameraWidth.value = nextWidth;
          return;
        }

        if (
          oneFingerZoomCandidate.value === 1 &&
          (getGestureTimestamp() - oneFingerZoomDownAt.value > DOUBLE_TAP_DRAG_MAX_TAP_DURATION_MS ||
            getDistance(localX, localY, oneFingerZoomDownX.value, oneFingerZoomDownY.value) > DOUBLE_TAP_DRAG_MAX_DISTANCE)
        ) {
          oneFingerZoomCandidate.value = 0;
          oneFingerZoomFirstTapReady.value = 0;
        }
      })
      .onTouchesUp((event, stateManager) => {
        if (oneFingerZoomActive.value === 1) {
          if (event.numberOfTouches === 0) {
            oneFingerZoomActive.value = 0;
            oneFingerZoomCandidate.value = 0;
            panSequenceBlocked.value = 0;
            runOnJS(syncCameraRef)(cameraX.value, cameraY.value, cameraWidth.value);
            stateManager.end();
          }

          return;
        }

        if (oneFingerZoomCandidate.value === 0 || event.numberOfTouches !== 0) {
          return;
        }

        const touch = event.changedTouches[0] ?? event.allTouches[0];
        const now = getGestureTimestamp();
        const localX = touch ? clamp(touch.x, 0, viewportWidth) : oneFingerZoomDownX.value;
        const localY = touch ? clamp(touch.y - visibleTopOffset, 0, effectiveViewportHeight) : oneFingerZoomDownY.value;
        const isTap =
          now - oneFingerZoomDownAt.value <= DOUBLE_TAP_DRAG_MAX_TAP_DURATION_MS &&
          getDistance(localX, localY, oneFingerZoomDownX.value, oneFingerZoomDownY.value) <= DOUBLE_TAP_DRAG_MAX_DISTANCE;

        oneFingerZoomCandidate.value = 0;
        oneFingerZoomFirstTapReady.value = isTap ? 1 : 0;
        oneFingerZoomFirstTapAt.value = now;
        oneFingerZoomFirstTapX.value = localX;
        oneFingerZoomFirstTapY.value = localY;
      })
      .onTouchesCancelled((_, stateManager) => {
        const wasActive = oneFingerZoomActive.value === 1;

        oneFingerZoomActive.value = 0;
        oneFingerZoomCandidate.value = 0;
        oneFingerZoomFirstTapReady.value = 0;
        panSequenceBlocked.value = 0;

        if (wasActive) {
          runOnJS(syncCameraRef)(cameraX.value, cameraY.value, cameraWidth.value);
          stateManager.end();
        }
      });
  }, [
    cameraWidth,
    cameraX,
    cameraY,
    effectiveViewportHeight,
    initialViewWidth,
    maxViewWidth,
    minViewWidth,
    oneFingerZoomActive,
    oneFingerZoomCandidate,
    oneFingerZoomDownAt,
    oneFingerZoomDownX,
    oneFingerZoomDownY,
    oneFingerZoomFirstTapAt,
    oneFingerZoomFirstTapReady,
    oneFingerZoomFirstTapX,
    oneFingerZoomFirstTapY,
    oneFingerZoomFocalX,
    oneFingerZoomFocalY,
    oneFingerZoomStartTouchY,
    oneFingerZoomStartWidth,
    oneFingerZoomStartX,
    oneFingerZoomStartY,
    panSequenceBlocked,
    syncCameraRef,
    viewportAspect,
    viewportWidth,
    visibleTopOffset,
  ]);

  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .minDistance(3)
      .maxPointers(1)
      .onTouchesDown((event, stateManager) => {
        if (event.numberOfTouches > 1 || pinchActive.value === 1 || oneFingerZoomActive.value === 1) {
          panSequenceBlocked.value = 1;
          stateManager.fail();
          return;
        }

        if (event.numberOfTouches === 1) {
          panSequenceBlocked.value = 0;
        }
      })
      .onTouchesMove((event, stateManager) => {
        if (event.numberOfTouches > 1 || pinchActive.value === 1 || oneFingerZoomActive.value === 1 || panSequenceBlocked.value === 1) {
          stateManager.fail();
        }
      })
      .onTouchesUp((event) => {
        if (event.numberOfTouches === 0) {
          panSequenceBlocked.value = 0;
        }
      })
      .onTouchesCancelled(() => {
        panSequenceBlocked.value = 0;
      })
      .onBegin(() => {
        cancelAnimation(cameraX);
        cancelAnimation(cameraY);
        cancelAnimation(cameraWidth);
      })
      .onStart(() => {
        if (
          viewportAspect <= 0 ||
          viewportWidth <= 0 ||
          effectiveViewportHeight <= 0 ||
          cameraWidth.value <= 0 ||
          pinchActive.value === 1 ||
          oneFingerZoomActive.value === 1 ||
          panSequenceBlocked.value === 1
        ) {
          return;
        }

        panStartX.value = cameraX.value;
        panStartY.value = cameraY.value;
        panStartWidth.value = cameraWidth.value;
      })
      .onUpdate((event) => {
        if (
          viewportAspect <= 0 ||
          viewportWidth <= 0 ||
          effectiveViewportHeight <= 0 ||
          panStartWidth.value <= 0 ||
          event.numberOfPointers !== 1 ||
          pinchActive.value === 1 ||
          oneFingerZoomActive.value === 1 ||
          panSequenceBlocked.value === 1
        ) {
          return;
        }

        const worldPerPixel = panStartWidth.value / viewportWidth;
        const clamped = clampCamera(
          panStartX.value - event.translationX * worldPerPixel,
          panStartY.value - event.translationY * worldPerPixel,
          panStartWidth.value,
          viewportAspect,
        );

        cameraX.value = clamped.x;
        cameraY.value = clamped.y;
        cameraWidth.value = panStartWidth.value;
      })
      .onFinalize(() => {
        if (viewportAspect <= 0 || cameraWidth.value <= 0) {
          return;
        }

        const clamped = clampCamera(cameraX.value, cameraY.value, cameraWidth.value, viewportAspect);

        cameraX.value = clamped.x;
        cameraY.value = clamped.y;
        runOnJS(syncCameraRef)(clamped.x, clamped.y, cameraWidth.value);
      });
  }, [
    cameraWidth,
    cameraX,
    cameraY,
    effectiveViewportHeight,
    oneFingerZoomActive,
    panSequenceBlocked,
    panStartWidth,
    panStartX,
    panStartY,
    pinchActive,
    syncCameraRef,
    viewportAspect,
    viewportWidth,
  ]);

  const doubleTapGesture = useMemo(() => {
    return Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(280)
      .maxDistance(16)
      .onEnd((event, success) => {
        if (!success || viewportAspect <= 0 || viewportWidth <= 0 || effectiveViewportHeight <= 0 || initialViewWidth <= 0 || minViewWidth <= 0 || maxViewWidth <= 0 || cameraWidth.value <= 0) {
          return;
        }

        cancelAnimation(cameraX);
        cancelAnimation(cameraY);
        cancelAnimation(cameraWidth);

        const currentWidth = cameraWidth.value;
        const currentScale = initialViewWidth / currentWidth;
        const nextScale = currentScale >= MAX_SCALE * 0.88 ? 1 : clamp(currentScale * ZOOM_STEP, MIN_SCALE, MAX_SCALE);
        const nextWidth = initialViewWidth / nextScale;
        const localX = clamp(event.x, 0, viewportWidth);
        const localY = clamp(event.y - visibleTopOffset, 0, effectiveViewportHeight);
        const worldPerPixel = currentWidth / viewportWidth;
        const anchorWorldX = cameraX.value + localX * worldPerPixel;
        const anchorWorldY = cameraY.value + localY * worldPerPixel;
        const clamped = clampCamera(anchorWorldX - localX * (nextWidth / viewportWidth), anchorWorldY - localY * (nextWidth / viewportWidth), nextWidth, viewportAspect);

        cameraX.value = withTiming(clamped.x, CAMERA_TIMING_CONFIG);
        cameraY.value = withTiming(clamped.y, CAMERA_TIMING_CONFIG);
        cameraWidth.value = withTiming(nextWidth, CAMERA_TIMING_CONFIG);
        oneFingerZoomFirstTapReady.value = 0;
        runOnJS(syncCameraRef)(clamped.x, clamped.y, nextWidth);
      });
  }, [cameraWidth, cameraX, cameraY, effectiveViewportHeight, initialViewWidth, maxViewWidth, minViewWidth, oneFingerZoomFirstTapReady, syncCameraRef, viewportAspect, viewportWidth, visibleTopOffset]);

  const gesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, oneFingerZoomGesture, panGesture, doubleTapGesture),
    [doubleTapGesture, oneFingerZoomGesture, panGesture, pinchGesture],
  );

  const handleZoomFromCenter = (factor: number) => {
    if (viewportAspect <= 0 || viewportWidth <= 0 || effectiveViewportHeight <= 0 || initialViewWidth <= 0 || minViewWidth <= 0 || maxViewWidth <= 0) {
      return;
    }

    const currentCamera = cameraRef.current;

    if (currentCamera.width <= 0) {
      return;
    }

    cancelAnimation(cameraX);
    cancelAnimation(cameraY);
    cancelAnimation(cameraWidth);

    const currentScale = initialViewWidth / currentCamera.width;
    const nextScale = clamp(currentScale * factor, MIN_SCALE, MAX_SCALE);
    const nextWidth = clamp(initialViewWidth / nextScale, minViewWidth, maxViewWidth);
    const focalX = viewportWidth / 2;
    const focalY = effectiveViewportHeight / 2;
    const worldPerPixel = currentCamera.width / viewportWidth;
    const anchorWorldX = currentCamera.x + focalX * worldPerPixel;
    const anchorWorldY = currentCamera.y + focalY * worldPerPixel;
    const clamped = clampCamera(
      anchorWorldX - focalX * (nextWidth / viewportWidth),
      anchorWorldY - focalY * (nextWidth / viewportWidth),
      nextWidth,
      viewportAspect,
    );

    setSharedCamera({ x: clamped.x, y: clamped.y, width: nextWidth }, true);
  };

  const handleZoomIn = () => {
    handleZoomFromCenter(ZOOM_STEP);
  };

  const handleZoomOut = () => {
    handleZoomFromCenter(1 / ZOOM_STEP);
  };

  const handleReset = () => {
    resetCamera();
  };

  if (!floor) {
    return (
      <FeedbackStateCard
        title="층 정보를 찾을 수 없습니다."
        message="선택한 층 데이터가 비어 있어 지도를 표시할 수 없습니다."
        variant="empty"
      />
    );
  }

  return (
    <View style={styles.container}>
      <GestureDetector gesture={gesture}>
        <View onLayout={handleLayout} style={styles.canvasViewport}>
          {viewportWidth > 0 && effectiveViewportHeight > 0 ? (
            <Animated.View style={[styles.mapCanvas, mapCanvasStyle]}>
              <Svg height="100%" viewBox={`0 0 ${PORTRAIT_MAP_WIDTH} ${PORTRAIT_MAP_HEIGHT}`} width="100%">
                {roomNodes}
                {accessPointNodes}
                {currentPositionNode}
              </Svg>
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
      <View
        pointerEvents="box-none"
        style={[
          styles.zoomControls,
          {
            bottom: bottomObstructionHeight > 0 ? bottomObstructionHeight + 12 : 0,
            top: visibleTopOffset,
          },
        ]}
      >
        <Pressable
          accessibilityLabel="지도를 확대합니다"
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          disabled={viewportWidth <= 0 || effectiveViewportHeight <= 0}
          onPress={handleZoomIn}
          style={({ pressed }) => [styles.zoomButton, pressed && styles.zoomButtonPressed]}
        >
          <Text style={styles.zoomButtonText}>+</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="지도를 축소합니다"
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          disabled={viewportWidth <= 0 || effectiveViewportHeight <= 0}
          onPress={handleZoomOut}
          style={({ pressed }) => [styles.zoomButton, pressed && styles.zoomButtonPressed]}
        >
          <Text style={styles.zoomButtonText}>−</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="지도를 중심으로 초기화합니다"
          accessibilityRole="button"
          hitSlop={HIT_SLOP}
          disabled={viewportWidth <= 0 || effectiveViewportHeight <= 0}
          onPress={handleReset}
          style={({ pressed }) => [styles.zoomButton, pressed && styles.zoomButtonPressed]}
        >
          <Text style={styles.zoomButtonResetText}>↺</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  canvasViewport: {
    backgroundColor: '#f8fbff',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  mapCanvas: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  zoomControls: {
    alignItems: 'flex-end',
    gap: 8,
    justifyContent: 'center',
    position: 'absolute',
    right: 12,
    top: 0,
    zIndex: 1,
  },
  zoomButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: '#d8e2ef',
    borderRadius: 16,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  zoomButtonPressed: {
    opacity: 0.88,
  },
  zoomButtonText: {
    color: '#1d4ed8',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 20,
  },
  zoomButtonResetText: {
    color: '#1d4ed8',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 17,
  },
});
