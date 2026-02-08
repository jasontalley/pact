import { apiClient } from './client';
import type {
  StartReconciliationDto,
  AnalysisStartResult,
  ReconciliationResult,
  SubmitReviewDto,
  PendingReview,
  ActiveRun,
  RunDetails,
  ReconciliationMetrics,
  RecommendationsResult,
  ApplyRequest,
  ApplyResult,
} from '@/types/reconciliation';

/**
 * Extended timeout for reconciliation operations (5 minutes).
 * Reconciliation can take 3-4+ minutes on large codebases.
 */
const RECONCILIATION_TIMEOUT = 300000;

/**
 * Reconciliation API functions
 */
export const reconciliationApi = {
  /**
   * Check if reconciliation service is available
   */
  getStatus: async (): Promise<{ available: boolean }> => {
    const response = await apiClient.get<{ available: boolean }>(
      '/agents/reconciliation/status'
    );
    return response.data;
  },

  /**
   * Run reconciliation analysis (blocking, no interrupt support)
   */
  analyze: async (data: StartReconciliationDto): Promise<ReconciliationResult> => {
    const response = await apiClient.post<ReconciliationResult>(
      '/agents/reconciliation/analyze',
      data,
      { timeout: RECONCILIATION_TIMEOUT }
    );
    return response.data;
  },

  /**
   * Start reconciliation with interrupt support for human review
   */
  start: async (data: StartReconciliationDto): Promise<AnalysisStartResult> => {
    const response = await apiClient.post<AnalysisStartResult>(
      '/agents/reconciliation/start',
      data,
      { timeout: RECONCILIATION_TIMEOUT }
    );
    return response.data;
  },

  /**
   * Get pending review data for an interrupted run
   */
  getPendingReview: async (runId: string): Promise<PendingReview> => {
    const response = await apiClient.get<PendingReview>(
      `/agents/reconciliation/runs/${runId}/pending`
    );
    return response.data;
  },

  /**
   * Submit review decisions and resume reconciliation
   */
  submitReview: async (
    runId: string,
    data: SubmitReviewDto
  ): Promise<ReconciliationResult> => {
    const response = await apiClient.post<ReconciliationResult>(
      `/agents/reconciliation/runs/${runId}/review`,
      data,
      { timeout: RECONCILIATION_TIMEOUT }
    );
    return response.data;
  },

  /**
   * Get run status
   */
  getRunStatus: async (runId: string): Promise<{ runId: string; status: string | null }> => {
    const response = await apiClient.get<{ runId: string; status: string | null }>(
      `/agents/reconciliation/runs/${runId}/status`
    );
    return response.data;
  },

  /**
   * Get quality metrics for a run
   */
  getMetrics: async (runId: string): Promise<ReconciliationMetrics> => {
    const response = await apiClient.get<ReconciliationMetrics>(
      `/agents/reconciliation/runs/${runId}/metrics`
    );
    return response.data;
  },

  /**
   * List all active runs
   */
  listRuns: async (): Promise<ActiveRun[]> => {
    const response = await apiClient.get<ActiveRun[]>(
      '/agents/reconciliation/runs'
    );
    return response.data;
  },

  /**
   * Get run details
   */
  getRunDetails: async (runId: string): Promise<RunDetails> => {
    const response = await apiClient.get<RunDetails>(
      `/agents/reconciliation/runs/${runId}`
    );
    return response.data;
  },

  /**
   * Get recommendations for a run
   */
  getRecommendations: async (runId: string): Promise<RecommendationsResult> => {
    const response = await apiClient.get<RecommendationsResult>(
      `/agents/reconciliation/runs/${runId}/recommendations`
    );
    return response.data;
  },

  /**
   * Apply recommendations from a run
   */
  apply: async (runId: string, data: ApplyRequest): Promise<ApplyResult> => {
    const response = await apiClient.post<ApplyResult>(
      `/agents/reconciliation/runs/${runId}/apply`,
      data
    );
    return response.data;
  },

  /**
   * Cancel an active reconciliation run
   */
  cancel: async (runId: string): Promise<{ runId: string; status: string; message: string }> => {
    const response = await apiClient.post<{ runId: string; status: string; message: string }>(
      `/agents/reconciliation/runs/${runId}/cancel`
    );
    return response.data;
  },

  /**
   * Create a governed change set from a reconciliation run.
   * Instead of applying directly, atoms are created as 'proposed' and
   * must go through change set approval before being committed to Main.
   */
  createChangeSet: async (
    runId: string,
    data: { selections?: string[]; name?: string; description?: string }
  ): Promise<{ changeSetId: string; atomCount: number; moleculeId: string }> => {
    const response = await apiClient.post<{ changeSetId: string; atomCount: number; moleculeId: string }>(
      `/agents/reconciliation/runs/${runId}/create-change-set`,
      data
    );
    return response.data;
  },
};
