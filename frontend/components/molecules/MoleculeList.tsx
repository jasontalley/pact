'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { MoleculeCard } from './MoleculeCard';
import { useMolecules, useLensTypes } from '@/hooks/molecules';
import type { Molecule, LensType, MoleculeFilters } from '@/types/molecule';
import { Plus, Filter, Search, RefreshCw, Layers } from 'lucide-react';

interface MoleculeListProps {
  filters?: MoleculeFilters;
  onCreateMolecule?: () => void;
  onEditMolecule?: (molecule: Molecule) => void;
  onViewAtoms?: (molecule: Molecule) => void;
  showMetrics?: boolean;
  className?: string;
}

/**
 * List component for displaying molecules with filtering and pagination
 */
export function MoleculeList({
  filters: initialFilters = {},
  onCreateMolecule,
  onEditMolecule,
  onViewAtoms,
  showMetrics = true,
  className,
}: MoleculeListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLensType, setFilterLensType] = useState<LensType | ''>('');
  const [filterHasParent, setFilterHasParent] = useState<'all' | 'root' | 'nested'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'updatedAt'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Construct filters for the API
  // Note: Backend expects 'offset' not 'page', and lowercase sortOrder
  const apiFilters: MoleculeFilters = {
    ...initialFilters,
    search: searchTerm || undefined,
    lensType: filterLensType || undefined,
    parentMoleculeId: filterHasParent === 'root' ? null : initialFilters.parentMoleculeId,
    sortBy,
    sortOrder,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  };

  const { data, isLoading, error, refetch } = useMolecules(apiFilters);
  const { data: lensTypes } = useLensTypes();

  // Apply client-side filter for nested vs root
  // Backend returns { items, total, limit, offset }
  const filteredMolecules = data?.items?.filter((molecule) => {
    if (filterHasParent === 'root' && molecule.parentMoleculeId) return false;
    if (filterHasParent === 'nested' && !molecule.parentMoleculeId) return false;
    return true;
  }) || [];

  const hasFilters = searchTerm || filterLensType || filterHasParent !== 'all';

  if (isLoading) {
    return (
      <div className={cn('p-8 text-center', className)}>
        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Loading molecules...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-8 text-center', className)}>
        <p className="text-destructive">Failed to load molecules: {error.message}</p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-sm text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const totalMolecules = data?.total || 0;
  const totalPages = Math.ceil(totalMolecules / pageSize);

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Molecules
          <span className="text-sm text-muted-foreground">
            ({totalMolecules})
          </span>
        </h3>
        {onCreateMolecule && (
          <button
            onClick={onCreateMolecule}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Molecule
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Search molecules..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-md"
          />
        </div>

        {/* Lens Type Filter */}
        <select
          value={filterLensType}
          onChange={(e) => {
            setFilterLensType(e.target.value as LensType | '');
            setPage(1);
          }}
          className="px-3 py-1.5 text-sm border rounded-md"
        >
          <option value="">All Lens Types</option>
          {lensTypes?.map((lt) => (
            <option key={lt.type} value={lt.type}>
              {lt.label}
            </option>
          ))}
        </select>

        {/* Hierarchy Filter */}
        <select
          value={filterHasParent}
          onChange={(e) => {
            setFilterHasParent(e.target.value as 'all' | 'root' | 'nested');
            setPage(1);
          }}
          className="px-3 py-1.5 text-sm border rounded-md"
        >
          <option value="all">All Levels</option>
          <option value="root">Root Only</option>
          <option value="nested">Nested Only</option>
        </select>

        {/* Sort */}
        <select
          value={`${sortBy}-${sortOrder}`}
          onChange={(e) => {
            const [field, order] = e.target.value.split('-') as [
              'name' | 'createdAt' | 'updatedAt',
              'asc' | 'desc'
            ];
            setSortBy(field);
            setSortOrder(order);
            setPage(1);
          }}
          className="px-3 py-1.5 text-sm border rounded-md"
        >
          <option value="updatedAt-desc">Recently Updated</option>
          <option value="createdAt-desc">Recently Created</option>
          <option value="name-asc">Name (A-Z)</option>
          <option value="name-desc">Name (Z-A)</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterLensType('');
              setFilterHasParent('all');
              setPage(1);
            }}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Molecule Cards */}
      {filteredMolecules.length > 0 ? (
        <div className="space-y-3">
          {filteredMolecules.map((molecule) => (
            <MoleculeCard
              key={molecule.id}
              molecule={molecule}
              onEdit={onEditMolecule}
              onViewAtoms={onViewAtoms}
              showMetrics={showMetrics}
            />
          ))}
        </div>
      ) : hasFilters ? (
        <div className="p-8 text-center border rounded-lg">
          <Filter className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No molecules match your filters</p>
        </div>
      ) : (
        <div className="p-8 text-center border rounded-lg border-dashed">
          <Layers className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground mb-2">No molecules yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Molecules group atoms into meaningful features, stories, or capabilities
          </p>
          {onCreateMolecule && (
            <button
              onClick={onCreateMolecule}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create First Molecule
            </button>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
