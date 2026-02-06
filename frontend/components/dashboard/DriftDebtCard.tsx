'use client';

import Link from 'next/link';
import { useDriftSummary } from '@/hooks/drift';
import { cn } from '@/lib/utils';
import { DRIFT_TYPE_LABELS, SEVERITY_COLORS } from '@/types/drift';
import type { DriftType, DriftDebtSeverity } from '@/types/drift';

interface DriftDebtCardProps {
  projectId?: string;
  className?: string;
}

/**
 * Dashboard card showing drift debt summary
 */
export function DriftDebtCard({ projectId, className }: DriftDebtCardProps) {
  const { data, isLoading, error } = useDriftSummary(projectId);

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-10 w-16 bg-muted rounded" />
          <div className="space-y-2">
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-3/4 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <h3 className="text-sm font-medium text-muted-foreground">Drift Debt</h3>
        <p className="mt-2 text-sm text-muted-foreground">Unable to load drift data</p>
      </div>
    );
  }

  const { totalOpen, byType, bySeverity, overdueCount, convergenceScore } = data;

  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Drift Debt</h3>
        <Link
          href="/drift"
          className="text-xs text-primary hover:underline"
        >
          View All
        </Link>
      </div>

      {/* Main stat */}
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold">{totalOpen}</span>
        <span className="text-sm text-muted-foreground">open items</span>
      </div>

      {/* Overdue warning */}
      {overdueCount > 0 && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span>{overdueCount} overdue</span>
        </div>
      )}

      {/* Convergence score */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Convergence</span>
          <span className={cn(
            'font-medium',
            convergenceScore >= 80 ? 'text-green-600 dark:text-green-400' :
            convergenceScore >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
            'text-red-600 dark:text-red-400'
          )}>
            {convergenceScore}%
          </span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full transition-all',
              convergenceScore >= 80 ? 'bg-green-500' :
              convergenceScore >= 50 ? 'bg-yellow-500' :
              'bg-red-500'
            )}
            style={{ width: `${convergenceScore}%` }}
          />
        </div>
      </div>

      {/* Breakdown by type */}
      <div className="mt-4 space-y-1">
        {(Object.entries(byType) as [DriftType, number][])
          .filter(([, count]) => count > 0)
          .map(([type, count]) => (
            <div key={type} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{DRIFT_TYPE_LABELS[type]}</span>
              <span className="font-medium">{count}</span>
            </div>
          ))}
      </div>

      {/* Severity badges */}
      {totalOpen > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {(Object.entries(bySeverity) as [DriftDebtSeverity, number][])
            .filter(([, count]) => count > 0)
            .map(([severity, count]) => (
              <span
                key={severity}
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                  SEVERITY_COLORS[severity]
                )}
              >
                {count} {severity}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
