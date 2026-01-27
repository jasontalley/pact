'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { InvariantConfigCard } from './InvariantConfigCard';
import { useInvariants } from '@/hooks/invariants';
import type { InvariantConfig, InvariantCheckType } from '@/types/invariant';
import { RefreshCw, Filter, Shield } from 'lucide-react';

interface InvariantListProps {
  projectId?: string;
  onEdit?: (invariant: InvariantConfig) => void;
  className?: string;
}

/**
 * List component for displaying invariant configurations
 */
export function InvariantList({
  projectId,
  onEdit,
  className,
}: InvariantListProps) {
  const { data: invariants, isLoading, error, refetch } = useInvariants(projectId);
  const [filterType, setFilterType] = useState<InvariantCheckType | ''>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [filterBlocking, setFilterBlocking] = useState<'all' | 'blocking' | 'warning'>('all');

  // Apply filters
  const filteredInvariants = invariants?.filter((inv) => {
    if (filterType && inv.checkType !== filterType) return false;
    if (filterStatus === 'enabled' && !inv.isEnabled) return false;
    if (filterStatus === 'disabled' && inv.isEnabled) return false;
    if (filterBlocking === 'blocking' && !inv.isBlocking) return false;
    if (filterBlocking === 'warning' && inv.isBlocking) return false;
    return true;
  }) || [];

  const hasFilters = filterType || filterStatus !== 'all' || filterBlocking !== 'all';

  if (isLoading) {
    return (
      <div className={cn('p-8 text-center', className)}>
        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Loading invariants...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-8 text-center', className)}>
        <p className="text-destructive">Failed to load invariants: {error.message}</p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-sm text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // Group invariants by type
  const builtinInvariants = filteredInvariants.filter((inv) => inv.isBuiltin);
  const customInvariants = filteredInvariants.filter((inv) => !inv.isBuiltin);

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Invariants
          <span className="text-sm text-muted-foreground">
            ({invariants?.length || 0})
          </span>
        </h3>
      </div>

      {/* Filters */}
      {invariants && invariants.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as InvariantCheckType | '')}
            className="px-3 py-1.5 text-sm border rounded-md"
          >
            <option value="">All Types</option>
            <option value="builtin">Built-in</option>
            <option value="custom">Custom</option>
            <option value="llm">LLM</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'enabled' | 'disabled')}
            className="px-3 py-1.5 text-sm border rounded-md"
          >
            <option value="all">All Statuses</option>
            <option value="enabled">Enabled Only</option>
            <option value="disabled">Disabled Only</option>
          </select>

          {/* Blocking Filter */}
          <select
            value={filterBlocking}
            onChange={(e) => setFilterBlocking(e.target.value as 'all' | 'blocking' | 'warning')}
            className="px-3 py-1.5 text-sm border rounded-md"
          >
            <option value="all">All Severities</option>
            <option value="blocking">Blocking Only</option>
            <option value="warning">Warnings Only</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => {
                setFilterType('');
                setFilterStatus('all');
                setFilterBlocking('all');
              }}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {filteredInvariants.length > 0 ? (
        <div className="space-y-6">
          {/* Built-in Invariants */}
          {builtinInvariants.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                Built-in Invariants ({builtinInvariants.length})
              </h4>
              <div className="space-y-3">
                {builtinInvariants.map((inv) => (
                  <InvariantConfigCard key={inv.id} invariant={inv} onEdit={onEdit} />
                ))}
              </div>
            </div>
          )}

          {/* Custom Invariants */}
          {customInvariants.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                Custom Invariants ({customInvariants.length})
              </h4>
              <div className="space-y-3">
                {customInvariants.map((inv) => (
                  <InvariantConfigCard key={inv.id} invariant={inv} onEdit={onEdit} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : invariants && invariants.length > 0 ? (
        <div className="p-8 text-center border rounded-lg">
          <Filter className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No invariants match your filters</p>
        </div>
      ) : (
        <div className="p-8 text-center border rounded-lg border-dashed">
          <Shield className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground mb-2">No invariants configured</p>
          <p className="text-sm text-muted-foreground">
            Invariants are rules that are checked at commitment time.
          </p>
        </div>
      )}
    </div>
  );
}
