import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from '@/app/page';

// Mock all child components
vi.mock('@/components/layout', () => ({
  AppLayout: ({ children, showSidebar }: any) => (
    <div data-testid="app-layout" data-show-sidebar={showSidebar}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/dashboard/DashboardStats', () => ({
  DashboardStats: () => <div data-testid="dashboard-stats">Dashboard Stats</div>,
}));

vi.mock('@/components/dashboard/RecentAtoms', () => ({
  RecentAtoms: () => <div data-testid="recent-atoms">Recent Atoms</div>,
}));

vi.mock('@/components/dashboard/QuickActions', () => ({
  QuickActions: () => <div data-testid="quick-actions">Quick Actions</div>,
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('DashboardPage', () => {
  // @atom IA-UI-013
  it('renders AppLayout with sidebar hidden', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    const layout = screen.getByTestId('app-layout');
    // Verify AppLayout wrapper is rendered as the page container
    expect(layout).toBeInTheDocument();
    // Verify sidebar is hidden on dashboard page for maximized content area
    expect(layout).toHaveAttribute('data-show-sidebar', 'false');
  });

  // @atom IA-UI-013
  it('renders dashboard heading', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    // Verify main heading is present for accessibility and page identification
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  // @atom IA-UI-013
  it('renders dashboard description', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    // Verify descriptive text is shown to explain the dashboard purpose
    expect(screen.getByText(/Overview of your Intent Atoms/)).toBeInTheDocument();
  });

  // @atom IA-UI-013
  it('renders DashboardStats component', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    // Verify DashboardStats component is mounted to display atom statistics
    expect(screen.getByTestId('dashboard-stats')).toBeInTheDocument();
  });

  // @atom IA-UI-013
  it('renders RecentAtoms component', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    // Verify RecentAtoms component is mounted to display recent atom activity
    expect(screen.getByTestId('recent-atoms')).toBeInTheDocument();
  });

  // @atom IA-UI-013
  it('renders QuickActions component', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    // Verify QuickActions component is mounted to provide user shortcuts
    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
  });

  // Boundary Tests

  // @atom IA-UI-013
  it('renders all required dashboard sections in correct order', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    const layout = screen.getByTestId('app-layout');
    const stats = screen.getByTestId('dashboard-stats');
    const recentAtoms = screen.getByTestId('recent-atoms');
    const quickActions = screen.getByTestId('quick-actions');

    // Verify all dashboard components are children of the layout (boundary: minimum required components)
    expect(layout).toContainElement(stats);
    expect(layout).toContainElement(recentAtoms);
    expect(layout).toContainElement(quickActions);

    // Verify proper DOM ordering: stats should appear before recent atoms (boundary: layout order)
    expect(stats.compareDocumentPosition(recentAtoms)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  // @atom IA-UI-013
  it('does not render sidebar or navigation elements on dashboard', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    // Verify no sidebar navigation is present (boundary: dashboard should be sidebar-free)
    expect(screen.queryByRole('navigation')).toBeNull();
    // Verify sidebar is explicitly disabled via data attribute (boundary: sidebar state must be false)
    expect(screen.getByTestId('app-layout')).not.toHaveAttribute('data-show-sidebar', 'true');
  });

  // @atom IA-UI-013
  it('renders zero error messages on initial load', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    // Boundary: dashboard should display zero errors on successful initial render
    const errorElements = screen.queryAllByRole('alert');
    expect(errorElements.length).toBe(0);
  });

  // @atom IA-UI-013
  it('returns null for non-existent dashboard elements', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    // Boundary: querying for elements that should not exist returns null
    expect(screen.queryByTestId('error-boundary')).toBeNull();
    expect(screen.queryByTestId('loading-spinner')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

});
