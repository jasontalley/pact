import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the useAtoms hook
vi.mock('@/hooks/atoms/use-atoms', () => ({
  useAtoms: vi.fn(({ status }: { status?: string } = {}) => {
    const mockData: Record<string, { total: number }> = {
      draft: { total: 5 },
      committed: { total: 10 },
      superseded: { total: 2 },
      all: { total: 17 },
    };
    return {
      data: status ? mockData[status] : mockData.all,
      isLoading: false,
      error: null,
    };
  }),
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

describe('DashboardStats', () => {
  it('renders all stat cards', () => {
    render(<DashboardStats />, { wrapper: createWrapper() });

    expect(screen.getByText('Total Atoms')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Committed')).toBeInTheDocument();
    expect(screen.getByText('Superseded')).toBeInTheDocument();
  });

  it('displays stat values', () => {
    render(<DashboardStats />, { wrapper: createWrapper() });

    // Check for the mocked values
    expect(screen.getByText('17')).toBeInTheDocument(); // Total
    expect(screen.getByText('5')).toBeInTheDocument(); // Draft
    expect(screen.getByText('10')).toBeInTheDocument(); // Committed
    expect(screen.getByText('2')).toBeInTheDocument(); // Superseded
  });

  it('displays descriptions', () => {
    render(<DashboardStats />, { wrapper: createWrapper() });

    expect(screen.getByText('All intent atoms in the system')).toBeInTheDocument();
    expect(screen.getByText('Atoms in draft status')).toBeInTheDocument();
    expect(screen.getByText('Immutable committed atoms')).toBeInTheDocument();
    expect(screen.getByText('Atoms replaced by newer versions')).toBeInTheDocument();
  });

  it('renders in a grid layout', () => {
    render(<DashboardStats />, { wrapper: createWrapper() });

    const cards = screen.getAllByText(/atoms|draft|committed|superseded/i, {
      selector: '.text-sm.font-medium',
    });
    expect(cards).toHaveLength(4);
  });
});
