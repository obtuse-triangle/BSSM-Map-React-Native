jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  DEFAULT_CUSTOM_PIN_COLOR,
  SAVED_PLACE_COLOR_PALETTE,
} from '../../types/savedPlaces';
import { useSavedPlacesStore } from '../savedPlacesStore';
import type { SavedCustomPin, SavedCampusPlace } from '../../types/savedPlaces';

const validCoord: [number, number] = [127.123, 37.456];
const validCoord2: [number, number] = [127.789, 37.987];

function campusSnapshot(overrides?: Partial<Parameters<typeof useSavedPlacesStore.getState>['0']['hydrateSavedCampusPlace'] extends (s: infer S) => unknown ? S : never>) {
  return {
    featureId: 'room-42',
    name: 'Music Room',
    nameKo: '음악실',
    category: 'room' as const,
    level: 2,
    coordinates: validCoord,
    ...overrides,
  };
}

describe('savedPlacesStore', () => {
  beforeEach(() => {
    useSavedPlacesStore.getState().clearSavedPlacesForTests();
  });

  // ── Defaults ────────────────────────────────────────────────────────

  describe('default state', () => {
    it('starts with empty savedPlaces and null selectedSavedPlaceId', () => {
      const state = useSavedPlacesStore.getState();
      expect(state.savedPlaces).toEqual({});
      expect(state.selectedSavedPlaceId).toBeNull();
      expect(state.schemaVersion).toBe(1);
    });
  });

  // ── hydrateSavedCampusPlace ─────────────────────────────────────────

  describe('hydrateSavedCampusPlace', () => {
    it('creates a SavedCampusPlace from a valid snapshot', () => {
      const id = useSavedPlacesStore.getState().hydrateSavedCampusPlace(campusSnapshot());
      expect(id).toBe('campus:room-42');

      const record = useSavedPlacesStore.getState().savedPlaces['campus:room-42'] as SavedCampusPlace;
      expect(record).toBeDefined();
      expect(record.type).toBe('campus');
      expect(record.featureId).toBe('room-42');
      expect(record.name).toBe('Music Room');
      expect(record.nameKo).toBe('음악실');
      expect(record.category).toBe('room');
      expect(record.level).toBe(2);
      expect(record.coordinates).toEqual(validCoord);
      expect(record.color).toBe(DEFAULT_CUSTOM_PIN_COLOR);
      expect(typeof record.createdAt).toBe('string');
      expect(record.id).toBe('campus:room-42');
    });

    it('falls back to nameKo then 공간 when name is empty', () => {
      const id1 = useSavedPlacesStore.getState().hydrateSavedCampusPlace(campusSnapshot({ name: '', nameKo: '과학실' }));
      expect((useSavedPlacesStore.getState().savedPlaces[id1!] as SavedCampusPlace).name).toBe('과학실');

      useSavedPlacesStore.getState().clearSavedPlacesForTests();

      const id2 = useSavedPlacesStore.getState().hydrateSavedCampusPlace(campusSnapshot({ name: '', nameKo: '' }));
      expect((useSavedPlacesStore.getState().savedPlaces[id2!] as SavedCampusPlace).name).toBe('공간');
    });

    it('returns existing id if featureId is already saved (no-op)', () => {
      const id1 = useSavedPlacesStore.getState().hydrateSavedCampusPlace(campusSnapshot());
      const id2 = useSavedPlacesStore.getState().hydrateSavedCampusPlace(campusSnapshot({ name: 'Overwrite' }));
      expect(id2).toBe(id1);
      // Name should remain unchanged
      expect((useSavedPlacesStore.getState().savedPlaces[id1!] as SavedCampusPlace).name).toBe('Music Room');
    });

    it('returns null for invalid coordinates', () => {
      const result1 = useSavedPlacesStore.getState().hydrateSavedCampusPlace(
        campusSnapshot({ coordinates: [NaN, 37.456] } as any),
      );
      expect(result1).toBeNull();

      const result2 = useSavedPlacesStore.getState().hydrateSavedCampusPlace(
        campusSnapshot({ coordinates: [Infinity, 37.456] } as any),
      );
      expect(result2).toBeNull();

      const result3 = useSavedPlacesStore.getState().hydrateSavedCampusPlace(
        campusSnapshot({ coordinates: [127.0] } as any),
      );
      expect(result3).toBeNull();
    });
  });

  // ── createCustomPin ─────────────────────────────────────────────────

  describe('createCustomPin', () => {
    it('creates a custom pin with defaults', () => {
      const id = useSavedPlacesStore.getState().createCustomPin({ coordinates: validCoord });
      expect(id).toBeTruthy();
      const record = useSavedPlacesStore.getState().savedPlaces[id!] as SavedCustomPin;
      expect(record.type).toBe('custom');
      expect(record.name).toBe('새 핀');
      expect(record.color).toBe(DEFAULT_CUSTOM_PIN_COLOR);
      expect(record.coordinates).toEqual(validCoord);
    });

    it('uses provided name and color', () => {
      const id = useSavedPlacesStore.getState().createCustomPin({
        name: 'My Spot',
        coordinates: validCoord2,
        color: '#E53935',
      });
      const record = useSavedPlacesStore.getState().savedPlaces[id!] as SavedCustomPin;
      expect(record.name).toBe('My Spot');
      expect(record.color).toBe('#E53935');
      expect(record.coordinates).toEqual(validCoord2);
    });

    it('rejects invalid color by falling back to default', () => {
      const id = useSavedPlacesStore.getState().createCustomPin({
        name: 'Bad Color',
        coordinates: validCoord,
        color: '#INVALID' as any,
      });
      const record = useSavedPlacesStore.getState().savedPlaces[id!] as SavedCustomPin;
      expect(record.color).toBe(DEFAULT_CUSTOM_PIN_COLOR);
    });

    it('rejects non-finite coordinates', () => {
      const result1 = useSavedPlacesStore.getState().createCustomPin({ coordinates: [NaN, 37] });
      expect(result1).toBeNull();

      const result2 = useSavedPlacesStore.getState().createCustomPin({ coordinates: [127, undefined as any] });
      expect(result2).toBeNull();
    });
  });

  // ── updateCustomPin ─────────────────────────────────────────────────

  describe('updateCustomPin', () => {
    it('updates name and color of a custom pin', () => {
      const id = useSavedPlacesStore.getState().createCustomPin({ coordinates: validCoord })!;
      const success = useSavedPlacesStore.getState().updateCustomPin(id, { name: 'Updated', color: '#00A676' });
      expect(success).toBe(true);

      const record = useSavedPlacesStore.getState().savedPlaces[id] as SavedCustomPin;
      expect(record.name).toBe('Updated');
      expect(record.color).toBe('#00A676');
    });

    it('partially updates with just name', () => {
      const id = useSavedPlacesStore.getState().createCustomPin({ name: 'Original', coordinates: validCoord })!;
      useSavedPlacesStore.getState().updateCustomPin(id, { name: 'Renamed' });

      const record = useSavedPlacesStore.getState().savedPlaces[id] as SavedCustomPin;
      expect(record.name).toBe('Renamed');
      expect(record.color).toBe(DEFAULT_CUSTOM_PIN_COLOR);
    });

    it('returns false for non-existent id', () => {
      const result = useSavedPlacesStore.getState().updateCustomPin('nonexistent', { name: 'nope' });
      expect(result).toBe(false);
    });

    it('returns false for campus type place', () => {
      const id = useSavedPlacesStore.getState().hydrateSavedCampusPlace(campusSnapshot())!;
      const result = useSavedPlacesStore.getState().updateCustomPin(id, { name: 'no' });
      expect(result).toBe(false);
    });

    it('falls back to existing color if invalid color provided', () => {
      const id = useSavedPlacesStore.getState().createCustomPin({
        name: 'Test',
        coordinates: validCoord,
        color: '#8E24AA',
      })!;
      useSavedPlacesStore.getState().updateCustomPin(id, { color: '#BADBAD' as any });

      const record = useSavedPlacesStore.getState().savedPlaces[id] as SavedCustomPin;
      expect(record.color).toBe('#8E24AA');
    });
  });

  // ── removeSavedPlace ────────────────────────────────────────────────

  describe('removeSavedPlace', () => {
    it('removes a saved place by id', () => {
      const id = useSavedPlacesStore.getState().createCustomPin({ coordinates: validCoord })!;
      expect(Object.keys(useSavedPlacesStore.getState().savedPlaces).length).toBe(1);

      useSavedPlacesStore.getState().removeSavedPlace(id);
      expect(useSavedPlacesStore.getState().savedPlaces[id]).toBeUndefined();
    });

    it('clears selectedSavedPlaceId when the removed place was selected', () => {
      const id = useSavedPlacesStore.getState().createCustomPin({ coordinates: validCoord })!;
      useSavedPlacesStore.getState().setSelectedSavedPlaceId(id);
      expect(useSavedPlacesStore.getState().selectedSavedPlaceId).toBe(id);

      useSavedPlacesStore.getState().removeSavedPlace(id);
      expect(useSavedPlacesStore.getState().selectedSavedPlaceId).toBeNull();
    });
  });

  // ── isCampusFeatureSaved ────────────────────────────────────────────

  describe('isCampusFeatureSaved', () => {
    it('returns true if a campus feature is saved', () => {
      useSavedPlacesStore.getState().hydrateSavedCampusPlace(campusSnapshot());
      expect(useSavedPlacesStore.getState().isCampusFeatureSaved('room-42')).toBe(true);
    });

    it('returns false for unsaved feature', () => {
      expect(useSavedPlacesStore.getState().isCampusFeatureSaved('room-99')).toBe(false);
    });

    it('returns false for custom pins (not campus)', () => {
      useSavedPlacesStore.getState().createCustomPin({ coordinates: validCoord });
      expect(useSavedPlacesStore.getState().isCampusFeatureSaved('whatever')).toBe(false);
    });
  });

  // ── getSavedPlace ───────────────────────────────────────────────────

  describe('getSavedPlace', () => {
    it('returns the saved place by id', () => {
      const id = useSavedPlacesStore.getState().createCustomPin({ coordinates: validCoord })!;
      const place = useSavedPlacesStore.getState().getSavedPlace(id);
      expect(place).toBeDefined();
      expect(place!.id).toBe(id);
    });

    it('returns undefined for unknown id', () => {
      expect(useSavedPlacesStore.getState().getSavedPlace('nope')).toBeUndefined();
    });
  });

  // ── selectedSavedPlaceId ────────────────────────────────────────────

  describe('setSelectedSavedPlaceId', () => {
    it('sets and clears selectedSavedPlaceId', () => {
      useSavedPlacesStore.getState().setSelectedSavedPlaceId('abc');
      expect(useSavedPlacesStore.getState().selectedSavedPlaceId).toBe('abc');

      useSavedPlacesStore.getState().setSelectedSavedPlaceId(null);
      expect(useSavedPlacesStore.getState().selectedSavedPlaceId).toBeNull();
    });
  });

  // ── clearSavedPlacesForTests ────────────────────────────────────────

  describe('clearSavedPlacesForTests', () => {
    it('clears all saved places and selected id', () => {
      useSavedPlacesStore.getState().createCustomPin({ coordinates: validCoord });
      useSavedPlacesStore.getState().hydrateSavedCampusPlace(campusSnapshot());
      useSavedPlacesStore.getState().setSelectedSavedPlaceId('some-id');

      useSavedPlacesStore.getState().clearSavedPlacesForTests();
      const state = useSavedPlacesStore.getState();
      expect(state.savedPlaces).toEqual({});
      expect(state.selectedSavedPlaceId).toBeNull();
    });
  });

  // ── Serialization / hydration round-trip ────────────────────────────

  describe('serialization / persist round-trip', () => {
    it('partialize excludes selectedSavedPlaceId', () => {
      // This tests the persist config indirectly via partialize behavior
      const state = useSavedPlacesStore.getState();
      state.setSelectedSavedPlaceId('should-not-persist');
      state.createCustomPin({ name: 'PersistMe', coordinates: validCoord });

      // The partialize function should only keep savedPlaces and schemaVersion
      const persistFn = (useSavedPlacesStore as any).persist?.options?.partialize;
      if (persistFn) {
        const partial = persistFn(useSavedPlacesStore.getState());
        expect(partial.savedPlaces).toBeDefined();
        expect(partial.schemaVersion).toBeDefined();
        expect((partial as any).selectedSavedPlaceId).toBeUndefined();
      }
    });
  });

  // ── 200-item boundary ───────────────────────────────────────────────

  describe('200-item boundary', () => {
    it('can store 200 custom pins without error', () => {
      for (let i = 0; i < 200; i++) {
        const id = useSavedPlacesStore.getState().createCustomPin({
          name: `Pin ${i}`,
          coordinates: [127 + i * 0.001, 37 + i * 0.001] as [number, number],
        });
        expect(id).toBeTruthy();
      }
      expect(Object.keys(useSavedPlacesStore.getState().savedPlaces).length).toBe(200);
    });

    it('can store mixed campus and custom places up to 200', () => {
      for (let i = 0; i < 100; i++) {
        useSavedPlacesStore.getState().hydrateSavedCampusPlace(
          campusSnapshot({ featureId: `room-${i}`, coordinates: [127 + i * 0.001, 37 + i * 0.001] as [number, number] }),
        );
      }
      for (let i = 0; i < 100; i++) {
        useSavedPlacesStore.getState().createCustomPin({
          name: `Pin ${i}`,
          coordinates: [128 + i * 0.001, 38 + i * 0.001] as [number, number],
        });
      }
      expect(Object.keys(useSavedPlacesStore.getState().savedPlaces).length).toBe(200);
    });
  });

  // ── Color palette validation ────────────────────────────────────────

  describe('color palette constants', () => {
    it('SAVED_PLACE_COLOR_PALETTE contains exactly 8 colors', () => {
      expect(SAVED_PLACE_COLOR_PALETTE.length).toBe(8);
    });

    it('all palette entries are valid hex strings', () => {
      for (const color of SAVED_PLACE_COLOR_PALETTE) {
        expect(color).toMatch(/^#[0-9A-F]{6}$/);
      }
    });
  });

  // ── Idempotent hydration (dedup) ────────────────────────────────────

  describe('idempotent hydration', () => {
    it('does not create duplicate entries for same featureId', () => {
      useSavedPlacesStore.getState().hydrateSavedCampusPlace(campusSnapshot());
      useSavedPlacesStore.getState().hydrateSavedCampusPlace(campusSnapshot({ name: 'Also Music Room' }));
      useSavedPlacesStore.getState().hydrateSavedCampusPlace(campusSnapshot({ nameKo: '음악실2' }));

      const places = Object.values(useSavedPlacesStore.getState().savedPlaces).filter(
        (p) => p.type === 'campus' && p.featureId === 'room-42',
      );
      expect(places.length).toBe(1);
    });
  });
});
