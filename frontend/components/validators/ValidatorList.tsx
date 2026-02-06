'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ValidatorCard } from './ValidatorCard';
import { useAtomValidators } from '@/hooks/validators';
import type { Validator, ValidatorType, ValidatorFormat } from '@/types/validator';
import { Plus, Filter, Search, RefreshCw } from 'lucide-react';

interface ValidatorListProps {
  atomId: string;
  onCreateValidator?: () => void;
  onEditValidator?: (validator: Validator) => void;
  onTranslateValidator?: (validator: Validator) => void;
  className?: string;
}

/**
 * List component for displaying validators associated with an atom
 */
export function ValidatorList({
  atomId,
  onCreateValidator,
  onEditValidator,
  onTranslateValidator,
  className,
}: ValidatorListProps) {
  const { data: validators, isLoading, error, refetch } = useAtomValidators(atomId);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<ValidatorType | ''>('');
  const [filterFormat, setFilterFormat] = useState<ValidatorFormat | ''>('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  // Apply filters
  const filteredValidators = validators?.filter((validator) => {
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        validator.name.toLowerCase().includes(search) ||
        validator.description?.toLowerCase().includes(search) ||
        validator.content.toLowerCase().includes(search);
      if (!matchesSearch) return false;
    }

    // Type filter
    if (filterType && validator.validatorType !== filterType) {
      return false;
    }

    // Format filter
    if (filterFormat && validator.format !== filterFormat) {
      return false;
    }

    // Active filter
    if (filterActive === 'active' && !validator.isActive) {
      return false;
    }
    if (filterActive === 'inactive' && validator.isActive) {
      return false;
    }

    return true;
  }) || [];

  if (isLoading) {
    return (
      <div className={cn('p-8 text-center', className)}>
        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Loading validators...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-8 text-center', className)}>
        <p className="text-destructive">Failed to load validators: {error.message}</p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-sm text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const hasFilters = searchTerm || filterType || filterFormat || filterActive !== 'all';

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">
          Validators
          <span className="ml-2 text-sm text-muted-foreground">
            ({validators?.length || 0})
          </span>
        </h3>
        {onCreateValidator && (
          <button
            onClick={onCreateValidator}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Validator
          </button>
        )}
      </div>

      {/* Filters */}
      {validators && validators.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search validators..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-md"
            />
          </div>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as ValidatorType | '')}
            className="px-3 py-1.5 text-sm border rounded-md"
          >
            <option value="">All Types</option>
            <option value="gherkin">Gherkin</option>
            <option value="executable">Executable</option>
            <option value="declarative">Declarative</option>
          </select>

          {/* Format Filter */}
          <select
            value={filterFormat}
            onChange={(e) => setFilterFormat(e.target.value as ValidatorFormat | '')}
            className="px-3 py-1.5 text-sm border rounded-md"
          >
            <option value="">All Formats</option>
            <option value="gherkin">Gherkin</option>
            <option value="natural_language">Natural Language</option>
            <option value="typescript">TypeScript</option>
            <option value="json">JSON</option>
          </select>

          {/* Active Filter */}
          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
            className="px-3 py-1.5 text-sm border rounded-md"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterType('');
                setFilterFormat('');
                setFilterActive('all');
              }}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Validator Cards */}
      {filteredValidators.length > 0 ? (
        <div className="space-y-3">
          {filteredValidators.map((validator) => (
            <ValidatorCard
              key={validator.id}
              validator={validator}
              onEdit={onEditValidator}
              onTranslate={onTranslateValidator}
            />
          ))}
        </div>
      ) : validators && validators.length > 0 ? (
        <div className="p-8 text-center border rounded-lg">
          <Filter className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No validators match your filters</p>
        </div>
      ) : (
        <div className="p-8 text-center border rounded-lg border-dashed">
          <p className="text-muted-foreground mb-2">No validators yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Validators define testable acceptance criteria for this atom
          </p>
          {onCreateValidator && (
            <button
              onClick={onCreateValidator}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create First Validator
            </button>
          )}
        </div>
      )}
    </div>
  );
}
