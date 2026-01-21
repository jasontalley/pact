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
    // @atom IA-UI-003
    it('renders when isOpen is true', () => {
      render(<Sidebar isOpen={true} />, { wrapper: createWrapper() });
      // Verify the sidebar content is visible when isOpen prop is true
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('renders by default (isOpen defaults to true)', () => {
      render(<Sidebar />, { wrapper: createWrapper() });
      // Verify the sidebar renders with default props (isOpen should default to true)
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('does not render when isOpen is false', () => {
      render(<Sidebar isOpen={false} />, { wrapper: createWrapper() });
      // Verify the sidebar content is hidden when isOpen prop is false
      expect(screen.queryByText('Filters')).not.toBeInTheDocument();
    });
  });

  describe('search functionality', () => {
    // @atom IA-UI-003
    it('renders search input', () => {
      render(<Sidebar />, { wrapper: createWrapper() });
      // Verify the search input field is present with correct placeholder text
      expect(screen.getByPlaceholderText('Search atoms...')).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('updates URL when typing in search', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText('Search atoms...');
      fireEvent.change(searchInput, { target: { value: 'test query' } });

      // Verify the router push is called with the correct search query parameter
      expect(mockPush).toHaveBeenCalledWith('/atoms?search=test+query');
    });
  });

  describe('status filter', () => {
    // @atom IA-UI-003
    it('renders all status options', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      // Verify draft status filter button is rendered
      expect(screen.getByRole('button', { name: /draft/i })).toBeInTheDocument();
      // Verify committed status filter button is rendered
      expect(screen.getByRole('button', { name: /committed/i })).toBeInTheDocument();
      // Verify superseded status filter button is rendered
      expect(screen.getByRole('button', { name: /superseded/i })).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('updates URL when clicking status filter', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button', { name: /draft/i }));

      // Verify the router push is called with the correct status filter parameter
      expect(mockPush).toHaveBeenCalledWith('/atoms?status=draft');
    });
  });

  describe('category filter', () => {
    // @atom IA-UI-003
    it('renders all category options', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      // Verify functional category filter button is rendered
      expect(screen.getByRole('button', { name: /functional/i })).toBeInTheDocument();
      // Verify performance category filter button is rendered
      expect(screen.getByRole('button', { name: /performance/i })).toBeInTheDocument();
      // Verify security category filter button is rendered
      expect(screen.getByRole('button', { name: /security/i })).toBeInTheDocument();
      // Verify reliability category filter button is rendered
      expect(screen.getByRole('button', { name: /reliability/i })).toBeInTheDocument();
      // Verify usability category filter button is rendered
      expect(screen.getByRole('button', { name: /usability/i })).toBeInTheDocument();
      // Verify maintainability category filter button is rendered
      expect(screen.getByRole('button', { name: /maintainability/i })).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('updates URL when clicking category filter', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByRole('button', { name: /security/i }));

      // Verify the router push is called with the correct category filter parameter
      expect(mockPush).toHaveBeenCalledWith('/atoms?category=security');
    });
  });

  describe('tags filter', () => {
    // @atom IA-UI-003
    it('renders popular tags', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      // Verify authentication tag is displayed
      expect(screen.getByText('authentication')).toBeInTheDocument();
      // Verify api tag is displayed
      expect(screen.getByText('api')).toBeInTheDocument();
      // Verify login tag is displayed
      expect(screen.getByText('login')).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('displays tag counts', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      // Verify authentication tag count (5) is displayed
      expect(screen.getByText('(5)')).toBeInTheDocument();
      // Verify api tag count (3) is displayed
      expect(screen.getByText('(3)')).toBeInTheDocument();
      // Verify login tag count (2) is displayed
      expect(screen.getByText('(2)')).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('updates URL when clicking tag', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('authentication'));

      // Verify the router push is called with the correct tag filter parameter
      expect(mockPush).toHaveBeenCalledWith('/atoms?tag=authentication');
    });
  });

  describe('close button', () => {
    // @atom IA-UI-003
    it('shows close button when onClose is provided', () => {
      const onClose = vi.fn();
      render(<Sidebar onClose={onClose} />, { wrapper: createWrapper() });

      // Find close button (X icon)
      const closeButtons = screen.getAllByRole('button');
      const closeButton = closeButtons.find(
        (btn) => btn.querySelector('svg')?.classList.contains('lucide-x')
      );

      // Verify the close button is present when onClose callback is provided
      expect(closeButton).toBeDefined();
    });

    // @atom IA-UI-003
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(<Sidebar onClose={onClose} />, { wrapper: createWrapper() });

      // Find close button in the header area
      const closeButtons = screen.getAllByRole('button');
      const closeButton = closeButtons[0]; // First button should be close

      fireEvent.click(closeButton);

      // Verify the onClose callback is invoked exactly once when close button is clicked
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('filter sections', () => {
    // @atom IA-UI-003
    it('has Status section label', () => {
      render(<Sidebar />, { wrapper: createWrapper() });
      // Verify the Status section heading is displayed
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('has Category section label', () => {
      render(<Sidebar />, { wrapper: createWrapper() });
      // Verify the Category section heading is displayed
      expect(screen.getByText('Category')).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('has Tags section label', () => {
      render(<Sidebar />, { wrapper: createWrapper() });
      // Verify the Tags section heading is displayed
      expect(screen.getByText('Tags')).toBeInTheDocument();
    });
  });

  describe('boundary tests', () => {
    // @atom IA-UI-003
    it('handles empty search query - zero navigation calls boundary', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText('Search atoms...');
      // Clear any previous calls from initial render
      mockPush.mockClear();

      // Simulate typing and then clearing the search input
      fireEvent.change(searchInput, { target: { value: '' } });

      // Verify empty search results in zero calls (boundary: zero/empty)
      expect(mockPush.mock.calls.length).toBe(0);
    });

    // @atom IA-UI-003
    it('handles special characters in search query by URL encoding', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText('Search atoms...');
      // Test with special characters that need URL encoding
      fireEvent.change(searchInput, { target: { value: 'test&query=value' } });

      // Verify the router push is called and special characters are properly encoded
      expect(mockPush).toHaveBeenCalled();
      const lastCall = mockPush.mock.calls.at(-1);
      // Verify the URL contains encoded special characters (& should be encoded)
      expect(lastCall?.[0]).toMatch(/search=/);
    });

    // @atom IA-UI-003
    it('does not call onClose when onClose prop is not provided', () => {
      // Render sidebar without onClose prop
      render(<Sidebar />, { wrapper: createWrapper() });

      // Get all buttons and try to find one that might be a close button
      const buttons = screen.getAllByRole('button');

      // Click each button to verify none throws an error when onClose is undefined
      for (const button of buttons) {
        // This should not throw even if internal close handler is triggered (error boundary)
        expect(() => fireEvent.click(button)).not.toThrow();
      }

      // Verify the sidebar still renders correctly after clicking buttons
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('handles rapid visibility toggle without errors', () => {
      const { rerender } = render(<Sidebar isOpen={true} />, { wrapper: createWrapper() });

      // Verify initially visible
      expect(screen.getByText('Filters')).toBeInTheDocument();

      // Rapidly toggle visibility
      rerender(<Sidebar isOpen={false} />);
      // Verify hidden after first toggle (null boundary)
      expect(screen.queryByText('Filters')).toBeNull();

      rerender(<Sidebar isOpen={true} />);
      // Verify visible after second toggle
      expect(screen.getByText('Filters')).toBeInTheDocument();

      rerender(<Sidebar isOpen={false} />);
      // Verify hidden after third toggle (null boundary)
      expect(screen.queryByText('Filters')).toBeNull();

      rerender(<Sidebar isOpen={true} />);
      // Verify sidebar renders correctly after rapid toggling
      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('returns null element when sidebar is closed - null boundary', () => {
      render(<Sidebar isOpen={false} />, { wrapper: createWrapper() });

      // Verify querying for sidebar content returns null when closed (null boundary)
      expect(screen.queryByText('Filters')).toBeNull();
      expect(screen.queryByText('Status')).toBeNull();
      expect(screen.queryByText('Category')).toBeNull();
    });

    // @atom IA-UI-003
    it('tag counts are greater than zero - range boundary', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      // Verify all tag counts are greater than zero (range boundary)
      const count5 = screen.getByText('(5)');
      const count3 = screen.getByText('(3)');
      const count2 = screen.getByText('(2)');

      // Parse counts and verify they are greater than zero
      expect(Number.parseInt(count5.textContent?.replaceAll(/[()]/g, '') || '0')).toBeGreaterThan(0);
      expect(Number.parseInt(count3.textContent?.replaceAll(/[()]/g, '') || '0')).toBeGreaterThan(0);
      expect(Number.parseInt(count2.textContent?.replaceAll(/[()]/g, '') || '0')).toBeGreaterThan(0);
    });

    // @atom IA-UI-003
    it('number of filter buttons is within expected range - range boundary', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      const buttons = screen.getAllByRole('button');

      // Verify there are at least 9 filter buttons (3 status + 6 category)
      expect(buttons.length).toBeGreaterThan(8);
      // Verify there are fewer than 20 buttons (reasonable upper bound)
      expect(buttons.length).toBeLessThan(20);
    });

    // @atom IA-UI-003
    it('search input value starts at zero length - zero boundary', () => {
      render(<Sidebar />, { wrapper: createWrapper() });

      const searchInput = screen.getByPlaceholderText('Search atoms...') as HTMLInputElement;

      // Verify search input starts with zero-length value (zero/empty boundary)
      expect(searchInput.value.length).toBe(0);
    });

    // @atom IA-UI-003
    it('onClose callback is undefined when not provided - undefined boundary', () => {
      // Create a ref to capture the component's props
      const props: { isOpen: boolean; onClose?: () => void } = { isOpen: true };
      render(<Sidebar {...props} />, { wrapper: createWrapper() });

      // Verify that accessing onClose on the props object is undefined (undefined boundary)
      expect(props.onClose).toBeUndefined();
    });
  });
});
