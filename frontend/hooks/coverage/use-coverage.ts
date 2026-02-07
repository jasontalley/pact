import { useQuery } from '@tanstack/react-query';
import { coverageApi } from '@/lib/api/coverage';

export const coverageKeys = {
  all: ['coverage'] as const,
  latest: (projectId?: string) => [...coverageKeys.all, 'latest', projectId] as const,
  history: (params?: { projectId?: string; limit?: number; offset?: number }) =>
    [...coverageKeys.all, 'history', params] as const,
  detail: (id: string) => [...coverageKeys.all, 'detail', id] as const,
};

export function useCoverageLatest(projectId?: string) {
  return useQuery({
    queryKey: coverageKeys.latest(projectId),
    queryFn: () => coverageApi.getLatest(projectId),
    staleTime: 60_000,
    retry: false,
  });
}

export function useCoverageHistory(params?: {
  projectId?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: coverageKeys.history(params),
    queryFn: () => coverageApi.getHistory(params),
    staleTime: 60_000,
  });
}
