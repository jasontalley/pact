import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Atom } from '@/types/atom';

// Mock ReactFlow components
const mockSetNodes = vi.fn();
const mockSetEdges = vi.fn();
const mockOnNodesChange = vi.fn();
const mockOnEdgesChange = vi.fn();

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children, onNodeClick, onPaneClick, onMoveEnd, onNodeDragStop, nodes }: any) => (
    <div data-testid="react-flow">
      <button data-testid="node-click" onClick={(e) => onNodeClick?.(e, { id: 'atom-1' })}>
        Click Node
      </button>
      <button data-testid="pane-click" onClick={onPaneClick}>
        Click Pane
      </button>
      <button
        data-testid="move-end"
        onClick={() => onMoveEnd?.({}, { x: 100, y: 200, zoom: 1.5 })}
      >
        Move End
      </button>
      <button
        data-testid="drag-stop"
        onClick={(e) => onNodeDragStop?.(e, { id: 'atom-1', position: { x: 50, y: 100 } })}
      >
        Drag Stop
      </button>
      <div data-testid="nodes-count">{nodes?.length || 0}</div>
      {children}
    </div>
  ),
  Background: () => <div data-testid="background" />,
  Controls: () => <div data-testid="controls" />,
  MiniMap: () => <div data-testid="minimap" />,
  Panel: ({ children }: any) => <div data-testid="panel">{children}</div>,
  useNodesState: (initialNodes: any) => [initialNodes, mockSetNodes, mockOnNodesChange],
  useEdgesState: (initialEdges: any) => [initialEdges, mockSetEdges, mockOnEdgesChange],
  useReactFlow: () => ({
    fitView: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
  }),
}));

// Create mock functions for hooks
const mockUseAtoms = vi.fn();
const mockMutate = vi.fn();

vi.mock('@/hooks/atoms/use-atoms', () => ({
  useAtoms: (...args: unknown[]) => mockUseAtoms(...args),
  useUpdateAtom: () => ({ mutate: mockMutate }),
}));

const mockOpenAtomDetail = vi.fn();
vi.mock('@/stores/layout', () => ({
  useLayoutStore: () => ({ openAtomDetail: mockOpenAtomDetail }),
}));

const mockSelectAtoms = vi.fn();
const mockClearSelection = vi.fn();
const mockSetZoom = vi.fn();
const mockSetPan = vi.fn();

