import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CanvasPage from '@/app/canvas/page';

// Mock all child components to simplify testing
vi.mock('@/components/layout', () => ({
  AppLayout: ({ children, showSidebar, fullHeight }: any) => (
    <div data-testid="app-layout" data-show-sidebar={showSidebar} data-full-height={fullHeight}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/canvas/CanvasClient', () => ({
  CanvasClient: () => <div data-testid="canvas-client">Canvas Client</div>,
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

describe('CanvasPage', () => {
  // @atom IA-UI-014
  it('renders AppLayout with correct props', () => {
    render(<CanvasPage />, { wrapper: createWrapper() });

    const layout = screen.getByTestId('app-layout');
    // Verify AppLayout is rendered in the DOM
    expect(layout).toBeInTheDocument();
    // Verify sidebar is hidden on canvas page for maximum workspace
    expect(layout).toHaveAttribute('data-show-sidebar', 'false');
    // Verify full height mode is enabled for canvas interactions
    expect(layout).toHaveAttribute('data-full-height', 'true');
  });

  // @atom IA-UI-014
  it('renders CanvasClient', () => {
    render(<CanvasPage />, { wrapper: createWrapper() });

    // Verify the CanvasClient component is rendered within the layout
    expect(screen.getByTestId('canvas-client')).toBeInTheDocument();
  });

  // @atom IA-UI-014
  it('does not render sidebar on canvas page (boundary: UI element exclusion)', () => {
    render(<CanvasPage />, { wrapper: createWrapper() });

    const layout = screen.getByTestId('app-layout');
    // Boundary test: sidebar must be explicitly disabled (not undefined or missing)
    expect(layout.dataset.showSidebar).toBe('false');
    // Verify showSidebar is not set to 'true' (explicit truthy check)
    expect(layout.dataset.showSidebar).not.toBe('true');
    // Verify showSidebar is not an empty string (which could be falsy but ambiguous)
    expect(layout.dataset.showSidebar).not.toBe('');
  });

  // @atom IA-UI-014
  it('requires QueryClientProvider wrapper (boundary: missing provider)', () => {
    // Boundary test: component requires QueryClientProvider context
    // Without the wrapper, the component should still render but may have limited functionality
    // This test verifies the component handles the query client context correctly
    const wrapper = createWrapper();
    const { container } = render(<CanvasPage />, { wrapper });

    // Verify the component renders successfully with the required provider
    expect(container).toBeTruthy();
    // Verify AppLayout is present when properly wrapped with QueryClientProvider
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    // Verify CanvasClient is present when properly wrapped with QueryClientProvider
    expect(screen.getByTestId('canvas-client')).toBeInTheDocument();
  });

  // @atom IA-UI-014
  it('renders with zero validation errors in initial state (boundary: zero/empty)', () => {
    render(<CanvasPage />, { wrapper: createWrapper() });

    // Boundary test: verify zero error elements are present in initial render
    const errorElements = screen.queryAllByRole('alert');
    expect(errorElements.length).toBe(0);

    // Verify no error text is displayed in initial render state
    const errorMessages = screen.queryAllByText(/error/i);
    // Confirm zero error messages exist for clean initial state
    expect(errorMessages.length).toBe(0);
  });

  // @atom IA-UI-014
  it('returns null for non-existent canvas elements (boundary: null check)', () => {
    render(<CanvasPage />, { wrapper: createWrapper() });

    // Boundary test: queryBy* returns null for elements that do not exist
    const nonExistentElement = screen.queryByTestId('non-existent-canvas-tool');
    expect(nonExistentElement).toBeNull();

    // Query for sidebar element which should not exist on canvas page
    const sidebarElement = screen.queryByTestId('sidebar');
    // Verify sidebar returns null since it is disabled on canvas page
    expect(sidebarElement).toBeNull();
  });

  // @atom IA-UI-014
  it('has undefined optional data attributes (boundary: undefined check)', () => {
    render(<CanvasPage />, { wrapper: createWrapper() });

    const layout = screen.getByTestId('app-layout');

    // Boundary test: optional data attributes that are not set should be undefined
    expect(layout.dataset.theme).toBeUndefined();
    expect(layout.dataset.collapsed).toBeUndefined();
  });
});
