'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout';
import {
  useCommitment,
  useCommitmentHistory,
  useCommitmentAtoms,
  useSupersedeCommitment,
} from '@/hooks/commitments/use-commitments';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { QualityBadge } from '@/components/quality/QualityBadge';
import { formatDateTime } from '@/lib/utils/format';
import { ArrowLeft, History, GitBranch, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import type { CommitmentStatus, StoredInvariantCheckResult, CanonicalAtomSnapshot } from '@/types/commitment';
import { cn } from '@/lib/utils';

interface CommitmentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function CommitmentDetailPage({ params }: CommitmentDetailPageProps) {
  const resolvedParams = use(params);
  const { data: commitment, isLoading, error } = useCommitment(resolvedParams.id);
  const { data: history } = useCommitmentHistory(resolvedParams.id);
  const { data: atoms } = useCommitmentAtoms(resolvedParams.id);
  const supersedeMutation = useSupersedeCommitment();

  const [showHistory, setShowHistory] = useState(false);

  if (isLoading) {
    return (
      <AppLayout showSidebar={false}>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="space-y-4">
            <div className="h-12 w-64 bg-muted animate-pulse rounded" />
            <div className="h-32 bg-muted animate-pulse rounded" />
            <div className="h-64 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !commitment) {
    return (
      <AppLayout showSidebar={false}>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Link
            href="/commitments"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Commitments
          </Link>
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-destructive">Commitment Not Found</h2>
            <p className="text-muted-foreground mt-2">
              The requested commitment could not be found.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const atomCount = commitment.canonicalJson?.length || 0;

  return (
    <AppLayout showSidebar={false}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back Link */}
        <Link
          href="/commitments"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Commitments
        </Link>

        {/* Title Section */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-mono font-bold">{commitment.commitmentId}</h1>
              <CommitmentStatusBadge status={commitment.status} />
            </div>
            <p className="text-muted-foreground">
              Committed by <span className="font-medium">{commitment.committedBy}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Committed</p>
            <p className="font-medium">{formatDateTime(new Date(commitment.committedAt))}</p>
          </div>
        </div>

        {/* Summary Card */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Atoms</p>
              <p className="text-2xl font-bold">{atomCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Invariant Checks</p>
              <p className="text-2xl font-bold">
                {commitment.invariantChecks?.filter((c) => c.passed).length || 0}/
                {commitment.invariantChecks?.length || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-2xl font-bold capitalize">{commitment.status}</p>
            </div>
          </div>
        </div>

        {/* Supersession Info */}
        {(commitment.supersedes || commitment.supersededBy) && (
          <div className="bg-muted/50 rounded-lg border p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Supersession Chain</span>
            </div>
            {commitment.supersedes && (
              <p className="text-sm">
                This commitment supersedes{' '}
                <Link
                  href={`/commitments/${commitment.supersedes}`}
                  className="text-primary hover:underline"
                >
                  previous commitment
                </Link>
              </p>
            )}
            {commitment.supersededBy && (
              <p className="text-sm">
                This commitment has been superseded by{' '}
                <Link
                  href={`/commitments/${commitment.supersededBy}`}
                  className="text-primary hover:underline"
                >
                  newer commitment
                </Link>
              </p>
            )}
          </div>
        )}

        {/* Override Justification */}
        {commitment.overrideJustification && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span className="font-medium text-yellow-800">Override Justification</span>
            </div>
            <p className="text-sm text-yellow-700">{commitment.overrideJustification}</p>
          </div>
        )}

        {/* Invariant Checks */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Invariant Checks at Commitment Time</h2>
          {commitment.invariantChecks && commitment.invariantChecks.length > 0 ? (
            <div className="space-y-2">
              {commitment.invariantChecks.map((check, i) => (
                <InvariantCheckRow key={i} check={check} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No invariant checks recorded.</p>
          )}
        </div>

        {/* Canonical Atom Snapshots */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Committed Atoms (Immutable Snapshot)</h2>
          <p className="text-sm text-muted-foreground mb-4">
            These are the exact atoms as they existed at commitment time. Changes to the
            original atoms do not affect this record.
          </p>
          <div className="space-y-3">
            {commitment.canonicalJson.map((snapshot) => (
              <AtomSnapshotCard key={snapshot.atomId} snapshot={snapshot} />
            ))}
          </div>
        </div>

        {/* History */}
        {history && history.length > 1 && (
          <div className="bg-card rounded-lg border p-6 mb-6">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-lg font-semibold w-full text-left"
            >
              <History className="h-5 w-5" />
              Supersession History ({history.length} versions)
            </button>
            {showHistory && (
              <div className="mt-4 space-y-2">
                {history.map((item, i) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border',
                      item.id === commitment.id && 'bg-primary/5 border-primary'
                    )}
                  >
                    <div>
                      <Link
                        href={`/commitments/${item.id}`}
                        className={cn(
                          'font-mono',
                          item.id === commitment.id
                            ? 'font-bold'
                            : 'text-primary hover:underline'
                        )}
                      >
                        {item.commitmentId}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        by {item.committedBy}
                      </p>
                    </div>
                    <div className="text-right">
                      <CommitmentStatusBadge status={item.status} />
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDateTime(new Date(item.committedAt))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Current Atoms (Live State) */}
        {atoms && atoms.length > 0 && (
          <div className="bg-card rounded-lg border p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Current Atom State</h2>
            <p className="text-sm text-muted-foreground mb-4">
              These links show the current state of the atoms, which may have been
              superseded since this commitment.
            </p>
            <div className="space-y-2">
              {atoms.map((atom) => (
                <div
                  key={atom.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{atom.atomId}</span>
                    <StatusBadge status={atom.status} />
                  </div>
                  <Link
                    href={`/atoms/${atom.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    View Current
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        {commitment.metadata && Object.keys(commitment.metadata).length > 0 && (
          <div className="bg-card rounded-lg border p-6 mb-6">
            <h2 className="text-lg font-semibold mb-3">Metadata</h2>
            <pre className="text-sm bg-muted p-4 rounded overflow-x-auto">
              {JSON.stringify(commitment.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </AppLayout>
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

/**
 * Row for displaying an invariant check result
 */
function InvariantCheckRow({ check }: { check: StoredInvariantCheckResult }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 rounded-lg border',
        check.passed
          ? 'border-green-200 bg-green-50'
          : check.severity === 'error'
            ? 'border-red-200 bg-red-50'
            : 'border-yellow-200 bg-yellow-50'
      )}
    >
      <div className="flex items-center gap-3">
        {check.passed ? (
          <CheckCircle className="h-5 w-5 text-green-600" />
        ) : check.severity === 'error' ? (
          <XCircle className="h-5 w-5 text-red-600" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
        )}
        <div>
          <p className="font-medium">{check.name}</p>
          <p className="text-sm text-muted-foreground">{check.message}</p>
        </div>
      </div>
      <span
        className={cn(
          'text-xs px-2 py-1 rounded',
          check.passed
            ? 'bg-green-100 text-green-800'
            : check.severity === 'error'
              ? 'bg-red-100 text-red-800'
              : 'bg-yellow-100 text-yellow-800'
        )}
      >
        {check.passed ? 'Passed' : check.severity === 'error' ? 'Failed' : 'Warning'}
      </span>
    </div>
  );
}

/**
 * Card for displaying a canonical atom snapshot
 */
function AtomSnapshotCard({ snapshot }: { snapshot: CanonicalAtomSnapshot }) {
  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{snapshot.atomId}</span>
          <span className="text-xs px-2 py-0.5 bg-muted rounded capitalize">
            {snapshot.category}
          </span>
        </div>
        <QualityBadge score={snapshot.qualityScore} />
      </div>
      <p className="text-sm text-foreground">{snapshot.description}</p>
      {snapshot.tags && snapshot.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {snapshot.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 bg-muted rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
