import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '@/lib/api/metrics';
import type { EpistemicMetrics } from '@/lib/api/metrics';

export const epistemicKeys = {
  all: ['epistemic'] as const,
  metrics: () => [...epistemicKeys.all, 'metrics'] as const,
};

/**
 * Hook to fetch epistemic stack metrics.
 * Auto-refreshes every 30 seconds.
 */
export function useEpistemicMetrics() {
  return useQuery<EpistemicMetrics>({
    queryKey: epistemicKeys.metrics(),
    queryFn: () => metricsApi.getEpistemic(),
  });
}
