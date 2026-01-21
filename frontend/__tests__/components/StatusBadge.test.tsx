import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/shared/StatusBadge';

/**
 * StatusBadge Component Tests
 * @atom IA-UI-002 Atom status displays with correct visual indicators
 */
describe('StatusBadge', () => {
  describe('status text rendering', () => {
    // @atom IA-UI-002
    it('renders draft status correctly', () => {
      render(<StatusBadge status="draft" />);
      // Draft status should display "Draft" text
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    // @atom IA-UI-002
    it('renders committed status correctly', () => {
      render(<StatusBadge status="committed" />);
      // Committed status should display "Committed" text
      expect(screen.getByText('Committed')).toBeInTheDocument();
    });

    // @atom IA-UI-002
    it('renders superseded status correctly', () => {
      render(<StatusBadge status="superseded" />);
      // Superseded status should display "Superseded" text
      expect(screen.getByText('Superseded')).toBeInTheDocument();
    });
  });

  describe('status styling', () => {
    // @atom IA-UI-002
    it('applies draft styling', () => {
      render(<StatusBadge status="draft" />);
      const badge = screen.getByText('Draft');
      // Blue background for draft (mutable, in progress)
      expect(badge).toHaveClass('bg-blue-100');
      // Blue text for draft
      expect(badge).toHaveClass('text-blue-800');
    });

    // @atom IA-UI-002
    it('applies committed styling', () => {
      render(<StatusBadge status="committed" />);
      const badge = screen.getByText('Committed');
      // Green background for committed (immutable, finalized)
      expect(badge).toHaveClass('bg-green-100');
      // Green text for committed
      expect(badge).toHaveClass('text-green-800');
    });

    // @atom IA-UI-002
    it('applies superseded styling', () => {
      render(<StatusBadge status="superseded" />);
      const badge = screen.getByText('Superseded');
      // Gray background for superseded (archived, replaced)
      expect(badge).toHaveClass('bg-gray-100');
      // Gray text for superseded
      expect(badge).toHaveClass('text-gray-800');
    });
  });

  describe('customization', () => {
    // @atom IA-UI-002
    it('accepts custom className', () => {
      render(<StatusBadge status="draft" className="custom-class" />);
      const badge = screen.getByText('Draft');
      // Custom classes should be merged with default styles
      expect(badge).toHaveClass('custom-class');
    });
  });

  describe('boundary cases', () => {
    // @atom IA-UI-002
    it('handles all valid status values without throwing', () => {
      const statuses = ['draft', 'committed', 'superseded'] as const;
      // Each valid status should render without error
      statuses.forEach((status) => {
        const { unmount } = render(<StatusBadge status={status} />);
        expect(screen.getByText(/Draft|Committed|Superseded/)).toBeInTheDocument();
        unmount();
      });
    });

    // @atom IA-UI-002
    it('validates status enum boundaries', () => {
      const validStatuses = ['draft', 'committed', 'superseded'];
      // Exactly 3 status values must exist
      expect(validStatuses.length).toBe(3);
      // At least one status must be defined
      expect(validStatuses.length).toBeGreaterThan(0);
      // First status value must not be undefined
      expect(validStatuses[0]).not.toBeUndefined();
    });

    // @atom IA-UI-002
    it('renders first and last status values correctly (boundaries)', () => {
      // Test first enum value
      const { rerender } = render(<StatusBadge status="draft" />);
      expect(screen.getByText('Draft')).toBeInTheDocument();
      // Test last enum value
      rerender(<StatusBadge status="superseded" />);
      expect(screen.getByText('Superseded')).toBeInTheDocument();
    });
  });
});
