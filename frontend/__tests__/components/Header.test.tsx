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
    it('renders navigation links', () => {
      render(<Header />);
      // Verifies Dashboard link is present as the primary navigation entry point
      expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
      // Verifies Canvas link is present for accessing the intent canvas feature
      expect(screen.getByRole('link', { name: /canvas/i })).toBeInTheDocument();
      // Verifies Atoms link is present for accessing the atoms management view
      expect(screen.getByRole('link', { name: /atoms/i })).toBeInTheDocument();
    });

    // @atom IA-UI-006
    it('highlights the active navigation link', () => {
      render(<Header />);
      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      // Verifies the active route (pathname '/') applies the 'bg-accent' class to Dashboard link for visual feedback
      expect(dashboardLink).toHaveClass('bg-accent');
    });
  });

  describe('atom creation action', () => {
    // @atom IA-UI-006
    it('shows "New Atom" button when onCreateAtom is provided', () => {
      const mockOnCreateAtom = vi.fn();
      render(<Header onCreateAtom={mockOnCreateAtom} />);
      const newAtomButton = screen.getByRole('button', { name: /new atom/i });
      // Verifies the "New Atom" button is rendered when a creation handler is provided
      expect(newAtomButton).toBeInTheDocument();
    });

    // @atom IA-UI-006
    it('calls onCreateAtom when "New Atom" button is clicked', () => {
      const mockOnCreateAtom = vi.fn();
      render(<Header onCreateAtom={mockOnCreateAtom} />);
      const newAtomButton = screen.getByRole('button', { name: /new atom/i });
      fireEvent.click(newAtomButton);
      // Verifies the onCreateAtom callback is invoked exactly once when button is clicked
      expect(mockOnCreateAtom).toHaveBeenCalledTimes(1);
    });

    // @atom IA-UI-006
    it('does not render "New Atom" button when onCreateAtom is not provided', () => {
      render(<Header />);
      // Verifies the "New Atom" button is not rendered when no handler is provided (undefined prop)
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
      // Verifies navigation links don't exceed reasonable upper limit (prevents runaway rendering)
      expect(links.length).toBeLessThan(10);
    });

    // @atom IA-UI-006
    it('renders header with correct semantic structure', () => {
      render(<Header />);
      // Verifies header element exists for proper document structure and accessibility
      const header = screen.getByRole('banner');
      expect(header).toBeInTheDocument();
      // Verifies navigation landmark exists within header for screen reader accessibility
      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    // @atom IA-UI-006
    it('handles multiple rapid clicks on New Atom button', () => {
      const mockOnCreateAtom = vi.fn();
      render(<Header onCreateAtom={mockOnCreateAtom} />);
      const newAtomButton = screen.getByRole('button', { name: /new atom/i });
      // Simulate rapid clicking (boundary test for event handler stability)
      fireEvent.click(newAtomButton);
      fireEvent.click(newAtomButton);
      fireEvent.click(newAtomButton);
      // Verifies each click is registered (no debouncing or throttling by default)
      expect(mockOnCreateAtom).toHaveBeenCalledTimes(3);
    });
  });
});
