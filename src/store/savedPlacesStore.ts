import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { CampusFeatureCategory } from '../types/geojson';
import {
  DEFAULT_CUSTOM_PIN_COLOR,
  SAVED_PLACE_COLOR_PALETTE,
  SAVED_PLACES_SCHEMA_VERSION,
  SAVED_PLACES_STORAGE_KEY,
} from '../types/savedPlaces';
import type { SavedPlace, SavedPlaceColor, SavedCampusPlace, SavedCustomPin } from '../types/savedPlaces';

/**
 * Input snapshot used when hydrating a campus feature into a saved place.
 * Derived from CampusFeatureProperties + geometry coordinates.
 */
export interface CampusFeatureSnapshot {
  featureId: string;
  name: string;
  nameKo: string;
  category: CampusFeatureCategory;
  level: number;
  coordinates: [number, number];
}

/** Input for creating a new custom pin. */
export interface CreateCustomPinInput {
  name?: string;
  coordinates: [number, number];
  color?: SavedPlaceColor;
  /** Floor level the pin belongs to. Required so pins are scoped per-floor. */
  level: number;
}

/** Patch fields allowed when updating an existing custom pin. */
export interface UpdateCustomPinPatch {
  name?: string;
  color?: SavedPlaceColor;
}

/** Persisted slice of the store (saved to AsyncStorage). */
interface PersistedSavedPlacesStore {
  savedPlaces: Record<string, SavedPlace>;
  schemaVersion: number;
}

/** Full store shape including transient fields and actions. */
interface SavedPlacesStore extends PersistedSavedPlacesStore {
  selectedSavedPlaceId: string | null;

  /**
   * Hydrate a campus feature snapshot into a saved record.
   * If the featureId already exists, returns the existing id without mutation.
   * Returns the record id on success, or null if validation fails.
   */
  hydrateSavedCampusPlace: (snapshot: CampusFeatureSnapshot) => string | null;

  /** Create a new custom pin. Returns the generated id, or null on validation failure. */
  createCustomPin: (input: CreateCustomPinInput) => string | null;

  /** Update an existing custom pin's mutable fields. Returns true if updated. */
  updateCustomPin: (id: string, patch: UpdateCustomPinPatch) => boolean;

  /** Remove a saved place by id. */
  removeSavedPlace: (id: string) => void;

  /** Check whether a campus feature is already saved. */
  isCampusFeatureSaved: (featureId: string) => boolean;

  /** Get a saved place by id. */
  getSavedPlace: (id: string) => SavedPlace | undefined;

  /** Set the currently selected saved place id (transient, not persisted). */
  setSelectedSavedPlaceId: (id: string | null) => void;

  /** Clear all saved places and selection (for tests). */
  clearSavedPlacesForTests: () => void;
}

function validateCoordinates(coords: unknown): coords is [number, number] {
  if (!Array.isArray(coords) || coords.length !== 2) return false;
  const [lng, lat] = coords;
  return typeof lng === 'number' && typeof lat === 'number' && Number.isFinite(lng) && Number.isFinite(lat);
}

function validateColor(color: unknown): color is SavedPlaceColor {
  return SAVED_PLACE_COLOR_PALETTE.includes(color as SavedPlaceColor);
}

function generateId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }
}

function isSavedCustomPin(place: SavedPlace): place is SavedCustomPin {
  return place.type === 'custom';
}

export const useSavedPlacesStore = create<SavedPlacesStore>()(
  persist(
    (set, get) => ({
      // ── Persisted state ────────────────────────────────────────────────
      savedPlaces: {},
      schemaVersion: SAVED_PLACES_SCHEMA_VERSION,

      // ── Transient (non-persisted) state ────────────────────────────────
      selectedSavedPlaceId: null,

      // ── Actions ────────────────────────────────────────────────────────

      hydrateSavedCampusPlace: (snapshot) => {
        if (!validateCoordinates(snapshot.coordinates)) {
          return null;
        }

        const existing = Object.values(get().savedPlaces).find(
          (p): p is SavedCampusPlace => p.type === 'campus' && p.featureId === snapshot.featureId,
        );
        if (existing) return existing.id;

        const id = `campus:${snapshot.featureId}`;
        const record: SavedCampusPlace = {
          id,
          type: 'campus',
          featureId: snapshot.featureId,
          name: snapshot.name || snapshot.nameKo || '공간',
          nameKo: snapshot.nameKo,
          category: snapshot.category,
          level: snapshot.level,
          coordinates: snapshot.coordinates,
          color: DEFAULT_CUSTOM_PIN_COLOR,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          savedPlaces: { ...state.savedPlaces, [id]: record },
        }));
        return id;
      },

      createCustomPin: (input) => {
        if (!validateCoordinates(input.coordinates)) {
          return null;
        }

        const color = input.color && validateColor(input.color) ? input.color : DEFAULT_CUSTOM_PIN_COLOR;

        const id = generateId();
        const record: SavedCustomPin = {
          id,
          type: 'custom',
          name: input.name || '새 핀',
          coordinates: input.coordinates,
          color,
          level: input.level,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          savedPlaces: { ...state.savedPlaces, [id]: record },
        }));
        return id;
      },

      updateCustomPin: (id, patch) => {
        const place = get().savedPlaces[id];
        if (!place || !isSavedCustomPin(place)) return false;

        const updated: SavedCustomPin = {
          ...place,
          name: patch.name ?? place.name,
          color: patch.color !== undefined ? (validateColor(patch.color) ? patch.color : place.color) : place.color,
        };

        set((state) => ({
          savedPlaces: { ...state.savedPlaces, [id]: updated },
        }));
        return true;
      },

      removeSavedPlace: (id) => {
        set((state) => {
          const { [id]: _removed, ...rest } = state.savedPlaces;
          return {
            savedPlaces: rest,
            selectedSavedPlaceId: state.selectedSavedPlaceId === id ? null : state.selectedSavedPlaceId,
          };
        });
      },

      isCampusFeatureSaved: (featureId) => {
        return Object.values(get().savedPlaces).some(
          (p): p is SavedCampusPlace => p.type === 'campus' && p.featureId === featureId,
        );
      },

      getSavedPlace: (id) => {
        return get().savedPlaces[id];
      },

      setSelectedSavedPlaceId: (id) => {
        set({ selectedSavedPlaceId: id });
      },

      clearSavedPlacesForTests: () => {
        set({ savedPlaces: {}, selectedSavedPlaceId: null });
      },
    }),
    {
      name: SAVED_PLACES_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      version: SAVED_PLACES_SCHEMA_VERSION,
      migrate: (persistedState, version) => {
        const state = persistedState as Record<string, any>;
        if (version < 2) {
          const savedPlaces = state.savedPlaces ?? {};
          for (const key of Object.keys(savedPlaces)) {
            const place = savedPlaces[key];
            if (place && place.type === 'custom' && place.level === undefined) {
              place.level = 1;
            }
            if (place && place.type === 'campus' && place.color === '#2979FF') {
              place.color = '#00A676';
            }
            if (place && place.type === 'custom' && place.color === '#2979FF') {
              place.color = '#00A676';
            }
          }
          state.savedPlaces = savedPlaces;
        }
        return state as SavedPlacesStore;
      },
      partialize: (state) => ({
        savedPlaces: state.savedPlaces,
        schemaVersion: state.schemaVersion,
      }),
    },
  ),
);
