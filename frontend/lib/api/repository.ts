import { apiClient } from './client';
import type {
  RepositoryConfig,
  UpdateRepositoryConfigRequest,
  ValidatePathResult,
} from '@/types/repository';

export interface GitHubConfigResponse {
  owner?: string;
  repo?: string;
  patSet: boolean;
  defaultBranch?: string;
  enabled?: boolean;
  lastTestedAt?: string;
}

export interface UpdateGitHubConfigRequest {
  owner?: string;
  repo?: string;
  pat?: string;
  defaultBranch?: string;
  enabled?: boolean;
}

export interface GitHubTestResult {
  success: boolean;
  repoName?: string;
  defaultBranch?: string;
  error?: string;
  latencyMs?: number;
}

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

  getGitHubConfig: async (): Promise<GitHubConfigResponse> => {
    const response = await apiClient.get<GitHubConfigResponse>('/admin/repository/github');
    return response.data;
  },

  updateGitHubConfig: async (data: UpdateGitHubConfigRequest): Promise<GitHubConfigResponse> => {
    const response = await apiClient.patch<GitHubConfigResponse>('/admin/repository/github', data);
    return response.data;
  },

  testGitHubConnection: async (): Promise<GitHubTestResult> => {
    const response = await apiClient.post<GitHubTestResult>('/admin/repository/test-github');
    return response.data;
  },
};
