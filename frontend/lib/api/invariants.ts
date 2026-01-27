import { apiClient } from './client';
import type {
  InvariantConfig,
  CreateInvariantDto,
  UpdateInvariantDto,
} from '@/types/invariant';

/**
 * Invariant API functions
 */
export const invariantsApi = {
  /**
   * List all invariants (optionally filtered by project)
   */
  list: async (projectId?: string): Promise<InvariantConfig[]> => {
    const params = projectId ? { projectId } : undefined;
    const response = await apiClient.get<InvariantConfig[]>('/invariants', { params });
    return response.data;
  },

  /**
   * List enabled invariants (optionally filtered by project)
   */
  listEnabled: async (projectId?: string): Promise<InvariantConfig[]> => {
    const params = projectId ? { projectId } : undefined;
    const response = await apiClient.get<InvariantConfig[]>('/invariants/enabled', { params });
    return response.data;
  },

  /**
   * Get a single invariant by ID
   */
  get: async (id: string): Promise<InvariantConfig> => {
    const response = await apiClient.get<InvariantConfig>(`/invariants/${id}`);
    return response.data;
  },

  /**
   * Create a custom invariant
   */
  create: async (data: CreateInvariantDto): Promise<InvariantConfig> => {
    const response = await apiClient.post<InvariantConfig>('/invariants', data);
    return response.data;
  },

  /**
   * Update an invariant
   */
  update: async (id: string, data: UpdateInvariantDto): Promise<InvariantConfig> => {
    const response = await apiClient.patch<InvariantConfig>(`/invariants/${id}`, data);
    return response.data;
  },

  /**
   * Delete a custom invariant (built-in cannot be deleted)
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/invariants/${id}`);
  },

  /**
   * Enable an invariant
   */
  enable: async (id: string): Promise<InvariantConfig> => {
    const response = await apiClient.patch<InvariantConfig>(`/invariants/${id}/enable`);
    return response.data;
  },

  /**
   * Disable an invariant
   */
  disable: async (id: string): Promise<InvariantConfig> => {
    const response = await apiClient.patch<InvariantConfig>(`/invariants/${id}/disable`);
    return response.data;
  },

  /**
   * Copy a global invariant for project-specific configuration
   */
  copyForProject: async (invariantId: string, projectId: string): Promise<InvariantConfig> => {
    const response = await apiClient.post<InvariantConfig>(
      `/invariants/copy/${invariantId}/project/${projectId}`
    );
    return response.data;
  },
};
