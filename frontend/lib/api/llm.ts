/**
 * LLM API Client
 *
 * API functions for LLM provider management, model information,
 * usage tracking, and cost estimation.
 */

import { apiClient } from './client';
import type {
  ProviderListResponse,
  ModelListResponse,
  ModelQuery,
  UsageSummary,
  UsageQuery,
  CostEstimateRequest,
  CostEstimateResponse,
  LLMConfig,
  ProviderTestResult,
  UpdateProviderConfigRequest,
  UpdateBudgetConfigRequest,
  LLMProviderType,
  UsageTrendData,
} from '@/types/llm';

/**
 * LLM API functions
 */
export const llmApi = {
  /**
   * Get all providers and their status
   */
  getProviders: async (): Promise<ProviderListResponse> => {
    const response = await apiClient.get<ProviderListResponse>('/llm/providers');
    return response.data;
  },

  /**
   * Get all available models with capabilities
   */
  getModels: async (query?: ModelQuery): Promise<ModelListResponse> => {
    const response = await apiClient.get<ModelListResponse>('/llm/models', {
      params: query,
    });
    return response.data;
  },

  /**
   * Get usage summary and statistics
   */
  getUsageSummary: async (query?: UsageQuery): Promise<UsageSummary> => {
    const response = await apiClient.get<UsageSummary>('/llm/usage/summary', {
      params: query,
    });
    return response.data;
  },

  /**
   * Estimate cost for an operation
   */
  estimateCost: async (request: CostEstimateRequest): Promise<CostEstimateResponse> => {
    const response = await apiClient.post<CostEstimateResponse>(
      '/llm/estimate',
      request
    );
    return response.data;
  },

  /**
   * Get usage trend data for charts
   */
  getUsageTrends: async (): Promise<UsageTrendData> => {
    const response = await apiClient.get<UsageTrendData>('/llm/usage/trends');
    return response.data;
  },
};

/**
 * LLM Admin API functions
 */
export const llmAdminApi = {
  /**
   * Get current LLM configuration
   */
  getConfig: async (): Promise<LLMConfig> => {
    const response = await apiClient.get<LLMConfig>('/admin/llm/config');
    return response.data;
  },

  /**
   * Update LLM configuration
   */
  updateConfig: async (config: Partial<LLMConfig>): Promise<LLMConfig> => {
    const response = await apiClient.put<LLMConfig>('/admin/llm/config', config);
    return response.data;
  },

  /**
   * Update a specific provider's configuration
   */
  updateProviderConfig: async (
    request: UpdateProviderConfigRequest
  ): Promise<LLMConfig> => {
    // Extract provider from request for URL, send rest as body
    const { provider, ...configUpdate } = request;
    const response = await apiClient.patch<LLMConfig>(
      `/admin/llm/providers/${provider}`,
      configUpdate
    );
    return response.data;
  },

  /**
   * Update budget configuration
   */
  updateBudgetConfig: async (
    request: UpdateBudgetConfigRequest
  ): Promise<LLMConfig> => {
    const response = await apiClient.patch<LLMConfig>(
      '/admin/llm/budget',
      request
    );
    return response.data;
  },

  /**
   * Test provider connectivity
   */
  testProvider: async (provider: LLMProviderType): Promise<ProviderTestResult> => {
    const response = await apiClient.post<ProviderTestResult>(
      '/admin/llm/test-provider',
      { provider }
    );
    return response.data;
  },
};
