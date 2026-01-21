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
    it('has correct initial values', () => {
      const state = useCanvasUIStore.getState();
      expect(state.zoom).toBe(1);
      expect(state.panPosition).toEqual({ x: 0, y: 0 });
      expect(state.selectedAtomIds).toEqual([]);
      expect(state.minimapVisible).toBe(true);
    });
  });

  describe('zoom controls', () => {
    it('setZoom updates zoom level', () => {
      act(() => {
        useCanvasUIStore.getState().setZoom(1.5);
      });
      expect(useCanvasUIStore.getState().zoom).toBe(1.5);
    });

    it('setZoom handles zoom out', () => {
      act(() => {
        useCanvasUIStore.getState().setZoom(0.5);
      });
      expect(useCanvasUIStore.getState().zoom).toBe(0.5);
    });
  });

  describe('pan controls', () => {
    it('setPan updates pan position', () => {
      act(() => {
        useCanvasUIStore.getState().setPan({ x: 100, y: 200 });
      });
      expect(useCanvasUIStore.getState().panPosition).toEqual({ x: 100, y: 200 });
    });

    it('setPan handles negative values', () => {
      act(() => {
        useCanvasUIStore.getState().setPan({ x: -50, y: -100 });
      });
      expect(useCanvasUIStore.getState().panPosition).toEqual({ x: -50, y: -100 });
    });
  });

  describe('selection management', () => {
    it('selectAtoms sets selected atom IDs', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2']);
      });
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-1', 'atom-2']);
    });

    it('selectAtoms replaces existing selection', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1']);
        useCanvasUIStore.getState().selectAtoms(['atom-3', 'atom-4']);
      });
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-3', 'atom-4']);
    });

    it('addToSelection adds to existing selection', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1']);
        useCanvasUIStore.getState().addToSelection('atom-2');
      });
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-1', 'atom-2']);
    });

    it('addToSelection does not add duplicates', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2']);
        useCanvasUIStore.getState().addToSelection('atom-1');
      });
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-1', 'atom-2']);
    });

    it('removeFromSelection removes specific atom', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2', 'atom-3']);
        useCanvasUIStore.getState().removeFromSelection('atom-2');
      });
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-1', 'atom-3']);
    });

    it('clearSelection clears all selections', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2']);
        useCanvasUIStore.getState().clearSelection();
      });
      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual([]);
    });
  });

  describe('minimap controls', () => {
    it('toggleMinimap toggles visibility', () => {
      expect(useCanvasUIStore.getState().minimapVisible).toBe(true);

      act(() => {
        useCanvasUIStore.getState().toggleMinimap();
      });
      expect(useCanvasUIStore.getState().minimapVisible).toBe(false);

      act(() => {
        useCanvasUIStore.getState().toggleMinimap();
      });
      expect(useCanvasUIStore.getState().minimapVisible).toBe(true);
    });

    it('setMinimapVisible sets specific value', () => {
      act(() => {
        useCanvasUIStore.getState().setMinimapVisible(false);
      });
      expect(useCanvasUIStore.getState().minimapVisible).toBe(false);

      act(() => {
        useCanvasUIStore.getState().setMinimapVisible(true);
      });
      expect(useCanvasUIStore.getState().minimapVisible).toBe(true);
    });
  });

  describe('resetView', () => {
    it('resets zoom and pan position', () => {
      act(() => {
        useCanvasUIStore.getState().setZoom(2);
        useCanvasUIStore.getState().setPan({ x: 500, y: 300 });
      });

      expect(useCanvasUIStore.getState().zoom).toBe(2);
      expect(useCanvasUIStore.getState().panPosition).toEqual({ x: 500, y: 300 });

      act(() => {
        useCanvasUIStore.getState().resetView();
      });

      expect(useCanvasUIStore.getState().zoom).toBe(1);
      expect(useCanvasUIStore.getState().panPosition).toEqual({ x: 0, y: 0 });
    });

    it('does not affect selection', () => {
      act(() => {
        useCanvasUIStore.getState().selectAtoms(['atom-1', 'atom-2']);
        useCanvasUIStore.getState().setZoom(2);
        useCanvasUIStore.getState().resetView();
      });

      expect(useCanvasUIStore.getState().selectedAtomIds).toEqual(['atom-1', 'atom-2']);
    });
  });
});
