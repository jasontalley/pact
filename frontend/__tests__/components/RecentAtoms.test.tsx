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

  it('renders loading state', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    expect(screen.getByText('Recent Atoms')).toBeInTheDocument();
    // Check for loading skeletons (5 items)
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(5);
  });

  it('renders error state', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Failed to fetch'),
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    expect(screen.getByText('Recent Atoms')).toBeInTheDocument();
    expect(screen.getByText('Failed to load atoms')).toBeInTheDocument();
  });

  it('renders empty state when no atoms', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    expect(screen.getByText('No atoms yet. Create your first intent atom!')).toBeInTheDocument();
  });

  it('renders atoms list when data is available', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    expect(screen.getByText('IA-001')).toBeInTheDocument();
    expect(screen.getByText('IA-002')).toBeInTheDocument();
    expect(screen.getByText('User can log in with email and password')).toBeInTheDocument();
    expect(screen.getByText('API response time must be under 200ms')).toBeInTheDocument();
  });

  it('displays status badges for atoms', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Committed')).toBeInTheDocument();
  });

  it('displays quality badges for atoms', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('displays relative timestamps', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    // Both atoms should show "2 hours ago" (mocked)
    const timestamps = screen.getAllByText('2 hours ago');
    expect(timestamps.length).toBe(2);
  });

  it('has links to individual atom pages', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    const links = screen.getAllByRole('link');
    // "View all" link + 2 atom links
    expect(links.length).toBe(3);
    expect(links[1]).toHaveAttribute('href', '/atoms/uuid-1');
    expect(links[2]).toHaveAttribute('href', '/atoms/uuid-2');
  });

  it('has View all link to atoms page', () => {
    (useAtoms as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
      error: null,
    });

    render(<RecentAtoms />, { wrapper: createWrapper() });

    const viewAllLink = screen.getByRole('link', { name: 'View all' });
    expect(viewAllLink).toHaveAttribute('href', '/atoms');
  });
});
