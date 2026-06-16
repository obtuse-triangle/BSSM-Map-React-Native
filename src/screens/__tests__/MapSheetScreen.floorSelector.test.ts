import * as fs from 'node:fs';
import * as path from 'node:path';

const SCREEN_PATH = path.resolve(__dirname, '../MapSheetScreen.tsx');
const screenSource = fs.readFileSync(SCREEN_PATH, 'utf8');

describe('MapSheetScreen wheel floor selector (static invariants)', () => {
  describe('threading contract (CRITICAL)', () => {
    it('uses Gesture.Pan() from react-native-gesture-handler', () => {
      expect(screenSource).toMatch(/Gesture\.Pan\(\)/);
      expect(screenSource).toMatch(/from 'react-native-gesture-handler'/);
    });

    it('wraps the selector in a GestureDetector', () => {
      expect(screenSource).toMatch(/<GestureDetector\b/);
    });

    it('marks pan callbacks as worklets', () => {
      const onUpdates = screenSource.match(/\.onUpdate\(/g);
      expect(onUpdates).not.toBeNull();
      const workletDirectives = screenSource.match(/'worklet';/g);
      expect(workletDirectives?.length ?? 0).toBeGreaterThanOrEqual(onUpdates!.length);
    });

    it('does NOT call setSelectedLevel inside .onUpdate', () => {
      const onUpdateBlock = screenSource.match(/\.onUpdate\(\(event\)\s*=>\s*\{([\s\S]*?)\}\s*\)\s*\.onEnd/);
      expect(onUpdateBlock).not.toBeNull();
      const body = onUpdateBlock![1];
      expect(body).not.toMatch(/setSelectedLevel/);
      expect(body).not.toMatch(/runOnJS/);
      expect(body).toMatch(/scrollX\.value/);
    });

    it('calls setSelectedLevel exactly once via runOnJS in .onEnd', () => {
      const onEndBlock = screenSource.match(/\.onEnd\(\(\)\s*=>\s*\{([\s\S]*?)\}\s*\),\s*\n\s*\[/);
      expect(onEndBlock).not.toBeNull();
      const body = onEndBlock![1];
      expect(body).toMatch(/runOnJS\(applyLevelByIndex\)/);
      expect(body).not.toMatch(/setSelectedLevel\s*\(/);
    });

    it('does NOT use an isPanning guard (breaks tap-to-select via FAIL race)', () => {
      expect(screenSource).not.toMatch(/isPanning/);
      expect(screenSource).not.toMatch(/\.onFinalize/);
    });

    it('clamps the snap index to the valid level range', () => {
      expect(screenSource).toMatch(/Math\.max\(0,\s*Math\.min\(levels\.length\s*-\s*1/);
    });

    it('uses LEVEL_BUTTON_WIDTH for the snap divisor', () => {
      expect(screenSource).toMatch(/LEVEL_BUTTON_WIDTH/);
    });
  });

  describe('wheel selector structure', () => {
    it('renders an animated levels row driven by scrollX', () => {
      expect(screenSource).toMatch(/scrollX/);
      expect(screenSource).toMatch(/useAnimatedStyle/);
      expect(screenSource).toMatch(/translateX/);
    });

    it('uses spring physics for snap', () => {
      expect(screenSource).toMatch(/withSpring/);
      expect(screenSource).toMatch(/SPRING_CONFIG/);
    });

    it('renders a WheelItem component for each level', () => {
      expect(screenSource).toMatch(/function WheelItem/);
      expect(screenSource).toMatch(/<WheelItem/);
    });

    it('applies distance-based opacity/scale to wheel items', () => {
      expect(screenSource).toMatch(/Math\.abs\(scrollX\.value/);
      expect(screenSource).toMatch(/opacity/);
      expect(screenSource).toMatch(/scale/);
    });

    it('has a center highlight slot', () => {
      expect(screenSource).toMatch(/wheelCenterHighlight/);
    });
  });
});
