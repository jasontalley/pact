import { apiClient } from './client';

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreateKeyResult {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  createdAt: string;
}

export const apiKeysApi = {
  list: async (): Promise<ApiKeyInfo[]> => {
    const response = await apiClient.get<ApiKeyInfo[]>('/admin/api-keys');
    return response.data;
  },

  create: async (name: string): Promise<CreateKeyResult> => {
    const response = await apiClient.post<CreateKeyResult>('/admin/api-keys', { name });
    return response.data;
  },

  revoke: async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/api-keys/${id}`);
  },
};
