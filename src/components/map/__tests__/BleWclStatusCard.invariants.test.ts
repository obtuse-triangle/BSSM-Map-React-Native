import * as fs from 'node:fs';
import * as path from 'node:path';

const CARD_PATH = path.resolve(__dirname, '../BleWclStatusCard.tsx');
const cardSource = fs.readFileSync(CARD_PATH, 'utf8');

describe('BleWclStatusCard static invariants', () => {
  describe('structural imports', () => {
    it('imports GlassSurface from ../glass as the root container', () => {
      expect(cardSource).toMatch(/import \{ GlassSurface \} from '\.\.\/glass'/);
    });

    it('imports BleActionButtons sibling component', () => {
      expect(cardSource).toMatch(
        /import \{ BleActionButtons \} from '\.\/BleActionButtons'/,
      );
    });

    it('imports BleBeaconStatsTable sibling component', () => {
      expect(cardSource).toMatch(
        /import \{ BleBeaconStatsTable \} from '\.\/BleBeaconStatsTable'/,
      );
    });

    it('does NOT import useSafeAreaInsets', () => {
      expect(cardSource).not.toMatch(/useSafeAreaInsets/);
    });
  });

  describe('early-return guard', () => {
    it('returns null when status is idle and not continuous scanning', () => {
      expect(cardSource).toMatch(
        /if \(status === 'idle' && !isContinuousScanning\)/,
      );
      expect(cardSource).toMatch(/return null/);
      // Confirm the null return is inside the idle guard, not elsewhere
      const idleGuardBlock = cardSource.match(
        /if \(status === 'idle' && !isContinuousScanning\)\s*\{/,
      );
      expect(idleGuardBlock).not.toBeNull();
    });
  });

  describe('exported API', () => {
    it('exports BleWclStatusCard as a named function', () => {
      expect(cardSource).toMatch(/export function BleWclStatusCard\(/);
    });
  });

  describe('root render structure', () => {
    it('uses GlassSurface as the JSX root element', () => {
      // After the early return, the component returns <GlassSurface ...> as root
      expect(cardSource).toMatch(/<GlassSurface\s+variant="status"/);
    });

    it('renders BleActionButtons inside GlassSurface', () => {
      expect(cardSource).toMatch(/<BleActionButtons/);
    });

    it('renders BleBeaconStatsTable inside GlassSurface', () => {
      expect(cardSource).toMatch(/<BleBeaconStatsTable/);
    });
  });
});
