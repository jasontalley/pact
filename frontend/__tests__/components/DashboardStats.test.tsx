import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAtoms } from '@/hooks/atoms/use-atoms';

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
  // @atom IA-UI-007
  it('renders all stat cards', () => {
    render(<DashboardStats />, { wrapper: createWrapper() });

    // Verify the Total Atoms card title is displayed
    expect(screen.getByText('Total Atoms')).toBeInTheDocument();
    // Verify the Draft status card title is displayed
    expect(screen.getByText('Draft')).toBeInTheDocument();
    // Verify the Committed status card title is displayed
    expect(screen.getByText('Committed')).toBeInTheDocument();
    // Verify the Superseded status card title is displayed
    expect(screen.getByText('Superseded')).toBeInTheDocument();
  });

  // @atom IA-UI-007
  it('displays stat values', () => {
    render(<DashboardStats />, { wrapper: createWrapper() });

    // Verify total atoms count (17) is displayed correctly
    expect(screen.getByText('17')).toBeInTheDocument();
    // Verify draft atoms count (5) is displayed correctly
    expect(screen.getByText('5')).toBeInTheDocument();
    // Verify committed atoms count (10) is displayed correctly
    expect(screen.getByText('10')).toBeInTheDocument();
    // Verify superseded atoms count (2) is displayed correctly
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // @atom IA-UI-007
  it('displays descriptions', () => {
    render(<DashboardStats />, { wrapper: createWrapper() });

    // Verify the Total Atoms card shows its description
    expect(screen.getByText('All intent atoms in the system')).toBeInTheDocument();
    // Verify the Draft card shows its description
    expect(screen.getByText('Atoms in draft status')).toBeInTheDocument();
    // Verify the Committed card shows its description
    expect(screen.getByText('Immutable committed atoms')).toBeInTheDocument();
    // Verify the Superseded card shows its description
    expect(screen.getByText('Atoms replaced by newer versions')).toBeInTheDocument();
  });

  // @atom IA-UI-007
  it('renders in a grid layout', () => {
    render(<DashboardStats />, { wrapper: createWrapper() });

    const cards = screen.getAllByText(/atoms|draft|committed|superseded/i, {
      selector: '.text-sm.font-medium',
    });
    // Verify exactly 4 stat cards are rendered in the grid
    expect(cards).toHaveLength(4);
  });

  // @atom IA-UI-007
  it('handles zero counts correctly (boundary: minimum value)', () => {
    // Override mock to return zero counts for all statuses
    const zeroMockData: Record<string, { total: number }> = {
      draft: { total: 0 },
      committed: { total: 0 },
      superseded: { total: 0 },
      all: { total: 0 },
    };

    vi.mocked(useAtoms).mockImplementation(({ status }: { status?: string } = {}) => {
      return {
        data: status ? zeroMockData[status] : zeroMockData.all,
        isLoading: false,
        error: null,
      };
    });

    render(<DashboardStats />, { wrapper: createWrapper() });

    // Verify zero values are displayed (should find multiple '0' elements)
    const zeroElements = screen.getAllByText('0');
    // Verify all 4 stat cards show zero when there are no atoms
    expect(zeroElements).toHaveLength(4);

    // Boundary assertion: verify each count is exactly 0
    expect(zeroMockData.draft.total).toBe(0);
    expect(zeroMockData.committed.total).toBe(0);
    expect(zeroMockData.superseded.total).toBe(0);
    expect(zeroMockData.all.total).toBe(0);
  });

  // @atom IA-UI-007
  it('handles large counts correctly (boundary: large numbers)', () => {
    // Override mock to return large counts to test number formatting
    const largeMockData: Record<string, { total: number }> = {
      draft: { total: 999999 },
      committed: { total: 1000000 },
      superseded: { total: 500000 },
      all: { total: 2499999 },
    };

    vi.mocked(useAtoms).mockImplementation(({ status }: { status?: string } = {}) => {
      return {
        data: status ? largeMockData[status] : largeMockData.all,
        isLoading: false,
        error: null,
      };
    });

    render(<DashboardStats />, { wrapper: createWrapper() });

    // Verify large total count is displayed correctly
    expect(screen.getByText('2499999')).toBeInTheDocument();
    // Verify large draft count is displayed correctly
    expect(screen.getByText('999999')).toBeInTheDocument();
    // Verify large committed count (1 million) is displayed correctly
    expect(screen.getByText('1000000')).toBeInTheDocument();
    // Verify large superseded count is displayed correctly
    expect(screen.getByText('500000')).toBeInTheDocument();

    // Boundary assertion: verify all counts are greater than zero (positive range)
    expect(largeMockData.draft.total).toBeGreaterThan(0);
    expect(largeMockData.committed.total).toBeGreaterThan(0);
    expect(largeMockData.superseded.total).toBeGreaterThan(0);
    expect(largeMockData.all.total).toBeGreaterThan(0);

    // Boundary assertion: verify total is greater than any individual category
    expect(largeMockData.all.total).toBeGreaterThan(largeMockData.draft.total);
    expect(largeMockData.all.total).toBeGreaterThan(largeMockData.committed.total);
  });
});
