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

  it('renders atom ID', () => {
    render(<AtomNode {...defaultProps as any} />);
    expect(screen.getByText('IA-001')).toBeInTheDocument();
  });

  it('renders atom description', () => {
    render(<AtomNode {...defaultProps as any} />);
    expect(screen.getByText('Test atom description for canvas node')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<AtomNode {...defaultProps as any} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders quality badge', () => {
    render(<AtomNode {...defaultProps as any} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders category', () => {
    render(<AtomNode {...defaultProps as any} />);
    expect(screen.getByText('functional')).toBeInTheDocument();
  });

  it('renders input and output handles', () => {
    render(<AtomNode {...defaultProps as any} />);
    expect(screen.getByTestId('handle-target')).toBeInTheDocument();
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
      it(`renders with ${category} category`, () => {
        const props = {
          ...defaultProps,
          data: { atom: createMockAtom({ category }) },
        };
        render(<AtomNode {...props as any} />);
        expect(screen.getByText(category)).toBeInTheDocument();
      });
    });
  });

  describe('status states', () => {
    it('renders draft status', () => {
      render(<AtomNode {...defaultProps as any} />);
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('renders committed status', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ status: 'committed' }) },
      };
      render(<AtomNode {...props as any} />);
      expect(screen.getByText('Committed')).toBeInTheDocument();
    });

    it('renders superseded status with reduced opacity', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ status: 'superseded' }) },
      };
      const { container } = render(<AtomNode {...props as any} />);
      expect(screen.getByText('Superseded')).toBeInTheDocument();
      // Check for opacity class
      const nodeDiv = container.querySelector('.opacity-60');
      expect(nodeDiv).toBeInTheDocument();
    });
  });

  describe('selection state', () => {
    it('applies selection styling when selected', () => {
      const props = { ...defaultProps, selected: true };
      const { container } = render(<AtomNode {...props as any} />);
      const nodeDiv = container.querySelector('.border-primary');
      expect(nodeDiv).toBeInTheDocument();
    });

    it('applies default border when not selected', () => {
      const { container } = render(<AtomNode {...defaultProps as any} />);
      const nodeDiv = container.querySelector('.border-border');
      expect(nodeDiv).toBeInTheDocument();
    });
  });

  describe('tags', () => {
    it('renders tags when present', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ tags: ['auth', 'api'] }) },
      };
      render(<AtomNode {...props as any} />);
      expect(screen.getByText('auth')).toBeInTheDocument();
      expect(screen.getByText('api')).toBeInTheDocument();
    });

    it('shows first 3 tags only', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'] }) },
      };
      render(<AtomNode {...props as any} />);
      expect(screen.getByText('tag1')).toBeInTheDocument();
      expect(screen.getByText('tag2')).toBeInTheDocument();
      expect(screen.getByText('tag3')).toBeInTheDocument();
      expect(screen.queryByText('tag4')).not.toBeInTheDocument();
    });

    it('shows +N for additional tags', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'] }) },
      };
      render(<AtomNode {...props as any} />);
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('does not show tag section when no tags', () => {
      render(<AtomNode {...defaultProps as any} />);
      // The default mock atom has no tags
      const tagElements = document.querySelectorAll('.px-3.pb-3.flex.flex-wrap');
      expect(tagElements.length).toBe(0);
    });
  });

  describe('quality badge', () => {
    it('renders quality score', () => {
      render(<AtomNode {...defaultProps as any} />);
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('renders null quality score correctly', () => {
      const props = {
        ...defaultProps,
        data: { atom: createMockAtom({ qualityScore: null as any }) },
      };
      render(<AtomNode {...props as any} />);
      // QualityBadge shows "Not Scored" for null
      expect(screen.getByText('Not Scored')).toBeInTheDocument();
    });
  });
});
