import { apiClient } from './client';
import type {
  DriftItem,
  DriftListResponse,
  DriftSummaryResponse,
  DriftAgingResponse,
  ConvergenceReportResponse,
  DriftTrendResponse,
  DriftDetectionResult,
  DriftListParams,
} from '@/types/drift';

export const driftApi = {
  /**
   * List drift items (paginated, filterable)
   */
  list: async (params?: DriftListParams): Promise<DriftListResponse> => {
    const response = await apiClient.get<DriftListResponse>('/drift', { params });
    return response.data;
  },

  /**
   * Get drift summary (aggregated counts)
   */
  getSummary: async (projectId?: string): Promise<DriftSummaryResponse> => {
    const params = projectId ? { projectId } : {};
    const response = await apiClient.get<DriftSummaryResponse>('/drift/summary', { params });
    return response.data;
  },

  /**
   * Get single drift item details
   */
  getItem: async (id: string): Promise<DriftItem> => {
    const response = await apiClient.get<DriftItem>(`/drift/${id}`);
    return response.data;
  },

  /**
   * Acknowledge a drift item
   */
  acknowledge: async (id: string, comment?: string): Promise<DriftItem> => {
    const response = await apiClient.patch<DriftItem>(`/drift/${id}/acknowledge`, { comment });
    return response.data;
  },

  /**
   * Waive a drift item (justification required)
   */
  waive: async (id: string, justification: string): Promise<DriftItem> => {
    const response = await apiClient.patch<DriftItem>(`/drift/${id}/waive`, { justification });
    return response.data;
  },

  /**
   * Manually resolve a drift item
   */
  resolve: async (id: string): Promise<DriftItem> => {
    const response = await apiClient.patch<DriftItem>(`/drift/${id}/resolve`);
    return response.data;
  },

  /**
   * Get overdue drift items
   */
  getOverdue: async (projectId?: string): Promise<DriftListResponse> => {
    const params = projectId ? { projectId } : {};
    const response = await apiClient.get<DriftListResponse>('/drift/overdue', { params });
    return response.data;
  },

  /**
   * Get aging distribution
   */
  getAging: async (projectId?: string): Promise<DriftAgingResponse> => {
    const params = projectId ? { projectId } : {};
    const response = await apiClient.get<DriftAgingResponse>('/drift/aging', { params });
    return response.data;
  },

  /**
   * Get convergence report
   */
  getConvergence: async (projectId?: string): Promise<ConvergenceReportResponse> => {
    const params = projectId ? { projectId } : {};
    const response = await apiClient.get<ConvergenceReportResponse>('/drift/convergence', {
      params,
    });
    return response.data;
  },

  /**
   * Get drift trend over time
   */
  getTrend: async (
    period?: 'week' | 'month' | 'quarter',
    projectId?: string,
  ): Promise<DriftTrendResponse> => {
    const params = { period, projectId };
    const response = await apiClient.get<DriftTrendResponse>('/drift/trend', { params });
    return response.data;
  },

  /**
   * Trigger drift detection for a run
   */
  triggerDetection: async (runId: string): Promise<DriftDetectionResult> => {
    const response = await apiClient.post<DriftDetectionResult>(`/drift/detect/${runId}`);
    return response.data;
  },
};
