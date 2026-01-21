import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { useRefinementWizardStore } from '@/stores/refinement-wizard';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the store
vi.mock('@/stores/refinement-wizard', () => ({
  useRefinementWizardStore: vi.fn(),
}));

describe('QuickActions', () => {
  const mockOpenWizard = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      openWizard: mockOpenWizard,
    });
  });

  it('renders all quick action items', () => {
    render(<QuickActions />);

    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    expect(screen.getByText('Create New Atom')).toBeInTheDocument();
    expect(screen.getByText('Open Canvas')).toBeInTheDocument();
    expect(screen.getByText('Browse Atoms')).toBeInTheDocument();
  });

  it('renders descriptions for each action', () => {
    render(<QuickActions />);

    expect(screen.getByText('Start with natural language intent')).toBeInTheDocument();
    expect(screen.getByText('Visual atom organization')).toBeInTheDocument();
    expect(screen.getByText('Search and filter all atoms')).toBeInTheDocument();
  });

  it('renders Create New Atom as a button', () => {
    render(<QuickActions />);

    const createButton = screen.getByRole('button', { name: /create new atom/i });
    expect(createButton).toBeInTheDocument();
  });

  it('calls openWizard when Create New Atom is clicked', () => {
    render(<QuickActions />);

    const createButton = screen.getByRole('button', { name: /create new atom/i });
    fireEvent.click(createButton);

    expect(mockOpenWizard).toHaveBeenCalledTimes(1);
  });

  it('renders Open Canvas as a link to /canvas', () => {
    render(<QuickActions />);

    const canvasLink = screen.getByRole('link', { name: /open canvas/i });
    expect(canvasLink).toHaveAttribute('href', '/canvas');
  });

  it('renders Browse Atoms as a link to /atoms', () => {
    render(<QuickActions />);

    const browseLink = screen.getByRole('link', { name: /browse atoms/i });
    expect(browseLink).toHaveAttribute('href', '/atoms');
  });

  it('applies primary styling to Create New Atom button', () => {
    render(<QuickActions />);

    const createButton = screen.getByRole('button', { name: /create new atom/i });
    expect(createButton.className).toContain('bg-primary');
  });
});
