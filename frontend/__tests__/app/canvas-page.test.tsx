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
  it('renders AppLayout with correct props', () => {
    render(<CanvasPage />, { wrapper: createWrapper() });

    const layout = screen.getByTestId('app-layout');
    expect(layout).toBeInTheDocument();
    expect(layout).toHaveAttribute('data-show-sidebar', 'false');
    expect(layout).toHaveAttribute('data-full-height', 'true');
  });

  it('renders CanvasClient', () => {
    render(<CanvasPage />, { wrapper: createWrapper() });

    expect(screen.getByTestId('canvas-client')).toBeInTheDocument();
  });
});
