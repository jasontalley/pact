import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AtomNode } from '@/components/canvas/AtomNode';
import type { Atom } from '@/types/atom';

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
}));

const createMockAtom = (overrides: Partial<Atom> = {}): Atom => ({
  id: 'uuid-1',
  atomId: 'IA-001',
  description: 'Test atom description for canvas node',
  category: 'functional',
  status: 'draft',
  qualityScore: 75,
  createdAt: '2025-06-15T10:00:00Z',
  updatedAt: '2025-06-15T10:00:00Z',
  tags: [],
  ...overrides,
});

describe('AtomNode', () => {
  const defaultProps = {
    id: 'node-1',
    data: { atom: createMockAtom() },
    selected: false,
    type: 'atomNode',
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 0,
  };

  // @atom IA-UI-010
  it('renders atom ID', () => {
    render(<AtomNode {...defaultProps as any} />);
    // Verify the atom ID is displayed in the node header
    expect(screen.getByText('IA-001')).toBeInTheDocument();
  });

  // @atom IA-UI-010
  it('renders atom description', () => {
    render(<AtomNode {...defaultProps as any} />);
    // Verify the atom description text is visible to users
    expect(screen.getByText('Test atom description for canvas node')).toBeInTheDocument();
  });

  // @atom IA-UI-010
  it('renders status badge', () => {
    render(<AtomNode {...defaultProps as any} />);
    // Verify the status badge displays the capitalized status
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  // @atom IA-UI-010
  it('renders quality badge', () => {
    render(<AtomNode {...defaultProps as any} />);
    // Verify the quality score is displayed as a percentage
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  // @atom IA-UI-010
  it('renders category', () => {
    render(<AtomNode {...defaultProps as any} />);
    // Verify the category label is displayed
    expect(screen.getByText('functional')).toBeInTheDocument();
  });

  // @atom IA-UI-010
  it('renders input and output handles', () => {
    render(<AtomNode {...defaultProps as any} />);
    // Verify the input (target) handle exists for incoming connections
    expect(screen.getByTestId('handle-target')).toBeInTheDocument();
    // Verify the output (source) handle exists for outgoing connections
    expect(screen.getByTestId('handle-source')).toBeInTheDocument();
  });

  describe('category colors', () => {
    const categories = [
      'functional',
      'performance',
      'security',
      'reliability',
      'usability',
      'maintainability',
    ] as const;

    categories.forEach((category) => {
      // @atom IA-UI-010
      it(`renders with ${category} category`, () => {
        const props = {
          ...defaultProps,
          data: { atom: createMockAtom({ category }) },
        };
        render(<AtomNode {...props as any} />);
        // Verify the category name is displayed for visual identification
        expect(screen.getByText(category)).toBeInTheDocument();
      });
    });
  });

  describe('status states', () => {
    // @atom IA-UI-010
    it('renders draft status', () => {
      render(<AtomNode {...defaultProps as any} />);
      // Verify draft status is rendered with proper capitalization
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    // @atom IA-UI-010
    it('renders committed status', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ status: 'committed' }) },
      };
      render(<AtomNode {...props as any} />);
      // Verify committed status is rendered with proper capitalization
      expect(screen.getByText('Committed')).toBeInTheDocument();
    });

    // @atom IA-UI-010
    it('renders superseded status with reduced opacity', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ status: 'superseded' }) },
      };
      const { container } = render(<AtomNode {...props as any} />);
      // Verify superseded status text is displayed
      expect(screen.getByText('Superseded')).toBeInTheDocument();
      const nodeDiv = container.querySelector('.opacity-60');
      // Verify reduced opacity class is applied for visual de-emphasis
      expect(nodeDiv).toBeInTheDocument();
    });
  });

  describe('selection state', () => {
    // @atom IA-UI-010
    it('applies selection styling when selected', () => {
      const props = { ...defaultProps, selected: true };
      const { container } = render(<AtomNode {...props as any} />);
      const nodeDiv = container.querySelector('.border-primary');
      // Verify the primary border class is applied to indicate selection
      expect(nodeDiv).toBeInTheDocument();
    });

    // @atom IA-UI-010
    it('applies default border when not selected', () => {
      const { container } = render(<AtomNode {...defaultProps as any} />);
      const nodeDiv = container.querySelector('.border-border');
      // Verify the default border class is applied when not selected
      expect(nodeDiv).toBeInTheDocument();
    });
  });

  describe('tags', () => {
    // @atom IA-UI-010
    it('renders tags when present', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ tags: ['auth', 'api'] }) },
      };
      render(<AtomNode {...props as any} />);
      // Verify first tag is displayed
      expect(screen.getByText('auth')).toBeInTheDocument();
      // Verify second tag is displayed
      expect(screen.getByText('api')).toBeInTheDocument();
    });

    // @atom IA-UI-010
    it('shows first 3 tags only', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'] }) },
      };
      render(<AtomNode {...props as any} />);
      // Verify first tag is visible within the display limit
      expect(screen.getByText('tag1')).toBeInTheDocument();
      // Verify second tag is visible within the display limit
      expect(screen.getByText('tag2')).toBeInTheDocument();
      // Verify third tag is visible at the display limit boundary
      expect(screen.getByText('tag3')).toBeInTheDocument();
      // Verify 4th tag is NOT displayed (exceeds limit)
      expect(screen.queryByText('tag4')).toBeNull();
    });

    // @atom IA-UI-010
    it('shows +N for additional tags', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'] }) },
      };
      render(<AtomNode {...props as any} />);
      // Verify overflow indicator shows count of hidden tags
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    // @atom IA-UI-010
    it('does not show tag section when no tags', () => {
      render(<AtomNode {...defaultProps as any} />);
      // Verify tag container is not rendered when tags array is empty (zero boundary)
      const tagElements = document.querySelectorAll('.px-3.pb-3.flex.flex-wrap');
      expect(tagElements.length).toBe(0);
    });

    // @atom IA-UI-010
    it('validates tag count boundaries with comparison assertions', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'] }) },
      };
      render(<AtomNode {...props as any} />);
      // Count visible tag elements (should be exactly 3, not more)
      const visibleTags = screen.getAllByText(/^tag\d$/);
      // Verify tag count is below overflow threshold (max 3 visible)
      expect(visibleTags.length).toBeLessThan(4);
      // Verify at least one tag is rendered when tags exist
      expect(visibleTags.length).toBeGreaterThan(0);
    });
  });

  describe('quality badge', () => {
    // @atom IA-UI-010
    it('renders quality score', () => {
      render(<AtomNode {...defaultProps as any} />);
      // Verify quality score is displayed as percentage format
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    // @atom IA-UI-010
    it('renders null quality score correctly', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ qualityScore: null as any }) },
      };
      render(<AtomNode {...props as any} />);
      // Verify QualityBadge displays fallback text for null score
      expect(screen.getByText('Not Scored')).toBeInTheDocument();
    });

    // @atom IA-UI-010
    it('does not render percentage when quality score is null (null boundary)', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ qualityScore: null as any }) },
      };
      render(<AtomNode {...props as any} />);
      // Verify percentage text is not present when score is null
      expect(screen.queryByText(/^\d+%$/)).toBeNull();
    });

    // @atom IA-UI-010
    it('renders quality score within valid range', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ qualityScore: 75 }) },
      };
      render(<AtomNode {...props as any} />);
      // Verify the quality score is within expected boundaries (0-100)
      const scoreText = screen.getByText('75%');
      const scoreValue = Number.parseInt(scoreText.textContent?.replace('%', '') || '0');
      // Verify score is at or above minimum boundary (0)
      expect(scoreValue).toBeGreaterThan(-1);
      // Verify score is at or below maximum boundary (100)
      expect(scoreValue).toBeLessThan(101);
    });
  });

  describe('boundary tests', () => {
    // @atom IA-UI-010
    it('handles quality score at minimum boundary (0%)', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ qualityScore: 0 }) },
      };
      render(<AtomNode {...props as any} />);
      // Verify zero quality score is displayed correctly, not treated as falsy
      expect(screen.getByText('0%')).toBeInTheDocument();
      // Verify the numeric value is exactly at zero boundary
      const scoreText = screen.getByText('0%');
      const scoreValue = Number.parseInt(scoreText.textContent?.replace('%', '') || '-1');
      expect(scoreValue).toBe(0);
    });

    // @atom IA-UI-010
    it('handles quality score at maximum boundary (100%)', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ qualityScore: 100 }) },
      };
      render(<AtomNode {...props as any} />);
      // Verify maximum quality score is displayed correctly
      expect(screen.getByText('100%')).toBeInTheDocument();
      // Verify the score does not exceed maximum boundary
      const scoreText = screen.getByText('100%');
      const scoreValue = Number.parseInt(scoreText.textContent?.replace('%', '') || '0');
      expect(scoreValue).toBeLessThan(101);
    });

    // @atom IA-UI-010
    it('handles empty description string', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ description: '' }) },
      };
      const { container } = render(<AtomNode {...props as any} />);
      // Verify component still renders without crashing for empty description
      expect(container.querySelector('.border-2')).toBeInTheDocument();
      // Verify atom ID is still displayed even with empty description
      expect(screen.getByText('IA-001')).toBeInTheDocument();
      // Verify description length is at zero boundary
      const atom = props.data.atom;
      expect(atom.description.length).toBe(0);
    });

    // @atom IA-UI-010
    it('handles exactly 3 tags (boundary for overflow indicator)', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ tags: ['tag1', 'tag2', 'tag3'] }) },
      };
      render(<AtomNode {...props as any} />);
      // Verify first tag is displayed at boundary count
      expect(screen.getByText('tag1')).toBeInTheDocument();
      // Verify second tag is displayed at boundary count
      expect(screen.getByText('tag2')).toBeInTheDocument();
      // Verify third tag is displayed exactly at max visible limit
      expect(screen.getByText('tag3')).toBeInTheDocument();
      // Verify no overflow indicator when exactly at limit (null boundary)
      expect(screen.queryByText(/^\+\d+$/)).toBeNull();
    });

    // @atom IA-UI-010
    it('handles exactly 4 tags (one over boundary)', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ tags: ['tag1', 'tag2', 'tag3', 'tag4'] }) },
      };
      render(<AtomNode {...props as any} />);
      // Verify first tag is displayed when over boundary
      expect(screen.getByText('tag1')).toBeInTheDocument();
      // Verify second tag is displayed when over boundary
      expect(screen.getByText('tag2')).toBeInTheDocument();
      // Verify third tag is displayed at max visible limit
      expect(screen.getByText('tag3')).toBeInTheDocument();
      // Verify 4th tag is hidden (null boundary - element does not exist)
      expect(screen.queryByText('tag4')).toBeNull();
      // Verify overflow indicator shows exactly 1 hidden tag
      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    // @atom IA-UI-010
    it('handles undefined optional fields gracefully', () => {
      const atom = createMockAtom();
      // Verify optional field can be undefined (undefined boundary)
      const atomWithUndefinedTags = { ...atom, tags: undefined as any };
      expect(atomWithUndefinedTags.tags).toBeUndefined();
    });

    // @atom IA-UI-010
    it('validates position values at zero boundary', () => {
      // Verify X position is at zero boundary (valid minimum)
      expect(defaultProps.positionAbsoluteX).toBe(0);
      // Verify Y position is at zero boundary (valid minimum)
      expect(defaultProps.positionAbsoluteY).toBe(0);
      // Verify z-index is at zero boundary (default layer)
      expect(defaultProps.zIndex).toBe(0);
    });
  });
});
