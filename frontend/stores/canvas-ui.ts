import { create } from 'zustand';

/**
 * Canvas UI state for ReactFlow canvas
 */
interface CanvasUIState {
  // Zoom level (1 = 100%)
  zoom: number;

  // Pan position
  panPosition: { x: number; y: number };

  // Selected atom IDs
  selectedAtomIds: string[];

  // Minimap visibility
  minimapVisible: boolean;

  // Actions
  setZoom: (zoom: number) => void;
  setPan: (position: { x: number; y: number }) => void;
  selectAtoms: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  toggleMinimap: () => void;
  setMinimapVisible: (visible: boolean) => void;
  resetView: () => void;
}

export const useCanvasUIStore = create<CanvasUIState>((set) => ({
  zoom: 1,
  panPosition: { x: 0, y: 0 },
  selectedAtomIds: [],
  minimapVisible: true,

  setZoom: (zoom) => set({ zoom }),

  setPan: (position) => set({ panPosition: position }),

  selectAtoms: (ids) => set({ selectedAtomIds: ids }),

  addToSelection: (id) =>
    set((state) => ({
      selectedAtomIds: state.selectedAtomIds.includes(id)
        ? state.selectedAtomIds
        : [...state.selectedAtomIds, id],
    })),

  removeFromSelection: (id) =>
    set((state) => ({
      selectedAtomIds: state.selectedAtomIds.filter((atomId) => atomId !== id),
    })),

  clearSelection: () => set({ selectedAtomIds: [] }),

  toggleMinimap: () => set((state) => ({ minimapVisible: !state.minimapVisible })),

  setMinimapVisible: (visible) => set({ minimapVisible: visible }),

  resetView: () =>
    set({
      zoom: 1,
      panPosition: { x: 0, y: 0 },
    }),
}));
