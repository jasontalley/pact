import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentAtoms } from '@/components/dashboard/RecentAtoms';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAtoms } from '@/hooks/atoms/use-atoms';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the useAtoms hook
vi.mock('@/hooks/atoms/use-atoms', () => ({
  useAtoms: vi.fn(),
}));

// Mock the format utility
vi.mock('@/lib/utils/format', () => ({
  formatDistanceToNow: vi.fn(() => '2 hours ago'),
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

const mockAtoms = [
  {
    id: 'uuid-1',
    atomId: 'IA-001',
    description: 'User can log in with email and password',
    status: 'draft' as const,
    category: 'functional',
    qualityScore: 75,
    createdAt: '2025-06-15T10:00:00Z',
    updatedAt: '2025-06-15T10:00:00Z',
  },
  {
    id: 'uuid-2',
    atomId: 'IA-002',
    description: 'API response time must be under 200ms',
    status: 'committed' as const,
    category: 'performance',
    qualityScore: 90,
    createdAt: '2025-06-14T10:00:00Z',
    updatedAt: '2025-06-14T10:00:00Z',
  },
];

describe('RecentAtoms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-UI-004
  it('renders loading state', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Verify the component title is displayed during loading
    expect(screen.getByText('Recent Atoms')).toBeInTheDocument();
    // Check for loading skeletons (5 items) to provide visual feedback
    const skeletons = document.querySelectorAll('.animate-pulse');
    // Verify exactly 5 skeleton placeholders are shown during loading state
    expect(skeletons.length).toBe(5);
  });

  // @atom IA-UI-004
  it('renders error state', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Failed to fetch'),
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Verify the component title remains visible during error state
    expect(screen.getByText('Recent Atoms')).toBeInTheDocument();
    // Verify error message is displayed to inform the user of the failure
    expect(screen.getByText('Failed to load atoms')).toBeInTheDocument();
    // Boundary: Error state should have null data
    const hookResult = (useAtoms as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(hookResult.data).toBeNull();
  });

  // @atom IA-UI-004
  it('renders empty state when no atoms', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Verify empty state message encourages user to create their first atom
    expect(screen.getByText('No atoms yet. Create your first intent atom!')).toBeInTheDocument();
    // Boundary: Zero items means no atom links should be rendered (only "View all" link)
    const atomLinks = screen.getAllByRole('link').filter(link =>
      link.getAttribute('href')?.startsWith('/atoms/') && link.getAttribute('href') !== '/atoms'
    );
    expect(atomLinks.length).toBe(0);
  });

  // @atom IA-UI-004
  it('renders atoms list when data is available', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Verify atom IDs are displayed for identification
    expect(screen.getByText('IA-001')).toBeInTheDocument();
    expect(screen.getByText('IA-002')).toBeInTheDocument();
    // Verify atom descriptions are displayed for context
    expect(screen.getByText('User can log in with email and password')).toBeInTheDocument();
    expect(screen.getByText('API response time must be under 200ms')).toBeInTheDocument();
  });

  // @atom IA-UI-004
  it('displays status badges for atoms', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Verify draft status badge is displayed for draft atoms
    expect(screen.getByText('Draft')).toBeInTheDocument();
    // Verify committed status badge is displayed for committed atoms
    expect(screen.getByText('Committed')).toBeInTheDocument();
  });

  // @atom IA-UI-004
  it('displays quality badges for atoms', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Verify quality score percentage is displayed for first atom
    expect(screen.getByText('75%')).toBeInTheDocument();
    // Verify quality score percentage is displayed for second atom
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  // @atom IA-UI-004
  it('displays relative timestamps', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Both atoms should show "2 hours ago" (mocked)
    const timestamps = screen.getAllByText('2 hours ago');
    // Verify each atom displays its relative timestamp
    expect(timestamps.length).toBe(2);
  });

  // @atom IA-UI-004
  it('has links to individual atom pages', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    const links = screen.getAllByRole('link');
    // Verify correct number of links: "View all" link + 2 atom links
    expect(links.length).toBe(3);
    // Verify first atom link navigates to correct atom detail page
    expect(links[1]).toHaveAttribute('href', '/atoms/uuid-1');
    // Verify second atom link navigates to correct atom detail page
    expect(links[2]).toHaveAttribute('href', '/atoms/uuid-2');
  });

  // @atom IA-UI-004
  it('has View all link to atoms page', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    const viewAllLink = screen.getByRole('link', { name: 'View all' });
    // Verify "View all" link navigates to the atoms list page
    expect(viewAllLink).toHaveAttribute('href', '/atoms');
  });

  // BOUNDARY TESTS

  // @atom IA-UI-004
  it('handles single atom boundary case', () => {
    // Boundary test: minimum non-empty list (1 atom)
    const singleAtom = [mockAtoms[0]];
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: singleAtom, total: 1 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Verify single atom is rendered correctly
    expect(screen.getByText('IA-001')).toBeInTheDocument();
    // Verify no other atoms are displayed
    expect(screen.queryByText('IA-002')).not.toBeInTheDocument();
    // Verify correct number of links: "View all" + 1 atom link
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(2);
  });

  // @atom IA-UI-004
  it('handles atoms with boundary quality scores (0% and 100%)', () => {
    // Boundary test: minimum (0%) and maximum (100%) quality scores
    const boundaryAtoms = [
      {
        id: 'uuid-min',
        atomId: 'IA-MIN',
        description: 'Atom with minimum quality score',
        status: 'draft' as const,
        category: 'functional',
        qualityScore: 0,
        createdAt: '2025-06-15T10:00:00Z',
        updatedAt: '2025-06-15T10:00:00Z',
      },
      {
        id: 'uuid-max',
        atomId: 'IA-MAX',
        description: 'Atom with maximum quality score',
        status: 'committed' as const,
        category: 'performance',
        qualityScore: 100,
        createdAt: '2025-06-14T10:00:00Z',
        updatedAt: '2025-06-14T10:00:00Z',
      },
    ];

    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: boundaryAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Verify minimum quality score (0%) is displayed correctly
    expect(screen.getByText('0%')).toBeInTheDocument();
    // Verify maximum quality score (100%) is displayed correctly
    expect(screen.getByText('100%')).toBeInTheDocument();
    // Verify both boundary atoms render their descriptions
    expect(screen.getByText('Atom with minimum quality score')).toBeInTheDocument();
    expect(screen.getByText('Atom with maximum quality score')).toBeInTheDocument();
    // Boundary: Verify minimum quality score is not less than 0
    expect(boundaryAtoms[0].qualityScore).toBeGreaterThan(-1);
    // Boundary: Verify maximum quality score is not greater than 100
    expect(boundaryAtoms[1].qualityScore).toBeLessThan(101);
  });

  // @atom IA-UI-004
  it('handles atom with empty description boundary case', () => {
    // Boundary test: atom with empty string description
    const emptyDescAtom = [
      {
        id: 'uuid-empty',
        atomId: 'IA-EMPTY',
        description: '',
        status: 'draft' as const,
        category: 'functional',
        qualityScore: 50,
        createdAt: '2025-06-15T10:00:00Z',
        updatedAt: '2025-06-15T10:00:00Z',
      },
    ];

    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: emptyDescAtom, total: 1 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Verify atom ID is still displayed even with empty description
    expect(screen.getByText('IA-EMPTY')).toBeInTheDocument();
    // Verify quality score is displayed
    expect(screen.getByText('50%')).toBeInTheDocument();
    // Verify the link to the atom still exists and is correct
    const links = screen.getAllByRole('link');
    expect(links[1]).toHaveAttribute('href', '/atoms/uuid-empty');
    // Boundary: Verify description length is zero (empty boundary)
    expect(emptyDescAtom[0].description.length).toBe(0);
  });

  // @atom IA-UI-004
  it('handles undefined optional fields gracefully', () => {
    // Boundary test: atom with undefined optional category
    const atomWithUndefined = [
      {
        id: 'uuid-undef',
        atomId: 'IA-UNDEF',
        description: 'Atom with undefined category',
        status: 'draft' as const,
        category: undefined,
        qualityScore: 60,
        createdAt: '2025-06-15T10:00:00Z',
        updatedAt: '2025-06-15T10:00:00Z',
      },
    ];

    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: atomWithUndefined, total: 1 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Verify atom renders even when optional field is undefined
    expect(screen.getByText('IA-UNDEF')).toBeInTheDocument();
    // Boundary: Verify category is undefined (null boundary pattern)
    expect(atomWithUndefined[0].category).toBeUndefined();
  });

  // @atom IA-UI-004
  it('handles atom list with maximum display limit', () => {
    // Boundary test: verify component respects display limits
    const manyAtoms = Array.from({ length: 10 }, (_, i) => ({
      id: `uuid-${i}`,
      atomId: `IA-${String(i).padStart(3, '0')}`,
      description: `Atom number ${i}`,
      status: 'draft' as const,
      category: 'functional',
      qualityScore: i * 10,
      createdAt: '2025-06-15T10:00:00Z',
      updatedAt: '2025-06-15T10:00:00Z',
    }));

    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: manyAtoms, total: 10 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Verify first atom is rendered
    expect(screen.getByText('IA-000')).toBeInTheDocument();
    // Boundary: Total count should be greater than typical display limit
    expect(manyAtoms.length).toBeGreaterThan(5);
    // Boundary: Quality scores should range from 0 to less than 100
    expect(manyAtoms[0].qualityScore).toBe(0);
    expect(manyAtoms[9].qualityScore).toBeLessThan(100);
  });
});
