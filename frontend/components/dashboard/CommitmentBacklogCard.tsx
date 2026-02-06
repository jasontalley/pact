'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface CommitmentBacklogData {
  count: number;
  atoms: Array<{
    id: string;
    atomId: string;
    description: string;
  }>;
}

interface CommitmentBacklogCardProps {
  projectId?: string;
  className?: string;
}

/**
 * Dashboard card showing committed atoms without test evidence
 */
export function CommitmentBacklogCard({ projectId, className }: CommitmentBacklogCardProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['drift', 'commitment-backlog', projectId],
    queryFn: async () => {
      // Use the drift summary for now, which includes commitment_backlog count
      const params = projectId ? { projectId } : {};
      const response = await apiClient.get<{ byType: { commitment_backlog: number } }>(
        '/drift/summary',
        { params }
      );

      // Get top atoms from drift list
      const driftResponse = await apiClient.get<{
        items: Array<{
          atomId: string | null;
          atomDisplayId: string | null;
          description: string;
        }>;
      }>('/drift', {
        params: { ...params, driftType: 'commitment_backlog', limit: 5 },
      });

      return {
        count: response.data.byType.commitment_backlog || 0,
        atoms: driftResponse.data.items
          .filter((item) => item.atomId)
          .map((item) => ({
            id: item.atomId!,
            atomId: item.atomDisplayId || 'Unknown',
            description: item.description,
          })),
      };
    },
  });

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border bg-card p-6', className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-32 bg-muted rounded" />
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
        <h3 className="text-sm font-medium text-muted-foreground">Commitment Backlog</h3>
        <p className="mt-2 text-sm text-muted-foreground">Unable to load backlog data</p>
      </div>
    );
  }

  const { count, atoms } = data;

  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Commitment Backlog</h3>
        <Link
          href="/reconciliation"
          className="text-xs text-primary hover:underline"
        >
          Reconcile
        </Link>
      </div>

      {/* Main stat */}
      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn(
          'text-3xl font-bold',
          count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'
        )}>
          {count}
        </span>
        <span className="text-sm text-muted-foreground">
          {count === 1 ? 'atom' : 'atoms'} need tests
        </span>
      </div>

      {/* Description */}
      <p className="mt-2 text-xs text-muted-foreground">
        Committed atoms without linked test evidence
      </p>

      {/* Top atoms needing tests */}
      {atoms.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Top Atoms Needing Tests</h4>
          <ul className="space-y-2">
            {atoms.slice(0, 5).map((atom) => (
              <li key={atom.id} className="text-xs">
                <Link
                  href={`/atoms/${atom.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {atom.atomId}
                </Link>
                <p className="text-muted-foreground truncate">{atom.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty state */}
      {count === 0 && (
        <div className="mt-4 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span>All atoms have test coverage!</span>
        </div>
      )}
    </div>
  );
}
