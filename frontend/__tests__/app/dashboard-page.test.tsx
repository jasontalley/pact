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
  it('renders AppLayout with sidebar hidden', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    const layout = screen.getByTestId('app-layout');
    expect(layout).toBeInTheDocument();
    expect(layout).toHaveAttribute('data-show-sidebar', 'false');
  });

  it('renders dashboard heading', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders dashboard description', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    expect(screen.getByText(/Overview of your Intent Atoms/)).toBeInTheDocument();
  });

  it('renders DashboardStats component', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    expect(screen.getByTestId('dashboard-stats')).toBeInTheDocument();
  });

  it('renders RecentAtoms component', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    expect(screen.getByTestId('recent-atoms')).toBeInTheDocument();
  });

  it('renders QuickActions component', () => {
    render(<DashboardPage />, { wrapper: createWrapper() });

    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
  });
});
