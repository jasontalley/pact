import { apiClient } from './client';

export interface ConflictResolution {
  action: string;
  resolvedBy: string;
  resolvedAt: string;
  reason?: string;
}

export interface ConflictRecord {
  id: string;
  conflictType: 'same_test' | 'semantic_overlap' | 'contradiction' | 'cross_boundary';
  atomIdA: string;
  atomIdB: string;
  testRecordId: string | null;
  similarityScore: number | null;
  description: string;
  status: 'open' | 'resolved' | 'escalated';
  resolution: ConflictResolution | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ConflictMetrics {
  total: number;
  open: number;
  resolved: number;
  escalated: number;
  byType: {
    same_test: number;
    semantic_overlap: number;
    contradiction: number;
    cross_boundary: number;
  };
}

export interface ConflictFilters {
  status?: string;
  type?: string;
  atomId?: string;
}

export interface ResolveConflictDto {
  action: string;
  resolvedBy: string;
  reason?: string;
}

export const conflictsApi = {
  list: async (filters?: ConflictFilters): Promise<ConflictRecord[]> => {
    const response = await apiClient.get<ConflictRecord[]>('/conflicts', { params: filters });
    return response.data;
  },

  get: async (id: string): Promise<ConflictRecord> => {
    const response = await apiClient.get<ConflictRecord>(`/conflicts/${id}`);
    return response.data;
  },

  getMetrics: async (): Promise<ConflictMetrics> => {
    const response = await apiClient.get<ConflictMetrics>('/conflicts/metrics');
    return response.data;
  },

  resolve: async (id: string, data: ResolveConflictDto): Promise<ConflictRecord> => {
    const response = await apiClient.patch<ConflictRecord>(`/conflicts/${id}/resolve`, data);
    return response.data;
  },

  escalate: async (id: string): Promise<ConflictRecord> => {
    const response = await apiClient.patch<ConflictRecord>(`/conflicts/${id}/escalate`);
    return response.data;
  },
};
