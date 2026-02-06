import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useLayoutStore } from '@/stores/layout';

describe('useLayoutStore', () => {
  beforeEach(() => {
    // Reset store to initial-like state before each test
    act(() => {
      useLayoutStore.getState().setSidebarOpen(true);
      useLayoutStore.getState().closeAtomDetail();
      useLayoutStore.getState().setActiveTab('dashboard');
    });
  });

  describe('initial state', () => {
    // @atom IA-STORE-001
    it('has correct initial values', () => {
      const state = useLayoutStore.getState();
      // Verify sidebar defaults to open for optimal user experience
      expect(state.sidebarOpen).toBe(true);
      // Verify no atom detail panel is shown on initial load
      expect(state.detailPanelAtomId).toBeNull();
      // Verify dashboard is the default landing tab
      expect(state.activeTab).toBe('dashboard');
    });
  });

  describe('sidebar controls', () => {
    // @atom IA-STORE-001
    it('toggleSidebar toggles sidebar state', () => {
      // Confirm initial sidebar state is open
      expect(useLayoutStore.getState().sidebarOpen).toBe(true);

      act(() => {
        useLayoutStore.getState().toggleSidebar();
      });
      // Verify toggle closes the sidebar when it was open
      expect(useLayoutStore.getState().sidebarOpen).toBe(false);

      act(() => {
        useLayoutStore.getState().toggleSidebar();
      });
      // Verify toggle re-opens the sidebar when it was closed
      expect(useLayoutStore.getState().sidebarOpen).toBe(true);
    });

    // @atom IA-STORE-001
    it('setSidebarOpen sets specific value', () => {
      act(() => {
        useLayoutStore.getState().setSidebarOpen(false);
      });
      // Verify explicit false value closes sidebar
      expect(useLayoutStore.getState().sidebarOpen).toBe(false);

      act(() => {
        useLayoutStore.getState().setSidebarOpen(true);
      });
      // Verify explicit true value opens sidebar
      expect(useLayoutStore.getState().sidebarOpen).toBe(true);
    });
  });

  describe('detail panel controls', () => {
    // @atom IA-STORE-001
    it('openAtomDetail sets the atom ID', () => {
      // Confirm detail panel starts with no atom selected
      expect(useLayoutStore.getState().detailPanelAtomId).toBeNull();

      act(() => {
        useLayoutStore.getState().openAtomDetail('atom-123');
      });
      // Verify atom ID is correctly stored for detail panel display
      expect(useLayoutStore.getState().detailPanelAtomId).toBe('atom-123');
    });

    // @atom IA-STORE-001
    it('openAtomDetail can change to different atom', () => {
      act(() => {
        useLayoutStore.getState().openAtomDetail('atom-123');
        useLayoutStore.getState().openAtomDetail('atom-456');
      });
      // Verify opening a new atom replaces the previous atom ID
      expect(useLayoutStore.getState().detailPanelAtomId).toBe('atom-456');
    });

    // @atom IA-STORE-001
    it('closeAtomDetail clears the atom ID', () => {
      act(() => {
        useLayoutStore.getState().openAtomDetail('atom-123');
      });
      // Confirm atom detail panel is open with the correct ID
      expect(useLayoutStore.getState().detailPanelAtomId).toBe('atom-123');

      act(() => {
        useLayoutStore.getState().closeAtomDetail();
      });
      // Verify closing detail panel resets atom ID to null
      expect(useLayoutStore.getState().detailPanelAtomId).toBeNull();
    });
  });

  describe('tab navigation', () => {
    // @atom IA-STORE-001
    it('setActiveTab changes to canvas', () => {
      act(() => {
        useLayoutStore.getState().setActiveTab('canvas');
      });
      // Verify tab can be changed to canvas view
      expect(useLayoutStore.getState().activeTab).toBe('canvas');
    });

    // @atom IA-STORE-001
    it('setActiveTab changes to list', () => {
      act(() => {
        useLayoutStore.getState().setActiveTab('list');
      });
      // Verify tab can be changed to list view
      expect(useLayoutStore.getState().activeTab).toBe('list');
    });

    // @atom IA-STORE-001
    it('setActiveTab changes to dashboard', () => {
      act(() => {
        useLayoutStore.getState().setActiveTab('list');
        useLayoutStore.getState().setActiveTab('dashboard');
      });
      // Verify tab can be changed back to dashboard from another tab
      expect(useLayoutStore.getState().activeTab).toBe('dashboard');
    });
  });

  describe('combined state changes', () => {
    // @atom IA-STORE-001
    it('opening detail panel does not affect sidebar', () => {
      act(() => {
        useLayoutStore.getState().openAtomDetail('atom-123');
      });
      // Verify sidebar state is independent of detail panel state
      expect(useLayoutStore.getState().sidebarOpen).toBe(true);
    });

    // @atom IA-STORE-001
    it('changing tab does not affect detail panel', () => {
      act(() => {
        useLayoutStore.getState().openAtomDetail('atom-123');
        useLayoutStore.getState().setActiveTab('canvas');
      });
      // Verify detail panel atom ID persists across tab changes
      expect(useLayoutStore.getState().detailPanelAtomId).toBe('atom-123');
    });
  });

  describe('boundary tests', () => {
    // @atom IA-STORE-001
    it('handles rapid sidebar toggling without state corruption', () => {
      // Boundary test: rapid toggling should maintain consistent state
      const initialState = useLayoutStore.getState().sidebarOpen;

      act(() => {
        // Toggle rapidly 10 times
        for (let i = 0; i < 10; i++) {
          useLayoutStore.getState().toggleSidebar();
        }
      });

      // After even number of toggles, state should match initial
      // Verify state consistency after rapid toggling (10 toggles = back to original)
      expect(useLayoutStore.getState().sidebarOpen).toBe(initialState);

      act(() => {
        // Toggle one more time (odd number total)
        useLayoutStore.getState().toggleSidebar();
      });

      // After odd number of toggles, state should be opposite of initial
      // Verify 11 toggles results in opposite state from initial
      expect(useLayoutStore.getState().sidebarOpen).toBe(!initialState);
    });

    // @atom IA-STORE-001
    it('handles opening and closing detail panel rapidly without losing state', () => {
      // Boundary test: rapid open/close cycles should maintain state integrity
      const atomIds = ['atom-1', 'atom-2', 'atom-3', 'atom-4', 'atom-5'];

      act(() => {
        // Rapidly open different atoms
        for (const id of atomIds) {
          useLayoutStore.getState().openAtomDetail(id);
        }
      });

      // Verify the last opened atom is the one displayed
      // After rapid atom changes, only the last atom ID should be stored
      expect(useLayoutStore.getState().detailPanelAtomId).toBe('atom-5');

      act(() => {
        // Rapidly close and reopen
        useLayoutStore.getState().closeAtomDetail();
        useLayoutStore.getState().openAtomDetail('atom-final');
        useLayoutStore.getState().closeAtomDetail();
        useLayoutStore.getState().openAtomDetail('atom-really-final');
      });

      // Verify final state after rapid close/open cycles
      // After multiple close/open operations, only the last state matters
      expect(useLayoutStore.getState().detailPanelAtomId).toBe('atom-really-final');
    });

    // @atom IA-STORE-001
    it('handles empty string atom ID as valid value', () => {
      // Boundary test: empty string is a valid (though unusual) atom ID
      act(() => {
        useLayoutStore.getState().openAtomDetail('');
      });

      // Verify empty string is stored correctly (not treated as null/undefined)
      // Empty string should be stored as-is, not coerced to null
      expect(useLayoutStore.getState().detailPanelAtomId).toBe('');
    });

    // @atom IA-STORE-001
    it('handles setting same tab multiple times', () => {
      // Boundary test: setting same tab repeatedly should be idempotent
      act(() => {
        useLayoutStore.getState().setActiveTab('canvas');
        useLayoutStore.getState().setActiveTab('canvas');
        useLayoutStore.getState().setActiveTab('canvas');
      });

      // Verify idempotent behavior - multiple same-tab calls maintain correct state
      // Setting the same tab multiple times should result in that tab being active
      expect(useLayoutStore.getState().activeTab).toBe('canvas');
    });
  });
});
