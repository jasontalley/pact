'use client';

import { useState } from 'react';
import { useDriftTrend } from '@/hooks/drift';
import { cn } from '@/lib/utils';

interface DriftTrendChartProps {
  projectId?: string;
  className?: string;
}

type Period = 'week' | 'month' | 'quarter';

/**
 * Dashboard chart showing drift trend over time
 */
export function DriftTrendChart({ projectId, className }: DriftTrendChartProps) {
  const [period, setPeriod] = useState<Period>('month');
  const { data, isLoading, error } = useDriftTrend(period, projectId);

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error || !data || data.data.length === 0) {
    return (
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <h3 className="text-sm font-medium text-muted-foreground">Drift Trend</h3>
        <p className="mt-2 text-sm text-muted-foreground">No trend data available</p>
      </div>
    );
  }

  // Calculate stats for the period
  const totalNew = data.data.reduce((sum, d) => sum + d.newCount, 0);
  const totalResolved = data.data.reduce((sum, d) => sum + d.resolvedCount, 0);
  const netChange = totalNew - totalResolved;
  const maxOpen = Math.max(...data.data.map((d) => d.totalOpen), 1);
  const latestOpen = data.data[data.data.length - 1]?.totalOpen || 0;

  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Drift Trend</h3>
        <div className="flex gap-1">
          {(['week', 'month', 'quarter'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors',
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {p === 'week' ? '7D' : p === 'month' ? '30D' : '90D'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-lg font-bold text-green-600 dark:text-green-400">
            +{totalNew}
          </div>
          <div className="text-xs text-muted-foreground">New</div>
        </div>
        <div>
          <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
            -{totalResolved}
          </div>
          <div className="text-xs text-muted-foreground">Resolved</div>
        </div>
        <div>
          <div className={cn(
            'text-lg font-bold',
            netChange > 0 ? 'text-red-600 dark:text-red-400' :
            netChange < 0 ? 'text-green-600 dark:text-green-400' :
            'text-muted-foreground'
          )}>
            {netChange > 0 ? '+' : ''}{netChange}
          </div>
          <div className="text-xs text-muted-foreground">Net</div>
        </div>
      </div>

      {/* Simple bar chart */}
      <div className="mt-4 h-24 flex items-end gap-[2px]">
        {data.data.map((point, i) => {
          const height = (point.totalOpen / maxOpen) * 100;
          const isLatest = i === data.data.length - 1;

          return (
            <div
              key={point.date}
              className="flex-1 flex flex-col items-center"
              title={`${point.date}: ${point.totalOpen} open`}
            >
              <div
                className={cn(
                  'w-full rounded-t transition-all',
                  isLatest ? 'bg-primary' : 'bg-primary/50'
                )}
                style={{ height: `${Math.max(height, 2)}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{data.data[0]?.date.slice(5)}</span>
        <span>Now: {latestOpen}</span>
      </div>

      {/* Trend indicator */}
      <div className="mt-3 flex items-center justify-center gap-2 text-sm">
        {netChange > 0 ? (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-red-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-red-600 dark:text-red-400">Drift increasing</span>
          </>
        ) : netChange < 0 ? (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-green-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-green-600 dark:text-green-400">Drift converging</span>
          </>
        ) : (
          <span className="text-muted-foreground">Drift stable</span>
        )}
      </div>
    </div>
  );
}
