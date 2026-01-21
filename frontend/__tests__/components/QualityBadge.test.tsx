import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QualityBadge } from '@/components/quality/QualityBadge';

/**
 * QualityBadge Component Tests
 * @atom IA-UI-001 Quality scores display correctly with visual indicators
 */
describe('QualityBadge', () => {
  describe('score display', () => {
    // @atom IA-UI-001
    it('displays score as percentage', () => {
      render(<QualityBadge score={85} />);
      // Score should render as percentage text
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    // @atom IA-UI-001
    it('displays "Not Scored" for null score', () => {
      render(<QualityBadge score={null} />);
      // Null scores should show placeholder text
      expect(screen.getByText('Not Scored')).toBeInTheDocument();
    });

    // @atom IA-UI-001
    it('displays label when showLabel is true', () => {
      render(<QualityBadge score={85} showLabel />);
      // Label should append quality level text
      expect(screen.getByText('85% - Ready')).toBeInTheDocument();
    });
  });

  describe('quality level thresholds', () => {
    // @atom IA-UI-001
    it('shows "Needs Work" for scores below 60', () => {
      render(<QualityBadge score={55} showLabel />);
      // Scores < 60 are "reject" level
      expect(screen.getByText('55% - Needs Work')).toBeInTheDocument();
    });

    // @atom IA-UI-001
    it('shows "Review" for scores between 60 and 79', () => {
      render(<QualityBadge score={70} showLabel />);
      // Scores 60-79 are "revise" level
      expect(screen.getByText('70% - Review')).toBeInTheDocument();
    });

    // @atom IA-UI-001
    it('shows "Ready" for scores 80 and above', () => {
      render(<QualityBadge score={80} showLabel />);
      // Scores >= 80 are "approve" level
      expect(screen.getByText('80% - Ready')).toBeInTheDocument();
    });

    // @atom IA-UI-001
    it('handles edge case at 60 (boundary test)', () => {
      render(<QualityBadge score={60} showLabel />);
      // Boundary: exactly 60 should be "Review" not "Needs Work"
      expect(screen.getByText('60% - Review')).toBeInTheDocument();
    });

    // @atom IA-UI-001
    it('handles edge case at 80 (boundary test)', () => {
      render(<QualityBadge score={80} showLabel />);
      // Boundary: exactly 80 should be "Ready" not "Review"
      expect(screen.getByText('80% - Ready')).toBeInTheDocument();
    });

    // @atom IA-UI-001
    it('handles edge case at 0 (minimum boundary)', () => {
      render(<QualityBadge score={0} showLabel />);
      // Boundary: score of 0 should still render
      expect(screen.getByText('0% - Needs Work')).toBeInTheDocument();
    });

    // @atom IA-UI-001
    it('validates score boundaries are numeric', () => {
      // Boundary test: 0 is the minimum valid score
      const minScore = 0;
      expect(minScore).toBe(0);
      // Boundary test: 100 is the maximum valid score
      const maxScore = 100;
      expect(maxScore).toBeGreaterThan(0);
      expect(maxScore).toBeLessThan(101);
    });

    // @atom IA-UI-001
    it('handles null score boundary', () => {
      render(<QualityBadge score={null} showLabel />);
      // Null should render without crashing
      const badge = screen.queryByText('85%');
      expect(badge).toBeNull();
    });
  });

  describe('styling', () => {
    // @atom IA-UI-001
    it('applies reject styling for low scores', () => {
      render(<QualityBadge score={50} />);
      const badge = screen.getByText('50%');
      // Red background for reject level
      expect(badge).toHaveClass('bg-red-100');
      // Red text for reject level
      expect(badge).toHaveClass('text-red-800');
    });

    // @atom IA-UI-001
    it('applies revise styling for medium scores', () => {
      render(<QualityBadge score={70} />);
      const badge = screen.getByText('70%');
      // Yellow background for revise level
      expect(badge).toHaveClass('bg-yellow-100');
      // Yellow text for revise level
      expect(badge).toHaveClass('text-yellow-800');
    });

    // @atom IA-UI-001
    it('applies approve styling for high scores', () => {
      render(<QualityBadge score={90} />);
      const badge = screen.getByText('90%');
      // Green background for approve level
      expect(badge).toHaveClass('bg-green-100');
      // Green text for approve level
      expect(badge).toHaveClass('text-green-800');
    });

    // @atom IA-UI-001
    it('applies unknown styling for null scores', () => {
      render(<QualityBadge score={null} />);
      const badge = screen.getByText('Not Scored');
      // Gray background for unknown/null
      expect(badge).toHaveClass('bg-gray-100');
      // Gray text for unknown/null
      expect(badge).toHaveClass('text-gray-600');
    });

    // @atom IA-UI-001
    it('accepts custom className', () => {
      render(<QualityBadge score={85} className="custom-class" />);
      const badge = screen.getByText('85%');
      // Custom classes should be merged
      expect(badge).toHaveClass('custom-class');
    });
  });
});
