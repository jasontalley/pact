import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reconciliationApi } from '@/lib/api/reconciliation';
import type {
  StartReconciliationDto,
  SubmitReviewDto,
  ApplyRequest,
  PreReadPayload,
} from '@/types/reconciliation';
import { toast } from 'sonner';

/**
 * Query key factory for reconciliation
 */
export const reconciliationKeys = {
  all: ['reconciliation'] as const,
  status: () => [...reconciliationKeys.all, 'status'] as const,
  runs: () => [...reconciliationKeys.all, 'runs'] as const,
  run: (runId: string) => [...reconciliationKeys.all, 'run', runId] as const,
  runStatus: (runId: string) => [...reconciliationKeys.run(runId), 'status'] as const,
  runMetrics: (runId: string) => [...reconciliationKeys.run(runId), 'metrics'] as const,
  runRecommendations: (runId: string) => [...reconciliationKeys.run(runId), 'recommendations'] as const,
  pendingReview: (runId: string) => [...reconciliationKeys.run(runId), 'pending'] as const,
};

/**
 * Hook to check if reconciliation service is available
 */
export function useReconciliationStatus() {
  return useQuery({
    queryKey: reconciliationKeys.status(),
    queryFn: () => reconciliationApi.getStatus(),
    refetchInterval: 30000, // Check every 30 seconds
  });
}

/**
 * Hook to list active runs
 */
export function useActiveRuns() {
  return useQuery({
    queryKey: reconciliationKeys.runs(),
    queryFn: () => reconciliationApi.listRuns(),
  });
}

/**
 * Hook to get run details
 */
export function useRunDetails(runId: string | null) {
  return useQuery({
    queryKey: runId ? reconciliationKeys.run(runId) : ['disabled'],
    queryFn: () => reconciliationApi.getRunDetails(runId!),
    enabled: !!runId,
  });
}

/**
 * Hook to get run status
 */
export function useRunStatus(runId: string | null) {
  return useQuery({
    queryKey: runId ? reconciliationKeys.runStatus(runId) : ['disabled'],
    queryFn: () => reconciliationApi.getRunStatus(runId!),
    enabled: !!runId,
    refetchInterval: (query) => {
      // Poll every 2 seconds while running
      if (query.state.data?.status === 'running') return 2000;
      return false;
    },
  });
}

/**
 * Hook to get run metrics
 */
export function useRunMetrics(runId: string | null) {
  return useQuery({
    queryKey: runId ? reconciliationKeys.runMetrics(runId) : ['disabled'],
    queryFn: () => reconciliationApi.getMetrics(runId!),
    enabled: !!runId,
  });
}

/**
 * Hook to get pending review data
 */
export function usePendingReview(runId: string | null) {
  return useQuery({
    queryKey: runId ? reconciliationKeys.pendingReview(runId) : ['disabled'],
    queryFn: () => reconciliationApi.getPendingReview(runId!),
    enabled: !!runId,
  });
}

/**
 * Hook to get recommendations
 */
export function useRecommendations(runId: string | null) {
  return useQuery({
    queryKey: runId ? reconciliationKeys.runRecommendations(runId) : ['disabled'],
    queryFn: () => reconciliationApi.getRecommendations(runId!),
    enabled: !!runId,
  });
}

/**
 * Hook to start reconciliation with interrupt support
 */
export function useStartReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: StartReconciliationDto) => reconciliationApi.start(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.runs() });

      if (result.completed) {
        toast.success(
          `Reconciliation complete: ${result.result?.summary.inferredAtomsCount || 0} atoms inferred`
        );
      } else {
        toast.info('Reconciliation paused for review');
      }
    },
    onError: (error: Error) => {
      toast.error(`Reconciliation failed: ${error.message}`);
    },
  });
}

/**
 * Hook to start reconciliation with pre-read content (browser-uploaded files)
 */
export function useStartPreReadReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PreReadPayload) => reconciliationApi.startPreRead(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.runs() });
    },
    onError: (error: Error) => {
      toast.error(`Reconciliation failed: ${error.message}`);
    },
  });
}

/**
 * Hook to start reconciliation from GitHub
 */
export function useStartGitHubReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { commitSha?: string; branch?: string; repo?: string }) =>
      reconciliationApi.startFromGitHub(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.runs() });
    },
    onError: (error: Error) => {
      toast.error(`GitHub reconciliation failed: ${error.message}`);
    },
  });
}

/**
 * Hook to run reconciliation without interrupt (blocking)
 */
export function useAnalyzeReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: StartReconciliationDto) => reconciliationApi.analyze(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.runs() });
      toast.success(
        `Analysis complete: ${result.summary.inferredAtomsCount} atoms inferred`
      );
    },
    onError: (error: Error) => {
      toast.error(`Analysis failed: ${error.message}`);
    },
  });
}

/**
 * Hook to submit review decisions
 */
export function useSubmitReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ runId, data }: { runId: string; data: SubmitReviewDto }) =>
      reconciliationApi.submitReview(runId, data),
    onSuccess: (result, { runId }) => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.run(runId) });
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.runs() });
      toast.success(
        `Review submitted: ${result.summary.inferredAtomsCount} atoms ready`
      );
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit review: ${error.message}`);
    },
  });
}

/**
 * Hook to apply recommendations
 */
export function useApplyRecommendations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ runId, data }: { runId: string; data: ApplyRequest }) =>
      reconciliationApi.apply(runId, data),
    onSuccess: (result, { runId }) => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.run(runId) });
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.runs() });
      // Invalidate atoms list since we created new ones
      queryClient.invalidateQueries({ queryKey: ['atoms'] });

      if (result.status === 'success') {
        toast.success(
          `Created ${result.atomsCreated} atoms and ${result.moleculesCreated} molecules`
        );
      } else if (result.status === 'partial') {
        toast.warning(
          `Partially applied: ${result.atomsCreated} atoms, ${result.moleculesCreated} molecules`
        );
      } else if (result.status === 'rolled_back') {
        toast.error(`Apply failed and was rolled back: ${result.error}`);
      } else {
        toast.error(`Apply failed: ${result.error}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to apply recommendations: ${error.message}`);
    },
  });
}

/**
 * Hook to create a governed change set from reconciliation results.
 * Creates proposed atoms that must go through approval before reaching Main.
 */
export function useCreateChangeSetFromRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      runId,
      data,
    }: {
      runId: string;
      data: { selections?: string[]; name?: string; description?: string };
    }) => reconciliationApi.createChangeSet(runId, data),
    onSuccess: (result, { runId }) => {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.run(runId) });
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.runs() });
      queryClient.invalidateQueries({ queryKey: ['atoms'] });
      queryClient.invalidateQueries({ queryKey: ['change-sets'] });

      toast.success(
        `Change set created with ${result.atomCount} proposed atoms. Submit for review to promote to Main.`
      );
    },
    onError: (error: Error) => {
      toast.error(`Failed to create change set: ${error.message}`);
    },
  });
}
