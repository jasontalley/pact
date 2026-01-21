import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useLayoutStore } from '@/stores/layout';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/atoms',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the stores
vi.mock('@/stores/layout', () => ({
  useLayoutStore: vi.fn(),
}));

vi.mock('@/stores/refinement-wizard', () => ({
  useRefinementWizardStore: vi.fn(() => ({
    isOpen: false,
    openWizard: vi.fn(),
  })),
}));

// Mock components to simplify testing
vi.mock('@/components/layout/Header', () => ({
  Header: ({ onCreateAtom }: { onCreateAtom: () => void }) => (
    <header data-testid="header">
      <button onClick={onCreateAtom}>Create Atom</button>
    </header>
  ),
}));

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <aside data-testid="sidebar">
        <button onClick={onClose}>Close Sidebar</button>
      </aside>
    ) : null,
}));

vi.mock('@/components/atoms/CreateAtomDialog', () => ({
  CreateAtomDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) =>
    open ? (
      <div data-testid="create-dialog">
        <button onClick={() => onOpenChange(false)}>Close Dialog</button>
      </div>
    ) : null,
}));

// Mock useTags
vi.mock('@/hooks/atoms/use-atoms', () => ({
  useTags: vi.fn(() => ({
    data: { tags: [] },
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

describe('AppLayout', () => {
  const mockToggleSidebar = vi.fn();
  const mockSetSidebarOpen = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useLayoutStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      sidebarOpen: true,
      toggleSidebar: mockToggleSidebar,
      setSidebarOpen: mockSetSidebarOpen,
    });
  });

  it('renders children content', () => {
    render(
      <AppLayout>
        <div data-testid="child-content">Test Content</div>
      </AppLayout>,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders header', () => {
    render(
      <AppLayout>
        <div>Content</div>
      </AppLayout>,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('renders sidebar when showSidebar is true (default)', () => {
    render(
      <AppLayout>
        <div>Content</div>
      </AppLayout>,
      { wrapper: createWrapper() }
    );

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });

  it('does not render sidebar when showSidebar is false', () => {
    render(
      <AppLayout showSidebar={false}>
        <div>Content</div>
      </AppLayout>,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
  });

  it('hides sidebar when sidebarOpen is false', () => {
    (useLayoutStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      sidebarOpen: false,
      toggleSidebar: mockToggleSidebar,
      setSidebarOpen: mockSetSidebarOpen,
    });

    render(
      <AppLayout>
        <div>Content</div>
      </AppLayout>,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
  });

  it('opens create dialog when header create button is clicked', () => {
    render(
      <AppLayout>
        <div>Content</div>
      </AppLayout>,
      { wrapper: createWrapper() }
    );

    // Initially no dialog
    expect(screen.queryByTestId('create-dialog')).not.toBeInTheDocument();

    // Click create button in header
    fireEvent.click(screen.getByText('Create Atom'));

    // Dialog should appear
    expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
  });

  it('closes create dialog when dialog close is triggered', () => {
    render(
      <AppLayout>
        <div>Content</div>
      </AppLayout>,
      { wrapper: createWrapper() }
    );

    // Open dialog
    fireEvent.click(screen.getByText('Create Atom'));
    expect(screen.getByTestId('create-dialog')).toBeInTheDocument();

    // Close dialog
    fireEvent.click(screen.getByText('Close Dialog'));
    expect(screen.queryByTestId('create-dialog')).not.toBeInTheDocument();
  });

  it('applies fullHeight class when fullHeight prop is true', () => {
    const { container } = render(
      <AppLayout fullHeight>
        <div>Content</div>
      </AppLayout>,
      { wrapper: createWrapper() }
    );

    const layoutDiv = container.firstChild as HTMLElement;
    expect(layoutDiv.className).toContain('h-screen');
  });

  it('does not apply fullHeight h-screen class by default', () => {
    const { container } = render(
      <AppLayout>
        <div>Content</div>
      </AppLayout>,
      { wrapper: createWrapper() }
    );

    const layoutDiv = container.firstChild as HTMLElement;
    // Should have min-h-screen but not the standalone h-screen class
    const classes = layoutDiv.className.split(' ');
    expect(classes).toContain('min-h-screen');
    expect(classes).not.toContain('h-screen');
  });
});
