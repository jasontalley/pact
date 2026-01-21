import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '@/components/layout/Header';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

/**
 * Header Component Tests
 * @atom IA-UI-003 Navigation header provides consistent access to main views
 */
describe('Header', () => {
  describe('branding', () => {
    // @atom IA-UI-003
    it('renders the Pact logo', () => {
      render(<Header />);
      // Logo should always be visible for brand recognition
      expect(screen.getByText('Pact')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    // @atom IA-UI-003
    it('renders navigation links', () => {
      render(<Header />);
      // Dashboard link must be present
      expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
      // Canvas link must be present
      expect(screen.getByRole('link', { name: /canvas/i })).toBeInTheDocument();
      // Atoms link must be present
      expect(screen.getByRole('link', { name: /atoms/i })).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('highlights the active navigation link', () => {
      render(<Header />);
      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      // When pathname is '/', Dashboard should be visually active
      expect(dashboardLink).toHaveClass('bg-accent');
    });
  });

  describe('atom creation action', () => {
    // @atom IA-UI-003
    it('shows "New Atom" button when onCreateAtom is provided', () => {
      const mockOnCreateAtom = vi.fn();
      render(<Header onCreateAtom={mockOnCreateAtom} />);
      // Button should be visible when handler is provided
      const newAtomButton = screen.getByRole('button', { name: /new atom/i });
      expect(newAtomButton).toBeInTheDocument();
    });

    // @atom IA-UI-003
    it('calls onCreateAtom when "New Atom" button is clicked', () => {
      const mockOnCreateAtom = vi.fn();
      render(<Header onCreateAtom={mockOnCreateAtom} />);
      const newAtomButton = screen.getByRole('button', { name: /new atom/i });
      // Click should trigger the callback
      fireEvent.click(newAtomButton);
      expect(mockOnCreateAtom).toHaveBeenCalledTimes(1);
    });

    // @atom IA-UI-003
    it('does not render "New Atom" button when onCreateAtom is not provided', () => {
      render(<Header />);
      // Button should be hidden when no handler (null prop case)
      expect(screen.queryByRole('button', { name: /new atom/i })).toBeNull();
    });
  });

  describe('boundary cases', () => {
    // @atom IA-UI-003
    it('renders expected number of navigation links', () => {
      render(<Header />);
      const links = screen.getAllByRole('link');
      // At least one navigation link must exist
      expect(links.length).toBeGreaterThan(0);
      // Not too many links (reasonable upper bound)
      expect(links.length).toBeLessThan(10);
    });
  });
});
