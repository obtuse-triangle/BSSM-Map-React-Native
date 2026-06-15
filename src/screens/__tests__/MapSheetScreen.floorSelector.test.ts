import * as fs from 'node:fs';
import * as path from 'node:path';

const SCREEN_PATH = path.resolve(__dirname, '../MapSheetScreen.tsx');
const screenSource = fs.readFileSync(SCREEN_PATH, 'utf8');

describe('MapSheetScreen Liquid Glass floor selector (static invariants)', () => {
  describe('accessibility contract', () => {
    it('exposes accessibilityState={{ selected }} on each floor Pressable', () => {
      expect(screenSource).toMatch(/accessibilityState=\{\{\s*selected\s*\}\}/);
    });

    it('keeps accessibilityLabel={`${level}층 선택`} on floor Pressables', () => {
      expect(screenSource).toContain('accessibilityLabel={`${level}층 선택`}');
    });

    it('keeps accessibilityRole="button" on floor Pressables', () => {
      expect(screenSource).toMatch(/accessibilityRole="button"/);
    });
  });

  describe('Liquid Glass wrapper', () => {
    it('wraps the level row in GlassSurface (not raw GlassView)', () => {
      expect(screenSource).toMatch(/<GlassSurface\b/);
      expect(screenSource).not.toMatch(/<GlassView\b/);
    });

    it('uses GlassSurface variant="control" for the interactive selector', () => {
      expect(screenSource).toMatch(/variant="control"/);
    });

    it('passes the resolved sheet colorScheme to GlassSurface', () => {
      expect(screenSource).toMatch(/colorScheme=\{sheetScheme/);
    });
  });

  describe('drag-to-select threading contract (CRITICAL)', () => {
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
      expect(body).toMatch(/indicatorX\.value/);
    });

    it('calls setSelectedLevel exactly once via runOnJS in .onEnd', () => {
      const onEndBlock = screenSource.match(/\.onEnd\(\(\)\s*=>\s*\{([\s\S]*?)\}\s*\),\s*\n\s*\[/);
      expect(onEndBlock).not.toBeNull();
      const body = onEndBlock![1];
      expect(body).toMatch(/runOnJS\(applyLevelByIndex\)/);
      expect(body).not.toMatch(/setSelectedLevel\s*\(/);
    });

    it('clamps the snap index to the valid level range', () => {
      expect(screenSource).toMatch(/Math\.max\(0,\s*Math\.min\(levels\.length\s*-\s*1/);
    });

    it('uses LEVEL_BUTTON_WIDTH for the snap divisor', () => {
      expect(screenSource).toMatch(/LEVEL_BUTTON_WIDTH/);
    });
  });
});
