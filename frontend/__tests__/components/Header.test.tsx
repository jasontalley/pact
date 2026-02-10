import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '@/components/layout/Header';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

/**
 * Header Component Tests
 * @atom IA-UI-006 Navigation header provides consistent access to main views
 *
 * Note: The Header component has both desktop and mobile navigation:
 * - Desktop: Navigation links visible directly in header
 * - Mobile: Navigation links in a hamburger menu drawer
 * These tests focus on the presence of navigation elements and behavior,
 * not responsive visibility (which is CSS-based).
 */
describe('Header', () => {
  describe('branding', () => {
    // @atom IA-UI-006
    it('renders the Pact logo', () => {
      render(<Header />);
      // Verifies the brand logo text "Pact" is rendered in the header for consistent branding
      expect(screen.getByText('Pact')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    // @atom IA-UI-006
    it('renders navigation links for each view', () => {
      render(<Header />);
      // Desktop and mobile navs both have Dashboard links (getAllByRole to handle both)
      const dashboardLinks = screen.getAllByRole('link', { name: /dashboard/i });
      // Verifies at least one Dashboard navigation link exists for user access to dashboard view
      expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);

      // Atoms links for accessing the atoms management list
      const atomsLinks = screen.getAllByRole('link', { name: /atoms/i });
      // Verifies at least one Atoms navigation link exists for user access to atoms list view
      expect(atomsLinks.length).toBeGreaterThanOrEqual(1);
    });

    // @atom IA-UI-006
    it('highlights the active navigation link', () => {
      render(<Header />);
      // Get all Dashboard links (desktop and mobile) - at least one should be active
      const dashboardLinks = screen.getAllByRole('link', { name: /dashboard/i });
      // At least one Dashboard link should have the active class
      const hasActiveLink = dashboardLinks.some((link) =>
        link.classList.contains('bg-accent')
      );
      // Verifies the active route applies visual highlighting for user orientation
      expect(hasActiveLink).toBe(true);
    });
  });

  describe('mobile hamburger menu', () => {
    // @atom IA-UI-006
    it('renders hamburger menu button for mobile', () => {
      render(<Header />);
      // Hamburger button should be present (hidden via CSS on desktop)
      const menuButton = screen.getByRole('button', { name: /open menu/i });
      // Verifies hamburger menu button exists for mobile navigation access
      expect(menuButton).toBeInTheDocument();
    });

    // @atom IA-UI-006
    it('toggles mobile menu when hamburger button is clicked', () => {
      render(<Header />);
      const menuButton = screen.getByRole('button', { name: /open menu/i });

      // Click to open - hamburger button should change to X (close menu)
      fireEvent.click(menuButton);
      // There are two close buttons: the X button and the overlay - verify at least one exists
      const closeButtons = screen.getAllByRole('button', { name: /close menu/i });
      // Verifies menu opens and close button(s) appear when hamburger is clicked
      expect(closeButtons.length).toBeGreaterThanOrEqual(1);

      // Click the X button (first close button) to close menu
      fireEvent.click(closeButtons[0]);
      // Verifies menu closes and hamburger button reappears when close is clicked
      expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
    });
  });

  describe('atom creation action', () => {
    // @atom IA-UI-006
    it('shows "New Atom" buttons when onCreateAtom is provided', () => {
      const mockOnCreateAtom = vi.fn();
      render(<Header onCreateAtom={mockOnCreateAtom} />);
      // Desktop and mobile both have New Atom buttons
      const newAtomButtons = screen.getAllByRole('button', { name: /new atom/i });
      // Verifies New Atom button(s) are rendered when creation handler is provided
      expect(newAtomButtons.length).toBeGreaterThanOrEqual(1);
    });

    // @atom IA-UI-006
    it('calls onCreateAtom when desktop "New Atom" button is clicked', () => {
      const mockOnCreateAtom = vi.fn();
      render(<Header onCreateAtom={mockOnCreateAtom} />);
      // Get all New Atom buttons and click the first one (desktop)
      const newAtomButtons = screen.getAllByRole('button', { name: /new atom/i });
      fireEvent.click(newAtomButtons[0]);
      // Verifies onCreateAtom callback is invoked when desktop button is clicked
      expect(mockOnCreateAtom).toHaveBeenCalledTimes(1);
    });

    // @atom IA-UI-006
    it('calls onCreateAtom when mobile "New Atom" button is clicked', () => {
      const mockOnCreateAtom = vi.fn();
      render(<Header onCreateAtom={mockOnCreateAtom} />);

      // Open mobile menu first
      fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

      // Get all New Atom buttons and click the last one (mobile, in drawer)
      const newAtomButtons = screen.getAllByRole('button', { name: /new atom/i });
      fireEvent.click(newAtomButtons.at(-1)!);
      // Verifies onCreateAtom callback is invoked when mobile drawer button is clicked
      expect(mockOnCreateAtom).toHaveBeenCalledTimes(1);
    });

    // @atom IA-UI-006
    it('does not render "New Atom" buttons when onCreateAtom is not provided', () => {
      render(<Header />);
      // Verifies no New Atom buttons are rendered when no handler is provided
      expect(screen.queryByRole('button', { name: /new atom/i })).toBeNull();
    });
  });

  describe('boundary cases', () => {
    // @atom IA-UI-006
    it('renders expected number of navigation links', () => {
      render(<Header />);
      const links = screen.getAllByRole('link');
      // Verifies at least one navigation link exists (minimum bound - empty navigation is invalid)
      expect(links.length).toBeGreaterThan(0);
      // With desktop + mobile navs, we have Pact logo + 3 desktop links + 3 mobile links = 7
      // Upper limit prevents runaway rendering
      expect(links.length).toBeLessThan(15);
    });

    // @atom IA-UI-006
    it('renders header with correct semantic structure', () => {
      render(<Header />);
      // Verifies header element exists for proper document structure and accessibility
      const header = screen.getByRole('banner');
      expect(header).toBeInTheDocument();
      // Verifies navigation landmark(s) exist within header for screen reader accessibility
      // Now we have both desktop and mobile navigation
      const navs = screen.getAllByRole('navigation');
      // Verifies at least one navigation element exists for proper semantic structure
      expect(navs.length).toBeGreaterThanOrEqual(1);
    });

    // @atom IA-UI-006
    it('handles multiple rapid clicks on New Atom button', () => {
      const mockOnCreateAtom = vi.fn();
      render(<Header onCreateAtom={mockOnCreateAtom} />);
      const newAtomButtons = screen.getAllByRole('button', { name: /new atom/i });
      // Simulate rapid clicking on the first button (desktop)
      fireEvent.click(newAtomButtons[0]);
      fireEvent.click(newAtomButtons[0]);
      fireEvent.click(newAtomButtons[0]);
      // Verifies each click is registered (no debouncing or throttling by default)
      expect(mockOnCreateAtom).toHaveBeenCalledTimes(3);
    });

    // @atom IA-UI-006
    it('closes mobile menu and calls onCreateAtom when clicking New Atom in drawer', () => {
      const mockOnCreateAtom = vi.fn();
      render(<Header onCreateAtom={mockOnCreateAtom} />);

      // Open mobile menu
      fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
      // Verify menu is open (close buttons exist)
      const closeButtons = screen.getAllByRole('button', { name: /close menu/i });
      // Verifies mobile menu opened successfully by checking for close buttons
      expect(closeButtons.length).toBeGreaterThanOrEqual(1);

      // Click New Atom in the mobile drawer (last button)
      const newAtomButtons = screen.getAllByRole('button', { name: /new atom/i });
      fireEvent.click(newAtomButtons.at(-1)!);

      // Verifies onCreateAtom handler is called when clicking New Atom in drawer
      expect(mockOnCreateAtom).toHaveBeenCalledTimes(1);

      // Verifies menu auto-closes after New Atom action (hamburger icon visible again)
      expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
    });
  });
});
