'use client';

import { AppLayout } from '@/components/layout';
import { usePendingReviewAtoms } from '@/hooks/atoms/use-atoms';
import { ProposedAtomCard } from '@/components/atoms/ProposedAtomCard';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';

/**
 * Page for reviewing atoms pending human approval (Phase 18)
 */
export default function PendingAtomsPage() {
  const { data: pendingAtoms, isLoading, error, refetch } = usePendingReviewAtoms();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Pending Atom Review</h1>
          <p className="text-muted-foreground mt-2">
            Review and approve atoms suggested by AI agents
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Pending Atom Review</h1>
          <p className="text-muted-foreground mt-2">
            Review and approve atoms suggested by AI agents
          </p>
        </div>

        <div className="bg-destructive/10 border border-destructive rounded-lg p-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-destructive mb-1">Failed to load pending atoms</h3>
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <button
              onClick={() => refetch()}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
      </AppLayout>
    );
  }

  const isEmpty = !pendingAtoms || pendingAtoms.length === 0;

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Pending Atom Review</h1>
        <p className="text-muted-foreground mt-2">
          Review and approve atoms suggested by AI agents during reconciliation or development
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="text-sm">
            <span className="font-semibold">{pendingAtoms?.length || 0}</span> atom
            {pendingAtoms?.length !== 1 ? 's' : ''} awaiting review
          </div>
        </div>
      </div>

      {/* Empty State */}
      {isEmpty && (
        <div className="bg-muted/50 border border-dashed rounded-lg p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-4xl mb-4">🎉</div>
            <h3 className="text-xl font-semibold mb-2">All caught up!</h3>
            <p className="text-muted-foreground">
              There are no atoms awaiting review. New proposed atoms will appear here when AI agents
              discover them during reconciliation or when suggesting atoms during development.
            </p>
          </div>
        </div>
      )}

      {/* Pending Atoms Grid */}
      {!isEmpty && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pendingAtoms?.map((atom) => (
            <ProposedAtomCard
              key={atom.id}
              atom={atom}
              onReviewComplete={() => refetch()}
            />
          ))}
        </div>
      )}

      {/* Help Text */}
      {!isEmpty && (
        <div className="mt-8 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-semibold mb-2">Review Guidelines</h4>
          <ul className="text-sm space-y-1 text-muted-foreground">
            <li>• Review the atom description, category, and observable outcomes</li>
            <li>• Check the confidence score and rationale from the AI agent</li>
            <li>• You can edit the description or category before approving</li>
            <li>• Approved atoms become committed and are immutable</li>
            <li>• Rejected atoms are marked as abandoned and won't appear again</li>
          </ul>
        </div>
      )}
    </div>
    </AppLayout>
  );
}
