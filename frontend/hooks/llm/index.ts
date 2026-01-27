/**
 * LLM Hooks
 *
 * React Query hooks for LLM provider management and usage tracking.
 */

export {
  // Query keys
  llmKeys,
  llmAdminKeys,
  // Provider hooks
  useProviders,
  useModels,
  useProviderModels,
  usePrimaryProvider,
  useHasAvailableProviders,
  // Usage hooks
  useLLMUsage,
  useBudgetStatus,
  useUsageTrends,
  // Cost estimation hooks
  useEstimateCost,
  useCostEstimate,
  // Utility hooks
  useInvalidateLLMQueries,
  // Admin hooks
  useLLMConfig,
  useUpdateLLMConfig,
  useUpdateProviderConfig,
  useUpdateBudgetConfig,
  useTestProvider,
} from './use-llm';
