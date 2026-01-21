import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '@/components/layout/Sidebar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock Next.js navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/atoms',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the useTags hook - using tag names that don't conflict with category names
vi.mock('@/hooks/atoms/use-atoms', () => ({
  useTags: vi.fn(() => ({
    data: {
      tags: [
        { tag: 'authentication', count: 5 },
        { tag: 'api', count: 3 },
        { tag: 'login', count: 2 },
      ],
    },
    isLoading: false,
  })),
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

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('visibility', () => {
    it('renders when isOpen is true', () => {
      render(<Sidebar isOpen={true} />, { wrapper: createWrapper() });
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    it('renders by default (isOpen defaults to true)', () => {
      render(<Sidebar />, { wrapper: createWrapper() });
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(<Sidebar isOpen={false} />, { wrapper: createWrapper() });
      expect(screen.queryByText('Filters')).not.toBeInTheDocument();
    });
  });

  describe('search functionality', () => {
    it('renders search input', () => {
      render(<Sidebar />, { wrapper: createWrapper() });
      expect(screen.getByPlaceholderText('Search atoms...')).toBeInTheDocument();
    });

    it('updates URL when typing in search', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText('Search atoms...');
      fireEvent.change(searchInput, { target: { value: 'test query' } });

      expect(mockPush).toHaveBeenCalledWith('/atoms?search=test+query');
    });
  });

  describe('status filter', () => {
    it('renders all status options', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /draft/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /committed/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /superseded/i })).toBeInTheDocument();
    });

    it('updates URL when clicking status filter', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button', { name: /draft/i }));

      expect(mockPush).toHaveBeenCalledWith('/atoms?status=draft');
    });
  });

  describe('category filter', () => {
    it('renders all category options', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /functional/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /performance/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /security/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reliability/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /usability/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /maintainability/i })).toBeInTheDocument();
    });

    it('updates URL when clicking category filter', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button', { name: /security/i }));

      expect(mockPush).toHaveBeenCalledWith('/atoms?category=security');
    });
  });

  describe('tags filter', () => {
    it('renders popular tags', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      expect(screen.getByText('authentication')).toBeInTheDocument();
      expect(screen.getByText('api')).toBeInTheDocument();
      expect(screen.getByText('login')).toBeInTheDocument();
    });

    it('displays tag counts', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      expect(screen.getByText('(5)')).toBeInTheDocument();
      expect(screen.getByText('(3)')).toBeInTheDocument();
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });

    it('updates URL when clicking tag', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('authentication'));

      expect(mockPush).toHaveBeenCalledWith('/atoms?tag=authentication');
    });
  });

  describe('close button', () => {
    it('shows close button when onClose is provided', () => {
      const onClose = vi.fn();
      render(<Sidebar onClose={onClose} />, { wrapper: createWrapper() });

      // Find close button (X icon)
      const closeButtons = screen.getAllByRole('button');
      const closeButton = closeButtons.find(
        (btn) => btn.querySelector('svg')?.classList.contains('lucide-x')
      );

      expect(closeButton).toBeDefined();
    });

    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<Sidebar onClose={onClose} />, { wrapper: createWrapper() });

      // Find close button in the header area
      const closeButtons = screen.getAllByRole('button');
      const closeButton = closeButtons[0]; // First button should be close

      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('filter sections', () => {
    it('has Status section label', () => {
      render(<Sidebar />, { wrapper: createWrapper() });
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    it('has Category section label', () => {
      render(<Sidebar />, { wrapper: createWrapper() });
      expect(screen.getByText('Category')).toBeInTheDocument();
    });

    it('has Tags section label', () => {
      render(<Sidebar />, { wrapper: createWrapper() });
      expect(screen.getByText('Tags')).toBeInTheDocument();
    });
  });
});
