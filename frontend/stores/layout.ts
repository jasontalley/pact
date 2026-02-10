import { create } from 'zustand';

/**
 * Layout state for application-wide UI concerns
 */
interface LayoutState {
  // Sidebar state
  sidebarOpen: boolean;

  // Detail panel state
  detailPanelAtomId: string | null;

  // Active view/tab
  activeTab: 'list' | 'dashboard';

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openAtomDetail: (id: string) => void;
  closeAtomDetail: () => void;
  setActiveTab: (tab: 'list' | 'dashboard') => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: true,
  detailPanelAtomId: null,
  activeTab: 'dashboard',

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  openAtomDetail: (id) => set({ detailPanelAtomId: id }),

  closeAtomDetail: () => set({ detailPanelAtomId: null }),

  setActiveTab: (tab) => set({ activeTab: tab }),
}));
