'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';

/**
 * Recoverable run info from API
 */
interface RecoverableRun {
  runId: string;
  runUuid: string;
  status: string;
  createdAt: string;
  rootDirectory: string;
  mode: string;
  atomCount: number;
  moleculeCount: number;
  testCount: number;
  lastError?: string;
}

/**
 * Recovery result from API
 */
interface RecoveryResult {
  runId: string;
  runUuid: string;
  recovered: boolean;
  atomCount: number;
  moleculeCount: number;
  testCount: number;
  message: string;
}

/**
 * Fetch recoverable runs
 */
async function fetchRecoverableRuns(): Promise<RecoverableRun[]> {
  const response = await apiClient.get<RecoverableRun[]>(
    '/agents/reconciliation/recoverable'
  );
  return response.data;
}

/**
 * Recover a run
 */
async function recoverRun(runId: string): Promise<RecoveryResult> {
  const response = await apiClient.post<RecoveryResult>(
    `/agents/reconciliation/runs/${runId}/recover`
  );
  return response.data;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

interface ReconciliationHistoryProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onRecovered?: (runId: string) => void;
}

/**
 * ReconciliationHistory - View and recover past reconciliation runs
 *
 * Shows runs that were interrupted or failed but have partial results
 * that can be recovered and reviewed.
 */
export function ReconciliationHistory({
  open,
  onOpenChange,
  onRecovered,
}: ReconciliationHistoryProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<RecoverableRun | null>(null);

  const {
    data: runs,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['recoverable-runs'],
    queryFn: fetchRecoverableRuns,
    enabled: open,
  });

  const recoverMutation = useMutation({
    mutationFn: recoverRun,
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ['recoverable-runs'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      onRecovered?.(result.runId);
      onOpenChange?.(false);
      // Navigate to the run detail page so user can review recommendations
      router.push(`/reconciliation/${result.runId}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to recover run: ${error.message}`);
    },
  });

  const handleRecover = (run: RecoverableRun) => {
    recoverMutation.mutate(run.runId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Reconciliation History</DialogTitle>
          <DialogDescription>
            View and recover past reconciliation runs that have partial results
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              Failed to load runs: {(error as Error).message}
            </div>
          ) : runs && runs.length > 0 ? (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {runs.map((run) => (
                  <Card
                    key={run.runId}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-muted/50',
                      selectedRun?.runId === run.runId && 'ring-2 ring-primary'
                    )}
                    onClick={() => setSelectedRun(run)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-mono text-sm font-medium">
                              {run.runId}
                            </span>
                            <Badge
                              variant={
                                run.status === 'running'
                                  ? 'secondary'
                                  : run.status === 'failed'
                                  ? 'destructive'
                                  : 'outline'
                              }
                            >
                              {run.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(run.createdAt)}
                            </span>
                          </div>

                          <p className="text-sm text-muted-foreground truncate mb-2">
                            {run.rootDirectory}
                          </p>

                          <div className="flex items-center gap-4 text-sm">
                            <span>
                              <strong>{run.atomCount}</strong> atoms
                            </span>
                            <span>
                              <strong>{run.moleculeCount}</strong> molecules
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {run.mode}
                            </Badge>
                          </div>

                          {run.lastError && (
                            <p className="text-xs text-red-500 mt-2 line-clamp-2">
                              {run.lastError}
                            </p>
                          )}
                        </div>

                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRecover(run);
                          }}
                          disabled={recoverMutation.isPending}
                        >
                          {recoverMutation.isPending &&
                          recoverMutation.variables === run.runId
                            ? 'Recovering...'
                            : 'Recover'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-muted-foreground">No recoverable runs found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Interrupted or failed runs with partial results will appear here
              </p>
            </div>
          )}
        </div>

        {/* Details Panel */}
        {selectedRun && (
          <Card className="mt-4">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm">Run Details</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Run ID:</span>{' '}
                  <span className="font-mono">{selectedRun.runId}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>{' '}
                  {formatDate(selectedRun.createdAt)}
                </div>
                <div>
                  <span className="text-muted-foreground">Mode:</span>{' '}
                  {selectedRun.mode}
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{' '}
                  {selectedRun.status}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Directory:</span>{' '}
                  <span className="font-mono text-xs">{selectedRun.rootDirectory}</span>
                </div>
                {selectedRun.lastError && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Error:</span>{' '}
                    <span className="text-red-500">{selectedRun.lastError}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}
