import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useCanvasUIStore } from '@/stores/canvas-ui';

describe('useCanvasUIStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    act(() => {
      useCanvasUIStore.getState().resetView();
      useCanvasUIStore.getState().clearSelection();
      useCanvasUIStore.getState().setMinimapVisible(true);
    });
  });

  describe('initial state', () => {
    // @atom IA-STORE-002
    it('has correct initial values', () => {
      const state = useCanvasUIStore.getState();
      // Verify default zoom level is 1 (100%)
      expect(state.zoom).toBe(1);
      // Verify default pan position is at origin
      expect(state.panPosition).toEqual({ x: 0, y: 0 });
      // Verify no atoms are selected by default
      expect(state.selectedAtomIds).toEqual([]);
      // Verify minimap is visible by default
      expect(state.minimapVisible).toBe(true);
    });
  });

  describe('zoom controls', () => {
    // @atom IA-STORE-002
    it('setZoom updates zoom level', () => {
      act(() => {
        useCanvasUIStore.getState().setZoom(1.5);
      });
      // Verify zoom level is updated to the specified value
      expect(useCanvasUIStore.getState().zoom).toBe(1.5);
    });

    // @atom IA-STORE-002
    it('setZoom handles zoom out', () => {
      act(() => {
        useCanvasUIStore.getState().setZoom(0.5);
      });
      // Verify zoom level can be set below 1 for zoom out
      expect(useCanvasUIStore.getState().zoom).toBe(0.5);
    });
  });

  describe('pan controls', () => {
    // @atom IA-STORE-002
    it('setPan updates pan position', () => {
      act(() => {
        useCanvasUIStore.getState().setPan({ x: 100, y: 200 });
      });
      // Verify pan position is updated to the specified coordinates
      expect(useCanvasUIStore.getState().panPosition).toEqual({ x: 100, y: 200 });
    });

    // @atom IA-STORE-002
    it('setPan handles negative values', () => {
      act(() => {
        useCanvasUIStore.getState().setPan({ x: -50, y: -100 });
      });
      // Verify pan position can be set to negative values for panning left/up
      expect(useCanvasUIStore.getState().panPosition).toEqual({ x: -50, y: -100 });
    });
  });

  describe('selection management', () => {
    // @atom IA-STORE-002
    it('selectAtoms sets selected atom IDs', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2']);
      });
      // Verify selected atoms array contains the specified atom IDs
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-1', 'atom-2']);
    });

    // @atom IA-STORE-002
    it('selectAtoms replaces existing selection', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1']);
        useCanvasUIStore.getState().selectAtoms(['atom-3', 'atom-4']);
      });
      // Verify new selection completely replaces the previous selection
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-3', 'atom-4']);
    });

    // @atom IA-STORE-002
    it('addToSelection adds to existing selection', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1']);
        useCanvasUIStore.getState().addToSelection('atom-2');
      });
      // Verify new atom is appended to existing selection
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-1', 'atom-2']);
    });

    // @atom IA-STORE-002
    it('addToSelection does not add duplicates', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2']);
        useCanvasUIStore.getState().addToSelection('atom-1');
      });
      // Verify duplicate atom ID is not added to selection
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-1', 'atom-2']);
    });

    // @atom IA-STORE-002
    it('removeFromSelection removes specific atom', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2', 'atom-3']);
        useCanvasUIStore.getState().removeFromSelection('atom-2');
      });
      // Verify only the specified atom is removed while others remain
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-1', 'atom-3']);
    });

    // @atom IA-STORE-002
    it('clearSelection clears all selections', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2']);
        useCanvasUIStore.getState().clearSelection();
      });
      // Verify all selections are cleared and array is empty
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual([]);
    });
  });

  describe('minimap controls', () => {
    // @atom IA-STORE-002
    it('toggleMinimap toggles visibility', () => {
      // Verify initial state is visible
      expect(useCanvasUIStore.getState().minimapVisible).toBe(true);

      act(() => {
        useCanvasUIStore.getState().toggleMinimap();
      });
      // Verify minimap is hidden after first toggle
      expect(useCanvasUIStore.getState().minimapVisible).toBe(false);

      act(() => {
        useCanvasUIStore.getState().toggleMinimap();
      });
      // Verify minimap is visible again after second toggle
      expect(useCanvasUIStore.getState().minimapVisible).toBe(true);
    });

    // @atom IA-STORE-002
    it('setMinimapVisible sets specific value', () => {
      act(() => {
        useCanvasUIStore.getState().setMinimapVisible(false);
      });
      // Verify minimap visibility is set to false
      expect(useCanvasUIStore.getState().minimapVisible).toBe(false);

      act(() => {
        useCanvasUIStore.getState().setMinimapVisible(true);
      });
      // Verify minimap visibility is set to true
      expect(useCanvasUIStore.getState().minimapVisible).toBe(true);
    });
  });

  describe('resetView', () => {
    // @atom IA-STORE-002
    it('resets zoom and pan position', () => {
      act(() => {
        useCanvasUIStore.getState().setZoom(2);
        useCanvasUIStore.getState().setPan({ x: 500, y: 300 });
      });

      // Verify zoom and pan are set to non-default values
      expect(useCanvasUIStore.getState().zoom).toBe(2);
      expect(useCanvasUIStore.getState().panPosition).toEqual({ x: 500, y: 300 });

      act(() => {
        useCanvasUIStore.getState().resetView();
      });

      // Verify zoom is reset to default value of 1
      expect(useCanvasUIStore.getState().zoom).toBe(1);
      // Verify pan position is reset to origin
      expect(useCanvasUIStore.getState().panPosition).toEqual({ x: 0, y: 0 });
    });

    // @atom IA-STORE-002
    it('does not affect selection', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2']);
        useCanvasUIStore.getState().setZoom(2);
        useCanvasUIStore.getState().resetView();
      });

      // Verify selection remains unchanged after resetView
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-1', 'atom-2']);
    });
  });

  describe('boundary tests', () => {
    // @atom IA-STORE-002
    it('selectAtoms handles empty array', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2']);
        useCanvasUIStore.getState().selectAtoms([]);
      });
      // Verify selecting empty array clears all selections - boundary: empty array length is 0
      expect(useCanvasUIStore.getState().selectedAtomIds.length).toBe(0);
    });

    // @atom IA-STORE-002
    it('removeFromSelection handles non-existent atom ID', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2']);
        useCanvasUIStore.getState().removeFromSelection('non-existent-atom');
      });
      // Verify removing non-existent atom does not affect existing selection
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-1', 'atom-2']);
    });

    // @atom IA-STORE-002
    it('setZoom handles zero value', () => {
      act(() => {
        useCanvasUIStore.getState().setZoom(0);
      });
      // Verify zoom can be set to zero (edge case for minimum zoom) - boundary: zero value
      expect(useCanvasUIStore.getState().zoom).toBe(0);
    });

    // @atom IA-STORE-002
    it('setPan handles very large coordinate values', () => {
      const largeX = Number.MAX_SAFE_INTEGER;
      const largeY = Number.MAX_SAFE_INTEGER;
      act(() => {
        useCanvasUIStore.getState().setPan({ x: largeX, y: largeY });
      });
      // Verify pan position can handle maximum safe integer values - boundary: large values
      expect(useCanvasUIStore.getState().panPosition.x).toBeGreaterThan(0);
      expect(useCanvasUIStore.getState().panPosition.y).toBeGreaterThan(0);
      expect(useCanvasUIStore.getState().panPosition).toEqual({ x: largeX, y: largeY });
    });

    // @atom IA-STORE-002
    it('clearSelection on already empty selection', () => {
      // Ensure selection is empty - boundary: zero length
      expect(useCanvasUIStore.getState().selectedAtomIds.length).toBe(0);

      act(() => {
        useCanvasUIStore.getState().clearSelection();
      });
      // Verify clearSelection is idempotent on empty selection - boundary: zero length
      expect(useCanvasUIStore.getState().selectedAtomIds.length).toBe(0);
    });

    // @atom IA-STORE-002
    it('zoom value is greater than zero for valid zoom in', () => {
      act(() => {
        useCanvasUIStore.getState().setZoom(2.5);
      });
      // Verify zoom in results in value greater than default - boundary: range check
      expect(useCanvasUIStore.getState().zoom).toBeGreaterThan(1);
    });

    // @atom IA-STORE-002
    it('zoom value is less than default for zoom out', () => {
      act(() => {
        useCanvasUIStore.getState().setZoom(0.25);
      });
      // Verify zoom out results in value less than default - boundary: range check
      expect(useCanvasUIStore.getState().zoom).toBeLessThan(1);
      expect(useCanvasUIStore.getState().zoom).toBeGreaterThan(0);
    });

    // @atom IA-STORE-002
    it('pan position x can be negative for left pan', () => {
      act(() => {
        useCanvasUIStore.getState().setPan({ x: -100, y: 0 });
      });
      // Verify negative pan for leftward movement - boundary: negative range
      expect(useCanvasUIStore.getState().panPosition.x).toBeLessThan(0);
      expect(useCanvasUIStore.getState().panPosition.y).toBe(0);
    });

    // @atom IA-STORE-002
    it('selection count increases when adding atoms', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1']);
      });
      const initialCount = useCanvasUIStore.getState().selectedAtomIds.length;

      act(() => {
        useCanvasUIStore.getState().addToSelection('atom-2');
      });
      // Verify selection count increases - boundary: count comparison
      expect(useCanvasUIStore.getState().selectedAtomIds.length).toBeGreaterThan(initialCount);
    });

    // @atom IA-STORE-002
    it('selection count decreases when removing atoms', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2', 'atom-3']);
      });
      const initialCount = useCanvasUIStore.getState().selectedAtomIds.length;

      act(() => {
        useCanvasUIStore.getState().removeFromSelection('atom-2');
      });
      // Verify selection count decreases - boundary: count comparison
      expect(useCanvasUIStore.getState().selectedAtomIds.length).toBeLessThan(initialCount);
    });
  });
});
