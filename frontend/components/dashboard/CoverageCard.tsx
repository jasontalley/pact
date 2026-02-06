'use client';

import { useCoverageLatest } from '@/hooks/coverage/use-coverage';
import { BarChart3, Upload } from 'lucide-react';
import Link from 'next/link';

const dimensions = [
  { key: 'statements' as const, label: 'Statements' },
  { key: 'branches' as const, label: 'Branches' },
  { key: 'functions' as const, label: 'Functions' },
  { key: 'lines' as const, label: 'Lines' },
];

function barColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

function textColor(pct: number): string {
  if (pct >= 80) return 'text-green-700';
  if (pct >= 60) return 'text-yellow-700';
  return 'text-red-700';
}

export function CoverageCard() {
  const { data, isLoading, error } = useCoverageLatest();

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border p-6 shadow-sm animate-pulse">
        <div className="h-6 bg-muted rounded w-40 mb-4" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card rounded-lg border p-6 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Code Coverage
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          No coverage data available. Upload a coverage report to see metrics.
        </p>
      </div>
    );
  }

  const overallPct = Math.round(data.summary.lines.pct);

  return (
    <div className="bg-card rounded-lg border p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Code Coverage
          </h3>
          <p className="text-sm text-muted-foreground">
            {data.format} report &middot; {data.branchName || 'unknown branch'}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-bold ${textColor(overallPct)}`}>{overallPct}%</p>
          <p className="text-xs text-muted-foreground">Lines</p>
        </div>
      </div>

      <div className="space-y-3">
        {dimensions.map((dim) => {
          const value = data.summary[dim.key];
          const pct = Math.round(value.pct);
          return (
            <div key={dim.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-muted-foreground">{dim.label}</span>
                <span className={`text-sm font-medium ${textColor(pct)}`}>
                  {pct}% ({value.covered}/{value.total})
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {data.fileDetails.length} files tracked
        </p>
        {data.commitHash && (
          <p className="text-xs text-muted-foreground font-mono">
            {data.commitHash.slice(0, 7)}
          </p>
        )}
      </div>
    </div>
  );
}
