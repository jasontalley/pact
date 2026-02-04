import { apiClient } from './client';

export interface CoverageDimensionSummary {
  total: number;
  covered: number;
  pct: number;
}

export interface CoverageSummary {
  statements: CoverageDimensionSummary;
  branches: CoverageDimensionSummary;
  functions: CoverageDimensionSummary;
  lines: CoverageDimensionSummary;
}

export interface CoverageFileDetail {
  filePath: string;
  statements: CoverageDimensionSummary;
  branches: CoverageDimensionSummary;
  functions: CoverageDimensionSummary;
  lines: CoverageDimensionSummary;
  uncoveredLines: number[];
}

export interface CoverageReportResponse {
  id: string;
  projectId: string | null;
  reconciliationRunId: string | null;
  format: string;
  commitHash: string | null;
  branchName: string | null;
  summary: CoverageSummary;
  fileDetails: CoverageFileDetail[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CoverageHistoryResponse {
  reports: CoverageReportResponse[];
  total: number;
  limit: number;
  offset: number;
}

export const coverageApi = {
  getLatest: async (projectId?: string): Promise<CoverageReportResponse> => {
    const params = projectId ? { projectId } : {};
    const response = await apiClient.get<CoverageReportResponse>('/coverage/latest', { params });
    return response.data;
  },

  getById: async (id: string): Promise<CoverageReportResponse> => {
    const response = await apiClient.get<CoverageReportResponse>(`/coverage/${id}`);
    return response.data;
  },

  getHistory: async (params?: {
    projectId?: string;
    limit?: number;
    offset?: number;
  }): Promise<CoverageHistoryResponse> => {
    const response = await apiClient.get<CoverageHistoryResponse>('/coverage/history', { params });
    return response.data;
  },

  upload: async (content: string, options?: {
    format?: string;
    projectId?: string;
    commitHash?: string;
    branchName?: string;
  }): Promise<CoverageReportResponse> => {
    const response = await apiClient.post<CoverageReportResponse>('/coverage/upload', {
      content,
      ...options,
    });
    return response.data;
  },
};
