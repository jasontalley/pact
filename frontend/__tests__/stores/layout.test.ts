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
    it('has correct initial values', () => {
      const state = useLayoutStore.getState();
      expect(state.sidebarOpen).toBe(true);
      expect(state.detailPanelAtomId).toBeNull();
      expect(state.activeTab).toBe('dashboard');
    });
  });

  describe('sidebar controls', () => {
    it('toggleSidebar toggles sidebar state', () => {
      expect(useLayoutStore.getState().sidebarOpen).toBe(true);

      act(() => {
        useLayoutStore.getState().toggleSidebar();
      });
      expect(useLayoutStore.getState().sidebarOpen).toBe(false);

      act(() => {
        useLayoutStore.getState().toggleSidebar();
      });
      expect(useLayoutStore.getState().sidebarOpen).toBe(true);
    });

    it('setSidebarOpen sets specific value', () => {
      act(() => {
        useLayoutStore.getState().setSidebarOpen(false);
      });
      expect(useLayoutStore.getState().sidebarOpen).toBe(false);

      act(() => {
        useLayoutStore.getState().setSidebarOpen(true);
      });
      expect(useLayoutStore.getState().sidebarOpen).toBe(true);
    });
  });

  describe('detail panel controls', () => {
    it('openAtomDetail sets the atom ID', () => {
      expect(useLayoutStore.getState().detailPanelAtomId).toBeNull();

      act(() => {
        useLayoutStore.getState().openAtomDetail('atom-123');
      });
      expect(useLayoutStore.getState().detailPanelAtomId).toBe('atom-123');
    });

    it('openAtomDetail can change to different atom', () => {
      act(() => {
        useLayoutStore.getState().openAtomDetail('atom-123');
        useLayoutStore.getState().openAtomDetail('atom-456');
      });
      expect(useLayoutStore.getState().detailPanelAtomId).toBe('atom-456');
    });

    it('closeAtomDetail clears the atom ID', () => {
      act(() => {
        useLayoutStore.getState().openAtomDetail('atom-123');
      });
      expect(useLayoutStore.getState().detailPanelAtomId).toBe('atom-123');

      act(() => {
        useLayoutStore.getState().closeAtomDetail();
      });
      expect(useLayoutStore.getState().detailPanelAtomId).toBeNull();
    });
  });

  describe('tab navigation', () => {
    it('setActiveTab changes to canvas', () => {
      act(() => {
        useLayoutStore.getState().setActiveTab('canvas');
      });
      expect(useLayoutStore.getState().activeTab).toBe('canvas');
    });

    it('setActiveTab changes to list', () => {
      act(() => {
        useLayoutStore.getState().setActiveTab('list');
      });
      expect(useLayoutStore.getState().activeTab).toBe('list');
    });

    it('setActiveTab changes to dashboard', () => {
      act(() => {
        useLayoutStore.getState().setActiveTab('list');
        useLayoutStore.getState().setActiveTab('dashboard');
      });
      expect(useLayoutStore.getState().activeTab).toBe('dashboard');
    });
  });

  describe('combined state changes', () => {
    it('opening detail panel does not affect sidebar', () => {
      act(() => {
        useLayoutStore.getState().openAtomDetail('atom-123');
      });
      expect(useLayoutStore.getState().sidebarOpen).toBe(true);
    });

    it('changing tab does not affect detail panel', () => {
      act(() => {
        useLayoutStore.getState().openAtomDetail('atom-123');
        useLayoutStore.getState().setActiveTab('canvas');
      });
      expect(useLayoutStore.getState().detailPanelAtomId).toBe('atom-123');
    });
  });
});
