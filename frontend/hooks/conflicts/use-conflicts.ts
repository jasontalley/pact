import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conflictsApi } from '@/lib/api/conflicts';
import type { ConflictFilters, ConflictRecord, ResolveConflictDto, ConflictMetrics } from '@/lib/api/conflicts';
import { toast } from 'sonner';

export const conflictKeys = {
  all: ['conflicts'] as const,
  lists: () => [...conflictKeys.all, 'list'] as const,
  list: (filters?: ConflictFilters) => [...conflictKeys.lists(), filters] as const,
  details: () => [...conflictKeys.all, 'detail'] as const,
  detail: (id: string) => [...conflictKeys.details(), id] as const,
  metrics: () => [...conflictKeys.all, 'metrics'] as const,
};

/**
 * Hook to fetch conflicts list with optional filters.
 */
export function useConflicts(filters?: ConflictFilters) {
  return useQuery<ConflictRecord[]>({
    queryKey: conflictKeys.list(filters),
    queryFn: () => conflictsApi.list(filters),
  });
}

/**
 * Hook to fetch a single conflict by ID.
 */
export function useConflict(id: string) {
  return useQuery<ConflictRecord>({
    queryKey: conflictKeys.detail(id),
    queryFn: () => conflictsApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch conflict metrics (counts by type/status).
 */
export function useConflictMetrics() {
  return useQuery<ConflictMetrics>({
    queryKey: conflictKeys.metrics(),
    queryFn: () => conflictsApi.getMetrics(),
  });
}

/**
 * Mutation hook to resolve a conflict.
 */
export function useResolveConflict() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ResolveConflictDto }) =>
      conflictsApi.resolve(id, data),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: conflictKeys.lists() });

      const previousList = queryClient.getQueryData<ConflictRecord[]>(conflictKeys.list());

      if (previousList) {
        queryClient.setQueryData<ConflictRecord[]>(
          conflictKeys.list(),
          previousList.map((c) =>
            c.id === id ? { ...c, status: 'resolved' as const } : c,
          ),
        );
      }

      return { previousList };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(conflictKeys.list(), context.previousList);
      }
      toast.error('Failed to resolve conflict');
    },
    onSuccess: () => {
      toast.success('Conflict resolved');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: conflictKeys.all });
    },
  });
}

/**
 * Mutation hook to escalate a conflict.
 */
export function useEscalateConflict() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => conflictsApi.escalate(id),
    onSuccess: () => {
      toast.success('Conflict escalated');
    },
    onError: () => {
      toast.error('Failed to escalate conflict');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: conflictKeys.all });
    },
  });
}
