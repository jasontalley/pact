'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useCommitments } from '@/hooks/commitments/use-commitments';
import type { Commitment, CommitmentStatus, CommitmentFilters } from '@/types/commitment';
import { Search, RefreshCw, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

interface CommitmentListProps {
  projectId?: string;
  moleculeId?: string;
  className?: string;
}

/**
 * List component for displaying commitments with filtering and pagination
 */
export function CommitmentList({
  projectId,
  moleculeId,
  className,
}: CommitmentListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CommitmentStatus | ''>('');
  const [page, setPage] = useState(1);
  const limit = 10;

  const filters: CommitmentFilters = {
    projectId,
    moleculeId,
    status: statusFilter || undefined,
    page,
    limit,
  };

  const { data, isLoading, error, refetch } = useCommitments(filters);

  // Filter by search term locally (committedBy, commitmentId)
  const filteredItems = data?.items.filter((commitment) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      commitment.commitmentId.toLowerCase().includes(search) ||
      commitment.committedBy.toLowerCase().includes(search)
    );
  });

  const hasFilters = searchTerm || statusFilter;

  if (isLoading) {
    return (
      <div className={cn('p-8 text-center', className)}>
        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Loading commitments...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-8 text-center', className)}>
        <p className="text-destructive">Failed to load commitments: {error.message}</p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-sm text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">
          Commitments
          <span className="ml-2 text-sm text-muted-foreground">
            ({data?.total || 0})
          </span>
        </h3>
      </div>

      {/* Filters */}
      {data && data.total > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by ID or committer..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-md"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as CommitmentStatus | '');
              setPage(1);
            }}
            className="px-3 py-1.5 text-sm border rounded-md"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="superseded">Superseded</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
                setPage(1);
              }}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-accent"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Commitment Table */}
      {filteredItems && filteredItems.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">ID</th>
                <th className="text-left p-3 font-medium">Atoms</th>
                <th className="text-left p-3 font-medium">Committed By</th>
                <th className="text-left p-3 font-medium">Date</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((commitment) => (
                <CommitmentRow key={commitment.id} commitment={commitment} />
              ))}
            </tbody>
          </table>
        </div>
      ) : data && data.total > 0 ? (
        <div className="p-8 text-center border rounded-lg">
          <Filter className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No commitments match your filters</p>
        </div>
      ) : (
        <div className="p-8 text-center border rounded-lg border-dashed">
          <p className="text-muted-foreground mb-2">No commitments yet</p>
          <p className="text-sm text-muted-foreground">
            Commitments are created when atoms are committed together.
          </p>
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="p-2 border rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= data.totalPages}
              className="p-2 border rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Single commitment row in the table
 */
function CommitmentRow({ commitment }: { commitment: Commitment }) {
  const atomCount = commitment.canonicalJson?.length || commitment.atoms?.length || 0;
  const date = new Date(commitment.committedAt);

  return (
    <tr className="border-t hover:bg-muted/50">
      <td className="p-3">
        <Link
          href={`/commitments/${commitment.id}`}
          className="font-mono text-primary hover:underline"
        >
          {commitment.commitmentId}
        </Link>
        {commitment.supersedes && (
          <span className="ml-2 text-xs text-muted-foreground">
            (supersedes)
          </span>
        )}
      </td>
      <td className="p-3">
        <span className="text-muted-foreground">{atomCount} atom{atomCount !== 1 ? 's' : ''}</span>
      </td>
      <td className="p-3">{commitment.committedBy}</td>
      <td className="p-3 text-muted-foreground">
        {date.toLocaleDateString()}
        <span className="text-xs ml-1">
          {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </td>
      <td className="p-3">
        <CommitmentStatusBadge status={commitment.status} />
      </td>
      <td className="p-3 text-right">
        <Link
          href={`/commitments/${commitment.id}`}
          className="text-sm text-primary hover:underline"
        >
          View
        </Link>
      </td>
    </tr>
  );
}

/**
 * Status badge for commitment status
 */
function CommitmentStatusBadge({ status }: { status: CommitmentStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        status === 'active'
          ? 'bg-green-100 text-green-800'
          : 'bg-gray-100 text-gray-600'
      )}
    >
      {status === 'active' ? 'Active' : 'Superseded'}
    </span>
  );
}
