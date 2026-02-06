'use client';

import { useState } from 'react';
import { useConflicts } from '@/hooks/conflicts/use-conflicts';
import { cn } from '@/lib/utils';
import { AlertTriangle, GitMerge, Copy, Shuffle, ArrowUpCircle } from 'lucide-react';
import type { ConflictRecord, ConflictFilters } from '@/lib/api/conflicts';

const typeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  same_test: {
    label: 'Same Test',
    color: 'bg-blue-100 text-blue-800',
    icon: <Copy className="h-3 w-3" />,
  },
  semantic_overlap: {
    label: 'Semantic Overlap',
    color: 'bg-purple-100 text-purple-800',
    icon: <GitMerge className="h-3 w-3" />,
  },
  contradiction: {
    label: 'Contradiction',
    color: 'bg-red-100 text-red-800',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  cross_boundary: {
    label: 'Cross Boundary',
    color: 'bg-orange-100 text-orange-800',
    icon: <Shuffle className="h-3 w-3" />,
  },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-yellow-100 text-yellow-800' },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-800' },
  escalated: { label: 'Escalated', color: 'bg-red-100 text-red-800' },
};

interface ConflictsListProps {
  onSelectConflict: (conflict: ConflictRecord) => void;
  selectedConflictId?: string;
}

export function ConflictsList({ onSelectConflict, selectedConflictId }: ConflictsListProps) {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);

  const filters: ConflictFilters = {};
  if (statusFilter) filters.status = statusFilter;
  if (typeFilter) filters.type = typeFilter;

  const { data: conflicts, isLoading, error } = useConflicts(filters);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 rounded-lg">
        <p className="text-sm text-destructive">Failed to load conflicts</p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={statusFilter || ''}
          onChange={(e) => setStatusFilter(e.target.value || undefined)}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="escalated">Escalated</option>
        </select>
        <select
          value={typeFilter || ''}
          onChange={(e) => setTypeFilter(e.target.value || undefined)}
          className="text-sm border rounded-md px-3 py-1.5 bg-background"
        >
          <option value="">All types</option>
          <option value="same_test">Same Test</option>
          <option value="semantic_overlap">Semantic Overlap</option>
          <option value="contradiction">Contradiction</option>
          <option value="cross_boundary">Cross Boundary</option>
        </select>
      </div>

      {/* List */}
      {!conflicts || conflicts.length === 0 ? (
        <div className="text-center py-12">
          <ArrowUpCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <p className="text-lg font-medium">No conflicts detected</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your intent atoms are consistent and well-organized.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conflicts.map((conflict) => {
            const type = typeConfig[conflict.conflictType] || typeConfig.same_test;
            const status = statusConfig[conflict.status] || statusConfig.open;

            return (
              <button
                key={conflict.id}
                type="button"
                onClick={() => onSelectConflict(conflict)}
                className={cn(
                  'w-full text-left p-4 rounded-lg border transition-colors',
                  selectedConflictId === conflict.id
                    ? 'border-primary bg-accent/50'
                    : 'hover:bg-accent/30',
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                        type.color,
                      )}
                    >
                      {type.icon}
                      {type.label}
                    </span>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-medium',
                        status.color,
                      )}
                    >
                      {status.label}
                    </span>
                  </div>
                  {conflict.similarityScore != null && (
                    <span className="text-xs text-muted-foreground">
                      {conflict.similarityScore}% similar
                    </span>
                  )}
                </div>
                <p className="text-sm line-clamp-2">{conflict.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(conflict.createdAt).toLocaleDateString()}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
