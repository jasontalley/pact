import { apiClient } from './client';
import type {
  RepositoryConfig,
  UpdateRepositoryConfigRequest,
  ValidatePathResult,
} from '@/types/repository';

export const repositoryAdminApi = {
  getConfig: async (): Promise<RepositoryConfig> => {
    const response = await apiClient.get<RepositoryConfig>('/admin/repository/config');
    return response.data;
  },

  updateConfig: async (
    request: UpdateRepositoryConfigRequest,
  ): Promise<RepositoryConfig> => {
    const response = await apiClient.put<RepositoryConfig>(
      '/admin/repository/config',
      request,
    );
    return response.data;
  },

  validatePath: async (path: string): Promise<ValidatePathResult> => {
    const response = await apiClient.post<ValidatePathResult>(
      '/admin/repository/validate-path',
      { path },
    );
    return response.data;
  },
};
