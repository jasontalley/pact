'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppLayout } from '@/components/layout';
import { useDriftItem, useAcknowledgeDrift, useWaiveDrift, useResolveDrift } from '@/hooks/drift';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from '@/lib/utils/format';
import { DRIFT_TYPE_LABELS, SEVERITY_LABELS, SEVERITY_COLORS, DRIFT_STATUS_COLORS } from '@/types/drift';

export default function DriftDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: item, isLoading, error } = useDriftItem(id);
  const acknowledgeMutation = useAcknowledgeDrift();
  const waiveMutation = useWaiveDrift();
  const resolveMutation = useResolveDrift();

  const handleAcknowledge = async () => {
    const comment = prompt('Optional comment:') || undefined;
    await acknowledgeMutation.mutateAsync({ id, comment });
  };

  const handleWaive = async () => {
    const justification = prompt('Please provide a justification for waiving this drift item:');
    if (justification) {
      await waiveMutation.mutateAsync({ id, justification });
    }
  };

  const handleResolve = async () => {
    if (confirm('Are you sure you want to manually resolve this drift item?')) {
      await resolveMutation.mutateAsync(id);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-4 w-3/4 bg-muted rounded" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !item) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold">Drift Item Not Found</h2>
            <p className="text-muted-foreground mt-2">
              The drift item you're looking for doesn't exist.
            </p>
            <Link href="/drift" className="text-primary hover:underline mt-4 inline-block">
              Back to Drift Management
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const isOverdue = !!(item.dueAt && new Date(item.dueAt) < new Date());

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl">
        {/* Breadcrumb */}
        <div className="mb-4">
          <Link href="/drift" className="text-sm text-muted-foreground hover:underline">
            ← Back to Drift Management
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                  SEVERITY_COLORS[item.severity]
                )}
              >
                {SEVERITY_LABELS[item.severity]}
              </span>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                  DRIFT_STATUS_COLORS[item.status]
                )}
              >
                {item.status}
              </span>
              {isOverdue && (
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  OVERDUE
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold">{DRIFT_TYPE_LABELS[item.driftType]}</h2>
          </div>

          {/* Actions */}
          {item.status === 'open' && (
            <div className="flex gap-2">
              <button
                onClick={handleAcknowledge}
                disabled={acknowledgeMutation.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                Acknowledge
              </button>
              <button
                onClick={handleWaive}
                disabled={waiveMutation.isPending}
                className="px-4 py-2 border rounded text-sm hover:bg-muted disabled:opacity-50"
              >
                Waive
              </button>
              <button
                onClick={handleResolve}
                disabled={resolveMutation.isPending}
                className="px-4 py-2 border rounded text-sm hover:bg-muted disabled:opacity-50"
              >
                Resolve
              </button>
            </div>
          )}

          {item.status === 'acknowledged' && (
            <div className="flex gap-2">
              <button
                onClick={handleWaive}
                disabled={waiveMutation.isPending}
                className="px-4 py-2 border rounded text-sm hover:bg-muted disabled:opacity-50"
              >
                Waive
              </button>
              <button
                onClick={handleResolve}
                disabled={resolveMutation.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                Resolve
              </button>
            </div>
          )}
        </div>

        {/* Description */}
        <div className="rounded-lg border bg-card p-4 mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
          <p className="text-sm">{item.description}</p>
        </div>

        {/* Source References */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {item.filePath && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">File</h3>
              <code className="text-sm break-all">{item.filePath}</code>
              {item.testName && (
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground">Test: </span>
                  <code className="text-xs">{item.testName}</code>
                </div>
              )}
            </div>
          )}

          {item.atomId && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Linked Atom</h3>
              <Link
                href={`/atoms/${item.atomId}`}
                className="text-sm text-primary hover:underline"
              >
                {item.atomDisplayId || item.atomId}
              </Link>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="rounded-lg border bg-card p-4 mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Timeline</h3>
          <div className="space-y-4">
            <TimelineItem
              label="Detected"
              date={item.detectedAt}
              detail={`Run ${item.detectedByRunId.slice(0, 8)}`}
            />
            <TimelineItem
              label="Last Confirmed"
              date={item.lastConfirmedAt}
              detail={`${item.confirmationCount} confirmations`}
            />
            {item.dueAt && (
              <TimelineItem
                label="Due"
                date={item.dueAt}
                highlight={isOverdue}
              />
            )}
            {item.resolvedAt && (
              <TimelineItem
                label="Resolved"
                date={item.resolvedAt}
                success
              />
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{item.ageDays}</div>
            <div className="text-xs text-muted-foreground">Days Old</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{item.confirmationCount}</div>
            <div className="text-xs text-muted-foreground">Confirmations</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-sm font-medium">
              {item.exceptionLane || 'normal'}
            </div>
            <div className="text-xs text-muted-foreground">Exception Lane</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-sm font-medium truncate">
              {item.projectId?.slice(0, 8) || 'Global'}
            </div>
            <div className="text-xs text-muted-foreground">Project</div>
          </div>
        </div>

        {/* Exception Justification */}
        {item.exceptionJustification && (
          <div className="rounded-lg border bg-card p-4 mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Exception Justification
            </h3>
            <p className="text-sm">{item.exceptionJustification}</p>
          </div>
        )}

        {/* Additional Metadata */}
        {item.metadata && Object.keys(item.metadata).length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Metadata</h3>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(item.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function TimelineItem({
  label,
  date,
  detail,
  highlight,
  success,
}: {
  label: string;
  date: string;
  detail?: string;
  highlight?: boolean;
  success?: boolean;
}) {
  const dateObj = new Date(date);
  const isPast = dateObj < new Date();

  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          'w-2 h-2 mt-1.5 rounded-full',
          success
            ? 'bg-green-500'
            : highlight
              ? 'bg-red-500'
              : 'bg-muted-foreground'
        )}
      />
      <div>
        <div
          className={cn(
            'text-sm font-medium',
            highlight && 'text-red-600 dark:text-red-400',
            success && 'text-green-600 dark:text-green-400'
          )}
        >
          {label}
        </div>
        <div className="text-xs text-muted-foreground">
          {dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString()}
          {!isPast && label === 'Due' && (
            <span className="ml-2">
              (in {formatDistanceToNow(dateObj)})
            </span>
          )}
          {isPast && label === 'Due' && (
            <span className="ml-2 text-red-600 dark:text-red-400">
              ({formatDistanceToNow(dateObj)} ago)
            </span>
          )}
        </div>
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
      </div>
    </div>
  );
}
