'use client';

import Link from 'next/link';
import { useAtoms } from '@/hooks/atoms/use-atoms';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { QualityBadge } from '@/components/quality/QualityBadge';
import { formatDistanceToNow } from '@/lib/utils/format';

/**
 * Recent atoms list for dashboard
 */
export function RecentAtoms() {
  const { data, isLoading, error } = useAtoms({
    sortBy: 'createdAt',
    sortOrder: 'DESC',
    limit: 10,
  });

  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Atoms</h3>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-16 bg-muted rounded animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Atoms</h3>
        <p className="text-destructive">Failed to load atoms</p>
      </div>
    );
  }

  const atoms = data?.items ?? [];

  return (
    <div className="bg-card rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Recent Atoms</h3>
        <Link
          href="/atoms"
          className="text-sm text-primary hover:underline"
        >
          View all
        </Link>
      </div>

      {atoms.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">
          No atoms yet. Create your first intent atom!
        </p>
      ) : (
        <div className="space-y-3">
          {atoms.map((atom) => (
            <Link
              key={atom.id}
              href={`/atoms/${atom.id}`}
              className="block p-3 rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">
                      {atom.atomId}
                    </span>
                    <StatusBadge status={atom.status} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 truncate">
                    {atom.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(atom.createdAt))}
                  </p>
                </div>
                <div className="ml-4">
                  <QualityBadge score={atom.qualityScore} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
