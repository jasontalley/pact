import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '@/lib/api/metrics';
import type { CouplingMetrics } from '@/lib/api/metrics';

export const couplingKeys = {
  all: ['coupling'] as const,
  metrics: () => [...couplingKeys.all, 'metrics'] as const,
};

/**
 * Hook to fetch coupling metrics (atom-test-code rates).
 * Stale time: 60 seconds.
 */
export function useCouplingMetrics() {
  return useQuery<CouplingMetrics>({
    queryKey: couplingKeys.metrics(),
    queryFn: () => metricsApi.getCoupling(),
    staleTime: 60000,
  });
}
