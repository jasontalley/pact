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

  it('renders loading state', async () => {
    mockUseAtoms.mockReturnValue({
      data: null,
      isLoading: true,
    });

    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    expect(screen.getByText('Loading canvas...')).toBeInTheDocument();
  });

  it('renders ReactFlow canvas when loaded', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  it('renders Background component', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    expect(screen.getByTestId('background')).toBeInTheDocument();
  });

  it('renders Controls component', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    expect(screen.getByTestId('controls')).toBeInTheDocument();
  });

  it('renders MiniMap when visible', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
  });

  it('renders atom count in panel', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    expect(screen.getByText('2 atoms')).toBeInTheDocument();
  });

  it('opens atom detail on node click', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByTestId('node-click'));
    expect(mockOpenAtomDetail).toHaveBeenCalledWith('atom-1');
  });

  it('clears selection on pane click', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByTestId('pane-click'));
    expect(mockClearSelection).toHaveBeenCalled();
  });

  it('updates zoom and pan on move end', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByTestId('move-end'));
    expect(mockSetZoom).toHaveBeenCalledWith(1.5);
    expect(mockSetPan).toHaveBeenCalledWith({ x: 100, y: 200 });
  });

  it('saves position on drag stop for draft atoms', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByTestId('drag-stop'));
    expect(mockMutate).toHaveBeenCalledWith({
      id: 'atom-1',
      data: { canvasPosition: { x: 50, y: 100 } },
    });
  });

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
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows nodes count', async () => {
    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    expect(screen.getByTestId('nodes-count')).toHaveTextContent('2');
  });

  it('handles empty atoms list', async () => {
    mockUseAtoms.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    });

    const { CanvasClient } = await import('@/components/canvas/CanvasClient');
    render(<CanvasClient />, { wrapper: createWrapper() });
    expect(screen.getByText('0 atoms')).toBeInTheDocument();
  });

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
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });
});
