/**
 * LLM React Query Hooks
 *
 * Hooks for managing LLM providers, models, and usage data.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { llmApi, llmAdminApi } from '@/lib/api/llm';
import type {
  ModelQuery,
  UsageQuery,
  CostEstimateRequest,
  LLMProviderType,
  AgentTaskType,
  BudgetMode,
  LLMConfig,
  UpdateProviderConfigRequest,
  UpdateBudgetConfigRequest,
} from '@/types/llm';
import { toast } from 'sonner';

/**
 * Query key factory for LLM
 */
export const llmKeys = {
  all: ['llm'] as const,
  providers: () => [...llmKeys.all, 'providers'] as const,
  models: () => [...llmKeys.all, 'models'] as const,
  modelList: (query?: ModelQuery) => [...llmKeys.models(), query] as const,
  usage: () => [...llmKeys.all, 'usage'] as const,
  usageSummary: (query?: UsageQuery) => [...llmKeys.usage(), 'summary', query] as const,
  estimate: () => [...llmKeys.all, 'estimate'] as const,
};

/**
 * Hook to fetch all LLM providers and their status
 *
 * @returns Query result with provider list and availability
 */
export function useProviders() {
  return useQuery({
    queryKey: llmKeys.providers(),
    queryFn: () => llmApi.getProviders(),
    staleTime: 30000, // Consider stale after 30s
    refetchInterval: 60000, // Refetch every 60s for health updates
  });
}

/**
 * Hook to fetch available models with optional filtering
 *
 * @param query - Optional filter parameters
 * @returns Query result with model list
 */
export function useModels(query?: ModelQuery) {
  return useQuery({
    queryKey: llmKeys.modelList(query),
    queryFn: () => llmApi.getModels(query),
    staleTime: 60000, // Models don't change often
  });
}

/**
 * Hook to fetch models for a specific provider
 *
 * @param provider - Provider to filter by
 * @returns Query result with provider-specific models
 */
export function useProviderModels(provider: LLMProviderType) {
  return useModels({ provider });
}

/**
 * Hook to fetch usage summary and statistics
 *
 * @param query - Optional period/date range
 * @returns Query result with usage summary
 */
export function useLLMUsage(query?: UsageQuery) {
  return useQuery({
    queryKey: llmKeys.usageSummary(query),
    queryFn: () => llmApi.getUsageSummary(query),
    staleTime: 30000, // Refresh fairly often for live data
  });
}

/**
 * Hook to estimate cost for an operation
 *
 * @returns Mutation for cost estimation
 */
export function useEstimateCost() {
  return useMutation({
    mutationFn: (request: CostEstimateRequest) => llmApi.estimateCost(request),
    onError: (error: Error) => {
      toast.error(`Failed to estimate cost: ${error.message}`);
    },
  });
}

/**
 * Hook to get quick cost estimate with caching
 *
 * @param taskType - Type of task
 * @param inputTokens - Estimated input tokens
 * @param outputTokens - Estimated output tokens
 * @param budgetMode - Budget mode (optional)
 * @returns Query result with cost estimate
 */
export function useCostEstimate(
  taskType: AgentTaskType,
  inputTokens: number,
  outputTokens: number,
  budgetMode?: BudgetMode
) {
  const request: CostEstimateRequest = {
    taskType,
    inputTokens,
    outputTokens,
    budgetMode,
  };

  return useQuery({
    queryKey: [...llmKeys.estimate(), request] as const,
    queryFn: () => llmApi.estimateCost(request),
    enabled: inputTokens > 0 || outputTokens > 0,
    staleTime: 60000, // Cost estimates don't change often
  });
}

/**
 * Hook to check if any providers are available
 *
 * @returns Boolean indicating if at least one provider is available
 */
export function useHasAvailableProviders() {
  const { data } = useProviders();
  return data?.availableCount ? data.availableCount > 0 : false;
}

/**
 * Hook to get the primary available provider
 *
 * @returns The first available provider or undefined
 */
export function usePrimaryProvider() {
  const { data } = useProviders();
  return data?.providers?.find((p) => p.available);
}

/**
 * Hook to invalidate all LLM-related queries
 */
export function useInvalidateLLMQueries() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: llmKeys.all });
  };
}

/**
 * Hook to get budget status from usage data
 */
export function useBudgetStatus() {
  const { data, ...rest } = useLLMUsage({ period: 'day' });

  return {
    ...rest,
    data: data?.budget,
    isDailyBudgetExceeded: data?.budget
      ? data.budget.dailyCost >= data.budget.dailyLimit
      : false,
    isMonthlyBudgetExceeded: data?.budget
      ? data.budget.monthlyCost >= data.budget.monthlyLimit
      : false,
    dailyUtilization: data?.budget?.dailyUtilization || 0,
    monthlyUtilization: data?.budget?.monthlyUtilization || 0,
  };
}

/**
 * Hook to get usage trend data for charts
 */
export function useUsageTrends() {
  return useQuery({
    queryKey: [...llmKeys.usage(), 'trends'] as const,
    queryFn: () => llmApi.getUsageTrends(),
    staleTime: 60000,
  });
}

// ============================================================================
// Admin Hooks
// ============================================================================

/**
 * Query key factory for LLM admin
 */
export const llmAdminKeys = {
  all: ['llm-admin'] as const,
  config: () => [...llmAdminKeys.all, 'config'] as const,
};

/**
 * Hook to fetch LLM configuration
 */
export function useLLMConfig() {
  return useQuery({
    queryKey: llmAdminKeys.config(),
    queryFn: () => llmAdminApi.getConfig(),
    staleTime: 30000,
  });
}

/**
 * Hook to update LLM configuration
 */
export function useUpdateLLMConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Partial<LLMConfig>) => llmAdminApi.updateConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: llmAdminKeys.config() });
      queryClient.invalidateQueries({ queryKey: llmKeys.providers() });
      toast.success('Configuration updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update configuration: ${error.message}`);
    },
  });
}

/**
 * Hook to update a provider's configuration
 */
export function useUpdateProviderConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateProviderConfigRequest) =>
      llmAdminApi.updateProviderConfig(request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: llmAdminKeys.config() });
      queryClient.invalidateQueries({ queryKey: llmKeys.providers() });
      toast.success(`${variables.provider} configuration updated`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update provider: ${error.message}`);
    },
  });
}

/**
 * Hook to update budget configuration
 */
export function useUpdateBudgetConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateBudgetConfigRequest) =>
      llmAdminApi.updateBudgetConfig(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: llmAdminKeys.config() });
      queryClient.invalidateQueries({ queryKey: llmKeys.usage() });
      toast.success('Budget limits updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update budget: ${error.message}`);
    },
  });
}

/**
 * Hook to test provider connectivity
 */
export function useTestProvider() {
  return useMutation({
    mutationFn: (provider: LLMProviderType) => llmAdminApi.testProvider(provider),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(
          `${result.provider} connected successfully (${result.latencyMs}ms)`
        );
      } else {
        toast.error(`${result.provider} connection failed: ${result.error}`);
      }
    },
    onError: (error: Error) => {
      toast.error(`Provider test failed: ${error.message}`);
    },
  });
}
