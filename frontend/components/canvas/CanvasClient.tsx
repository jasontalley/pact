'use client';

import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  NodeTypes,
  Panel,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useAtoms, useUpdateAtom } from '@/hooks/atoms/use-atoms';
import { useCanvasUIStore } from '@/stores/canvas-ui';
import { useLayoutStore } from '@/stores/layout';
import { AtomNode } from './AtomNode';
import type { Atom } from '@/types/atom';

// Register custom node types
const nodeTypes: NodeTypes = {
  atomNode: AtomNode,
};

/**
 * Transform atoms to ReactFlow nodes
 */
function atomsToNodes(atoms: Atom[]): Node[] {
  return atoms.map((atom) => ({
    id: atom.id,
    type: 'atomNode',
    position: atom.canvasPosition || { x: Math.random() * 500, y: Math.random() * 500 },
    data: { atom },
  }));
}

/**
 * Create edges based on supersession relationships
 */
function createEdges(atoms: Atom[]): Edge[] {
  const edges: Edge[] = [];

  atoms.forEach((atom) => {
    if (atom.supersededBy) {
      edges.push({
        id: `${atom.id}-${atom.supersededBy}`,
        source: atom.id,
        target: atom.supersededBy,
        animated: true,
        style: { stroke: '#888' },
        label: 'superseded by',
      });
    }
  });

  return edges;
}

/**
 * Canvas client component with ReactFlow
 */
export function CanvasClient() {
  const { data, isLoading } = useAtoms({ limit: 100 });
  const updateAtom = useUpdateAtom();
  const { openAtomDetail } = useLayoutStore();
  const {
    selectedAtomIds,
    selectAtoms,
    clearSelection,
    minimapVisible,
    setZoom,
    setPan,
  } = useCanvasUIStore();

  const atoms = data?.items ?? [];

  // Initialize nodes and edges from atoms
  const initialNodes = useMemo(() => atomsToNodes(atoms), [atoms]);
  const initialEdges = useMemo(() => createEdges(atoms), [atoms]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when atoms change
  useEffect(() => {
    setNodes(atomsToNodes(atoms));
    setEdges(createEdges(atoms));
  }, [atoms, setNodes, setEdges]);

  // Handle node drag end - save position to backend
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const atom = atoms.find((a) => a.id === node.id);
      if (atom && atom.status === 'draft') {
        updateAtom.mutate({
          id: node.id,
          data: { canvasPosition: node.position },
        });
      }
    },
    [atoms, updateAtom]
  );

  // Handle node selection
  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      selectAtoms(selectedNodes.map((n) => n.id));
    },
    [selectAtoms]
  );

  // Handle node click - open detail panel
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      openAtomDetail(node.id);
    },
    [openAtomDetail]
  );

  // Handle pane click - clear selection
  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Handle viewport changes
  const onMoveEnd = useCallback(
    (_: unknown, viewport: { x: number; y: number; zoom: number }) => {
      setZoom(viewport.zoom);
      setPan({ x: viewport.x, y: viewport.y });
    },
    [setZoom, setPan]
  );

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading canvas...</div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      onSelectionChange={onSelectionChange}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      onMoveEnd={onMoveEnd}
      nodeTypes={nodeTypes}
      fitView
      attributionPosition="bottom-left"
      selectNodesOnDrag={false}
    >
      <Background />
      <Controls />
      {minimapVisible && (
        <MiniMap
          nodeStrokeWidth={3}
          zoomable
          pannable
        />
      )}
      <Panel position="top-right" className="bg-card p-2 rounded-lg border shadow-sm">
        <div className="text-sm text-muted-foreground">
          {atoms.length} atoms
          {selectedAtomIds.length > 0 && ` (${selectedAtomIds.length} selected)`}
        </div>
      </Panel>
    </ReactFlow>
  );
}
