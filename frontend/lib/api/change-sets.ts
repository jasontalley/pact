import { apiClient } from './client';

export interface ChangeSetSummary {
  id: string;
  name: string;
  description?: string;
  lensType: 'change_set';
  changeSetMetadata: {
    status: 'draft' | 'review' | 'approved' | 'committed' | 'rejected';
    createdBy: string;
    summary?: string;
    approvals: Array<{
      reviewer: string;
      decision: 'approved' | 'rejected';
      comment?: string;
      timestamp: string;
    }>;
    requiredApprovals: number;
    submittedAt?: string;
    committedAt?: string;
    committedAtomIds?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface ChangeSetDetail {
  molecule: ChangeSetSummary;
  atoms: Array<{
    id: string;
    atomId: string;
    description: string;
    status: string;
    qualityScore: number | null;
    category?: string;
  }>;
}

export const changeSetsApi = {
  list: async (status?: string): Promise<ChangeSetSummary[]> => {
    const params = status ? { status } : undefined;
    const response = await apiClient.get<ChangeSetSummary[]>('/change-sets', { params });
    return response.data;
  },

  get: async (id: string): Promise<ChangeSetDetail> => {
    const response = await apiClient.get<ChangeSetDetail>(`/change-sets/${id}`);
    return response.data;
  },

  create: async (data: { name: string; description?: string; summary?: string }): Promise<ChangeSetSummary> => {
    const response = await apiClient.post<ChangeSetSummary>('/change-sets', data);
    return response.data;
  },

  addAtom: async (changeSetId: string, atomId: string): Promise<void> => {
    await apiClient.post(`/change-sets/${changeSetId}/atoms`, { atomId });
  },

  submit: async (id: string): Promise<ChangeSetSummary> => {
    const response = await apiClient.post<ChangeSetSummary>(`/change-sets/${id}/submit`);
    return response.data;
  },

  approve: async (id: string, data: { decision: 'approved' | 'rejected'; comment?: string }): Promise<ChangeSetSummary> => {
    const response = await apiClient.post<ChangeSetSummary>(`/change-sets/${id}/approve`, data);
    return response.data;
  },

  commit: async (id: string): Promise<ChangeSetSummary> => {
    const response = await apiClient.post<ChangeSetSummary>(`/change-sets/${id}/commit`);
    return response.data;
  },
};
