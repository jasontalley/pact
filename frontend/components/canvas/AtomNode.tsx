'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { QualityBadge } from '@/components/quality/QualityBadge';
import type { Atom, AtomCategory } from '@/types/atom';

interface AtomNodeData {
  atom: Atom;
}

const categoryColors: Record<AtomCategory, string> = {
  functional: 'border-l-purple-500',
  performance: 'border-l-orange-500',
  security: 'border-l-red-500',
  reliability: 'border-l-blue-500',
  usability: 'border-l-cyan-500',
  maintainability: 'border-l-green-500',
};

/**
 * Custom ReactFlow node for atoms
 */
function AtomNodeComponent({ data, selected }: NodeProps<AtomNodeData>) {
  const { atom } = data;
  const categoryColor = categoryColors[atom.category] || 'border-l-gray-500';

  return (
    <>
      {/* Input handle for incoming edges */}
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />

      <div
        className={cn(
          'bg-card rounded-lg shadow-md border-2 border-l-4 min-w-[200px] max-w-[280px]',
          categoryColor,
          selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
          atom.status === 'superseded' && 'opacity-60'
        )}
      >
        {/* Header */}
        <div className="p-3 border-b">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-semibold truncate">
              {atom.atomId}
            </span>
            <StatusBadge status={atom.status} />
          </div>
        </div>

        {/* Body */}
        <div className="p-3">
          <p className="text-sm text-foreground line-clamp-3">
            {atom.description}
          </p>
        </div>

        {/* Footer */}
        <div className="px-3 pb-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground capitalize">
            {atom.category}
          </span>
          <QualityBadge score={atom.qualityScore} />
        </div>

        {/* Tags */}
        {atom.tags.length > 0 && (
          <div className="px-3 pb-3 flex flex-wrap gap-1">
            {atom.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs bg-muted px-1.5 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
            {atom.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{atom.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Output handle for outgoing edges */}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </>
  );
}

export const AtomNode = memo(AtomNodeComponent);
