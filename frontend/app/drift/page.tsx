'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout';
import {
  useDriftList,
  useDriftSummary,
  useDriftAging,
  useAcknowledgeDrift,
  useWaiveDrift,
} from '@/hooks/drift';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from '@/lib/utils/format';
import type { DriftType, DriftDebtStatus, DriftDebtSeverity, DriftItem } from '@/types/drift';
import { DRIFT_TYPE_LABELS, SEVERITY_LABELS, SEVERITY_COLORS, DRIFT_STATUS_COLORS } from '@/types/drift';

type FilterType = DriftType | 'all';
type FilterSeverity = DriftDebtSeverity | 'all';
type FilterStatus = DriftDebtStatus | 'all';

export default function DriftPage() {
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [severityFilter, setSeverityFilter] = useState<FilterSeverity>('all');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('open');
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data: summaryData, isLoading: summaryLoading } = useDriftSummary();
  const { data: agingData } = useDriftAging();
  const { data: listData, isLoading: listLoading } = useDriftList({
    driftType: typeFilter === 'all' ? undefined : typeFilter,
    severity: severityFilter === 'all' ? undefined : severityFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit,
    offset: page * limit,
  });

  const acknowledgeMutation = useAcknowledgeDrift();
  const waiveMutation = useWaiveDrift();

  const handleAcknowledge = async (id: string) => {
    await acknowledgeMutation.mutateAsync({ id });
  };

  const handleWaive = async (id: string) => {
    const justification = prompt('Please provide a justification for waiving this drift item:');
    if (justification) {
      await waiveMutation.mutateAsync({ id, justification });
    }
  };

  return (
    <AppLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold tracking-tight">Drift Management</h2>
          <p className="text-muted-foreground">
            Track and address gaps between Pact Main and implementation
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {/* Total Open */}
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">Total Open</div>
            <div className="text-2xl font-bold mt-1">
              {summaryLoading ? '-' : summaryData?.totalOpen || 0}
            </div>
          </div>

          {/* Convergence Score */}
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">Convergence</div>
            <div
              className={cn(
                'text-2xl font-bold mt-1',
                (summaryData?.convergenceScore || 0) >= 80
                  ? 'text-green-600'
                  : (summaryData?.convergenceScore || 0) >= 50
                    ? 'text-yellow-600'
                    : 'text-red-600'
              )}
            >
              {summaryLoading ? '-' : `${summaryData?.convergenceScore || 0}%`}
            </div>
          </div>

          {/* Overdue */}
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">Overdue</div>
            <div
              className={cn(
                'text-2xl font-bold mt-1',
                (summaryData?.overdueCount || 0) > 0 ? 'text-red-600' : ''
              )}
            >
              {summaryLoading ? '-' : summaryData?.overdueCount || 0}
            </div>
          </div>

          {/* Critical */}
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">Critical</div>
            <div
              className={cn(
                'text-2xl font-bold mt-1',
                (summaryData?.bySeverity?.critical || 0) > 0 ? 'text-red-600' : ''
              )}
            >
              {summaryLoading ? '-' : summaryData?.bySeverity?.critical || 0}
            </div>
          </div>
        </div>

        {/* Aging Distribution */}
        {agingData && agingData.total > 0 && (
          <div className="rounded-lg border bg-card p-4 mb-6">
            <h3 className="text-sm font-medium mb-3">Age Distribution</h3>
            <div className="flex items-end gap-2 h-16">
              {[
                { label: '0-3d', value: agingData.bucket0to3Days, color: 'bg-green-500' },
                { label: '3-7d', value: agingData.bucket3to7Days, color: 'bg-yellow-500' },
                { label: '7-14d', value: agingData.bucket7to14Days, color: 'bg-orange-500' },
                { label: '14+d', value: agingData.bucket14PlusDays, color: 'bg-red-500' },
              ].map((bucket) => {
                const height = (bucket.value / agingData.total) * 100;
                return (
                  <div key={bucket.label} className="flex-1 flex flex-col items-center">
                    <div
                      className={cn('w-full rounded-t', bucket.color)}
                      style={{ height: `${Math.max(height, 4)}%` }}
                    />
                    <span className="text-xs text-muted-foreground mt-1">{bucket.label}</span>
                    <span className="text-xs font-medium">{bucket.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-4">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as FilterType);
              setPage(0);
            }}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Types</option>
            {Object.entries(DRIFT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value as FilterSeverity);
              setPage(0);
            }}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Severities</option>
            {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as FilterStatus);
              setPage(0);
            }}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="waived">Waived</option>
          </select>
        </div>

        {/* Drift List */}
        <div className="rounded-lg border">
          {listLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : !listData?.items.length ? (
            <div className="p-8 text-center text-muted-foreground">
              No drift items found matching the filters
            </div>
          ) : (
            <table className="w-full">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Severity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Age
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {listData.items.map((item) => (
                  <DriftRow
                    key={item.id}
                    item={item}
                    onAcknowledge={handleAcknowledge}
                    onWaive={handleWaive}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {listData && listData.total > limit && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Showing {page * limit + 1}-{Math.min((page + 1) * limit, listData.total)} of{' '}
              {listData.total}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
                className="px-3 py-1 rounded border text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={(page + 1) * limit >= listData.total}
                className="px-3 py-1 rounded border text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function DriftRow({
  item,
  onAcknowledge,
  onWaive,
}: {
  item: DriftItem;
  onAcknowledge: (id: string) => void;
  onWaive: (id: string) => void;
}) {
  const isOverdue = item.dueAt && new Date(item.dueAt) < new Date();

  return (
    <tr className="border-b hover:bg-muted/30">
      <td className="px-4 py-3">
        <span className="text-xs font-medium">
          {DRIFT_TYPE_LABELS[item.driftType]}
        </span>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/drift/${item.id}`}
          className="text-sm hover:underline line-clamp-2"
        >
          {item.description}
        </Link>
        {item.filePath && (
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {item.filePath}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
            SEVERITY_COLORS[item.severity]
          )}
        >
          {SEVERITY_LABELS[item.severity]}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
            DRIFT_STATUS_COLORS[item.status]
          )}
        >
          {item.status}
        </span>
        {isOverdue && (
          <span className="ml-2 text-xs text-red-600 dark:text-red-400">Overdue</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {item.ageDays}d
      </td>
      <td className="px-4 py-3">
        {item.status === 'open' && (
          <div className="flex gap-2">
            <button
              onClick={() => onAcknowledge(item.id)}
              className="text-xs text-primary hover:underline"
            >
              Acknowledge
            </button>
            <button
              onClick={() => onWaive(item.id)}
              className="text-xs text-muted-foreground hover:underline"
            >
              Waive
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