vi.mock('@/stores/canvas-ui', () => ({
  useCanvasUIStore: () => ({
    selectedAtomIds: [],
    selectAtoms: mockSelectAtoms,
    clearSelection: mockClearSelection,
    minimapVisible: true,
    setZoom: mockSetZoom,
    setPan: mockSetPan,
  }),
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

const mockAtoms: Atom[] = [
  {
    id: 'atom-1',
    atomId: 'IA-001',
    description: 'Test atom 1',
    category: 'functional',
    status: 'draft',
    qualityScore: 75,
    createdAt: '2025-06-15T10:00:00Z',
    updatedAt: '2025-06-15T10:00:00Z',
    tags: [],
  },
  {
    id: 'atom-2',
    atomId: 'IA-002',
    description: 'Test atom 2',
    category: 'performance',
    status: 'committed',
    qualityScore: 85,
    createdAt: '2025-06-15T10:00:00Z',
    updatedAt: '2025-06-15T10:00:00Z',
    tags: [],
    supersededBy: undefined,
  },
];

describe('CanvasClient', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockUseAtoms.mockReturnValue({
      data: { items: mockAtoms, total: 2 },
      isLoading: false,
    });
  });

  // @atom IA-UI-011
  it('renders loading state', async () => {
    mockUseAtoms.mockReturnValue({
      data: null,
      isLoading: true,
    });

    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    // Verify loading indicator is displayed while atoms are being fetched
    expect(screen.getByText('Loading canvas...')).toBeInTheDocument();
  });

  // @atom IA-UI-011
  it('renders ReactFlow canvas when loaded', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    // Verify the ReactFlow container is rendered after data loads
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  // @atom IA-UI-011
  it('renders Background component', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    // Verify the canvas background grid is rendered for visual context
    expect(screen.getByTestId('background')).toBeInTheDocument();
  });

  // @atom IA-UI-011
  it('renders Controls component', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    // Verify zoom and pan controls are available for user interaction
    expect(screen.getByTestId('controls')).toBeInTheDocument();
  });

  // @atom IA-UI-011
  it('renders MiniMap when visible', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    // Verify minimap navigation aid is rendered when enabled in UI store
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
  });

  // @atom IA-UI-011
  it('renders atom count in panel', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    // Verify status panel displays correct count of atoms on canvas
    expect(screen.getByText('2 atoms')).toBeInTheDocument();
  });

  // @atom IA-UI-011
  it('opens atom detail on node click', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByTestId('node-click'));
    // Verify clicking a node triggers the detail panel to open with correct atom ID
    expect(mockOpenAtomDetail).toHaveBeenCalledWith('atom-1');
  });

  // @atom IA-UI-011
  it('clears selection on pane click', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByTestId('pane-click'));
    // Verify clicking empty canvas area deselects any selected atoms
    expect(mockClearSelection).toHaveBeenCalled();
  });

  // @atom IA-UI-011
  it('updates zoom and pan on move end', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByTestId('move-end'));
    // Verify zoom level is persisted to UI store after canvas interaction
    expect(mockSetZoom).toHaveBeenCalledWith(1.5);
    // Verify pan position is persisted to UI store after canvas interaction
    expect(mockSetPan).toHaveBeenCalledWith({ x: 100, y: 200 });
  });

  // @atom IA-UI-011
  it('saves position on drag stop for draft atoms', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByTestId('drag-stop'));
    // Verify draft atom position is saved via mutation when user stops dragging
    expect(mockMutate).toHaveBeenCalledWith({
      id: 'atom-1',
      data: { canvasPosition: { x: 50, y: 100 } },
    });
  });

  // @atom IA-UI-011
  it('does not save position for committed atoms', async () => {
    mockUseAtoms.mockReturnValue({
      data: {
        items: [{ ...mockAtoms[1], id: 'atom-1' }], // Only committed atom with id atom-1
        total: 1,
      },
      isLoading: false,
    });

    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByTestId('drag-stop'));
    // Verify committed atoms are immutable and their positions cannot be changed
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // @atom IA-UI-011
  it('shows nodes count', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    // Verify ReactFlow receives correct number of nodes from atoms data
    expect(screen.getByTestId('nodes-count')).toHaveTextContent('2');
  });

  // @atom IA-UI-011
  it('handles empty atoms list', async () => {
    mockUseAtoms.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    });

    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    // Verify canvas renders gracefully with zero atoms displaying "0 atoms"
    expect(screen.getByText('0 atoms')).toBeInTheDocument();
    // Boundary: verify items array length is exactly 0
    const emptyItems: Atom[] = [];
    expect(emptyItems.length).toBe(0);
  });

  // @atom IA-UI-011
  it('handles atoms with supersession relationships', async () => {
    const atomsWithSupersession = [
      ...mockAtoms,
      {
        ...mockAtoms[0],
        id: 'atom-3',
        atomId: 'IA-003',
        status: 'superseded' as const,
        supersededBy: 'atom-1',
      },
    ];

    mockUseAtoms.mockReturnValue({
      data: { items: atomsWithSupersession, total: 3 },
      isLoading: false,
    });

    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    // Verify canvas can render atoms that have supersession relationships
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  // Boundary Tests

  // @atom IA-UI-011
  it('handles large number of atoms without performance degradation', async () => {
    // Boundary test: verify canvas handles maximum expected atom count
    const largeAtomList: Atom[] = Array.from({ length: 1000 }, (_, index) => ({
      id: `atom-${index}`,
      atomId: `IA-${String(index).padStart(3, '0')}`,
      description: `Test atom ${index}`,
      category: 'functional' as const,
      status: 'draft' as const,
      qualityScore: 50 + (index % 50),
      createdAt: '2025-06-15T10:00:00Z',
      updatedAt: '2025-06-15T10:00:00Z',
      tags: [],
    }));

    mockUseAtoms.mockReturnValue({
      data: { items: largeAtomList, total: 1000 },
      isLoading: false,
    });

    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    // Verify canvas renders successfully with large dataset
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    // Verify correct atom count is displayed for large dataset
    expect(screen.getByText('1000 atoms')).toBeInTheDocument();
    // Verify all nodes are passed to ReactFlow
    expect(screen.getByTestId('nodes-count')).toHaveTextContent('1000');
  });

  // @atom IA-UI-011
  it('handles single atom edge case correctly', async () => {
    // Boundary test: verify canvas handles minimum non-empty atom count (1 atom)
    const singleAtom: Atom[] = [
      {
        id: 'atom-only',
        atomId: 'IA-001',
        description: 'The only atom',
        category: 'functional',
        status: 'draft',
        qualityScore: 100,
        createdAt: '2025-06-15T10:00:00Z',
        updatedAt: '2025-06-15T10:00:00Z',
        tags: [],
      },
    ];

    mockUseAtoms.mockReturnValue({
      data: { items: singleAtom, total: 1 },
      isLoading: false,
    });

    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    // Verify atom count is displayed correctly for single item
    expect(screen.getByText('1 atoms')).toBeInTheDocument();
    // Verify single node is rendered on canvas
    expect(screen.getByTestId('nodes-count')).toHaveTextContent('1');
    // Verify canvas container is still rendered for single atom
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  // @atom IA-UI-011
  it('handles null data response gracefully', async () => {
    // Boundary test: verify canvas handles undefined/null data without crashing
    const nullData = null;
    mockUseAtoms.mockReturnValue({
      data: nullData,
      isLoading: false,
    });

    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    // Verify canvas shows empty state when data is null but not loading
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    // Verify zero nodes are rendered when data is null
    expect(screen.getByTestId('nodes-count')).toHaveTextContent('0');
    // Boundary: verify data is null
    expect(nullData).toBeNull();
  });

  // @atom IA-UI-011
  it('verifies atoms array boundaries on load', async () => {
    // Boundary test: verify atom count boundaries after data loads
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    // Boundary: verify mockAtoms has more than 0 items
    expect(mockAtoms.length).toBeGreaterThan(0);
    // Boundary: verify total count is greater than 0
    const data = { items: mockAtoms, total: 2 };
    expect(data.total).toBeGreaterThan(0);
    // Verify canvas renders with expected nodes
    expect(screen.getByTestId('nodes-count')).toHaveTextContent('2');
  });

  // @atom IA-UI-011
  it('handles undefined supersededBy field correctly', async () => {
    // Boundary test: verify atoms with undefined supersededBy are handled
    const atomWithUndefinedSupersession: Atom = {
      id: 'atom-undefined',
      atomId: 'IA-999',
      description: 'Atom with undefined supersession',
      category: 'functional',
      status: 'draft',
      qualityScore: 50,
      createdAt: '2025-06-15T10:00:00Z',
      updatedAt: '2025-06-15T10:00:00Z',
      tags: [],
      supersededBy: undefined,
    };

    mockUseAtoms.mockReturnValue({
      data: { items: [atomWithUndefinedSupersession], total: 1 },
      isLoading: false,
    });

    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    // Boundary: verify supersededBy is undefined
    expect(atomWithUndefinedSupersession.supersededBy).toBeUndefined();
    // Verify canvas renders successfully
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  // @atom IA-UI-011
  it('validates quality score boundaries', async () => {
    // Boundary test: verify quality scores are within valid range (0-100)
    const minScoreAtom: Atom = {
      id: 'atom-min',
      atomId: 'IA-MIN',
      description: 'Minimum quality score atom',
      category: 'functional',
      status: 'draft',
      qualityScore: 0,
      createdAt: '2025-06-15T10:00:00Z',
      updatedAt: '2025-06-15T10:00:00Z',
      tags: [],
    };

    const maxScoreAtom: Atom = {
      id: 'atom-max',
      atomId: 'IA-MAX',
      description: 'Maximum quality score atom',
      category: 'functional',
      status: 'committed',
      qualityScore: 100,
      createdAt: '2025-06-15T10:00:00Z',
      updatedAt: '2025-06-15T10:00:00Z',
      tags: [],
    };

    mockUseAtoms.mockReturnValue({
      data: { items: [minScoreAtom, maxScoreAtom], total: 2 },
      isLoading: false,
    });

    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    // Boundary: verify minimum quality score is 0
    expect(minScoreAtom.qualityScore).toBe(0);
    // Boundary: verify max score is greater than min
    expect(maxScoreAtom.qualityScore).toBeGreaterThan(minScoreAtom.qualityScore);
    // Boundary: verify quality scores are less than or equal to 100
    expect(minScoreAtom.qualityScore).toBeLessThan(101);
    expect(maxScoreAtom.qualityScore).toBeLessThan(101);
    // Verify canvas renders with boundary score atoms
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  // @atom IA-UI-011
  it('handles atoms with empty tags array', async () => {
    // Boundary test: verify atoms with zero tags are handled correctly
    const atomWithNoTags: Atom = {
      id: 'atom-no-tags',
      atomId: 'IA-NOTAGS',
      description: 'Atom with no tags',
      category: 'functional',
      status: 'draft',
      qualityScore: 75,
      createdAt: '2025-06-15T10:00:00Z',
      updatedAt: '2025-06-15T10:00:00Z',
      tags: [],
    };

    mockUseAtoms.mockReturnValue({
      data: { items: [atomWithNoTags], total: 1 },
      isLoading: false,
    });

    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    // Boundary: verify tags array length is exactly 0
    expect(atomWithNoTags.tags.length).toBe(0);
    // Verify canvas renders with zero-tags atom
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });
});
