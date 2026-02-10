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

  // @atom IA-UI-005
  it('renders all quick action items', () => {
    render(<QuickActions />);

    // Verify the section header is displayed
    expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    // Verify the Create New Atom action is displayed
    expect(screen.getByText('Create New Atom')).toBeInTheDocument();
    // Verify the Browse Atoms action is displayed
    expect(screen.getByText('Browse Atoms')).toBeInTheDocument();
    // Verify the Start Reconciliation action is displayed
    expect(screen.getByText('Start Reconciliation')).toBeInTheDocument();
  });

  // @atom IA-UI-005
  it('renders descriptions for each action', () => {
    render(<QuickActions />);

    // Verify description for Create New Atom action
    expect(screen.getByText('Start with natural language intent')).toBeInTheDocument();
    // Verify description for Browse Atoms action
    expect(screen.getByText('Search and filter all atoms')).toBeInTheDocument();
    // Verify description for Start Reconciliation action
    expect(screen.getByText('Analyze repository for intent')).toBeInTheDocument();
  });

  // @atom IA-UI-005
  it('renders Create New Atom as a button', () => {
    render(<QuickActions />);

    const createButton = screen.getByRole('button', { name: /create new atom/i });
    // Verify Create New Atom is rendered as an accessible button element
    expect(createButton).toBeInTheDocument();
  });

  // @atom IA-UI-005
  it('calls openWizard when Create New Atom is clicked', () => {
    render(<QuickActions />);

    const createButton = screen.getByRole('button', { name: /create new atom/i });
    fireEvent.click(createButton);

    // Verify clicking the button triggers the wizard to open exactly once
    expect(mockOpenWizard).toHaveBeenCalledTimes(1);
  });

  // @atom IA-UI-005
  it('renders Browse Atoms as a link to /atoms', () => {
    render(<QuickActions />);

    const browseLink = screen.getByRole('link', { name: /browse atoms/i });
    // Verify the Browse Atoms link navigates to the correct route
    expect(browseLink).toHaveAttribute('href', '/atoms');
  });

  // @atom IA-UI-005
  it('renders Start Reconciliation as a link to /reconciliation', () => {
    render(<QuickActions />);

    const reconciliationLink = screen.getByRole('link', { name: /start reconciliation/i });
    // Verify the Reconciliation link navigates to the correct route
    expect(reconciliationLink).toHaveAttribute('href', '/reconciliation');
  });

  // @atom IA-UI-005
  it('applies primary styling to Create New Atom button', () => {
    render(<QuickActions />);

    const createButton = screen.getByRole('button', { name: /create new atom/i });
    // Verify the primary action button has the correct visual styling
    expect(createButton.className).toContain('bg-primary');
  });

  // Boundary Tests

  // @atom IA-UI-005
  it('does not call openWizard on double-click (only single invocation per click)', () => {
    render(<QuickActions />);

    const createButton = screen.getByRole('button', { name: /create new atom/i });

    // Double-click the button
    fireEvent.doubleClick(createButton);

    // Boundary assertion: Verify zero calls on double-click event
    // (double-click fires a dblclick event, not two click events)
    expect(mockOpenWizard.mock.calls.length).toBe(0);
  });

  // @atom IA-UI-005
  it('renders exactly three quick action items (no more, no less)', () => {
    render(<QuickActions />);

    // Get all action items by their container structure
    const actionButtons = screen.getAllByRole('button');
    const actionLinks = screen.getAllByRole('link');

    // Verify exactly 1 button action exists (Create New Atom)
    expect(actionButtons).toHaveLength(1);
    // Verify exactly 2 link actions exist (Browse Atoms, Start Reconciliation)
    expect(actionLinks).toHaveLength(2);
    // Boundary assertion: Verify total count is exactly 3 (not more, not less)
    const totalActions = actionButtons.length + actionLinks.length;
    expect(totalActions).toBeGreaterThan(2);
    expect(totalActions).toBeLessThan(4);
  });

  // @atom IA-UI-005
  it('maintains action order: Create New Atom first, Browse Atoms second, Start Reconciliation third', () => {
    render(<QuickActions />);

    // Get all interactive elements in document order
    const allActions = screen.getAllByRole('button').concat(screen.getAllByRole('link'));

    // Verify Create New Atom button appears first
    expect(allActions[0]).toHaveTextContent(/create new atom/i);
    // Verify Browse Atoms link appears second
    expect(allActions[1]).toHaveTextContent(/browse atoms/i);
    // Verify Start Reconciliation link appears third
    expect(allActions[2]).toHaveTextContent(/start reconciliation/i);
  });

  // @atom IA-UI-005
  it('does not call openWizard before user interaction', () => {
    render(<QuickActions />);

    // Boundary assertion: Verify wizard is not called on initial render (zero boundary)
    expect(mockOpenWizard.mock.calls.length).toBe(0);
  });

  // @atom IA-UI-005
  it('renders no orphan action items without proper labels', () => {
    render(<QuickActions />);

    // Query for any buttons or links without accessible names
    const allButtons = screen.getAllByRole('button');
    const allLinks = screen.getAllByRole('link');

    // Boundary assertion: All interactive elements must have accessible content
    // No null or empty text content allowed
    allButtons.forEach((button) => {
      expect(button.textContent).not.toBeNull();
      expect((button.textContent ?? '').length).toBeGreaterThan(0);
    });
    allLinks.forEach((link) => {
      expect(link.textContent).not.toBeNull();
      expect((link.textContent ?? '').length).toBeGreaterThan(0);
    });
  });
});
