import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invariantsApi } from '@/lib/api/invariants';
import type { CreateInvariantDto, UpdateInvariantDto } from '@/types/invariant';
import { toast } from 'sonner';

/**
 * Query key factory for invariants
 */
export const invariantKeys = {
  all: ['invariants'] as const,
  lists: () => [...invariantKeys.all, 'list'] as const,
  list: (projectId?: string) => [...invariantKeys.lists(), { projectId }] as const,
  enabled: (projectId?: string) => [...invariantKeys.all, 'enabled', { projectId }] as const,
  details: () => [...invariantKeys.all, 'detail'] as const,
  detail: (id: string) => [...invariantKeys.details(), id] as const,
};

/**
 * Hook to fetch all invariants (optionally filtered by project)
 */
export function useInvariants(projectId?: string) {
  return useQuery({
    queryKey: invariantKeys.list(projectId),
    queryFn: () => invariantsApi.list(projectId),
  });
}

/**
 * Hook to fetch enabled invariants
 */
export function useEnabledInvariants(projectId?: string) {
  return useQuery({
    queryKey: invariantKeys.enabled(projectId),
    queryFn: () => invariantsApi.listEnabled(projectId),
  });
}

/**
 * Hook to fetch a single invariant
 */
export function useInvariant(id: string) {
  return useQuery({
    queryKey: invariantKeys.detail(id),
    queryFn: () => invariantsApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook to create a custom invariant
 */
export function useCreateInvariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateInvariantDto) => invariantsApi.create(data),
    onSuccess: (newInvariant) => {
      queryClient.invalidateQueries({ queryKey: invariantKeys.lists() });
      toast.success(`Invariant ${newInvariant.invariantId} created`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create invariant: ${error.message}`);
    },
  });
}

/**
 * Hook to update an invariant
 */
export function useUpdateInvariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateInvariantDto }) =>
      invariantsApi.update(id, data),
    onSuccess: (updatedInvariant) => {
      queryClient.setQueryData(invariantKeys.detail(updatedInvariant.id), updatedInvariant);
      queryClient.invalidateQueries({ queryKey: invariantKeys.lists() });
      toast.success(`Invariant ${updatedInvariant.invariantId} updated`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update invariant: ${error.message}`);
    },
  });
}

/**
 * Hook to delete a custom invariant
 */
export function useDeleteInvariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invariantsApi.delete(id),
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({ queryKey: invariantKeys.detail(deletedId) });
      queryClient.invalidateQueries({ queryKey: invariantKeys.lists() });
      toast.success('Invariant deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete invariant: ${error.message}`);
    },
  });
}

/**
 * Hook to enable an invariant
 */
export function useEnableInvariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invariantsApi.enable(id),
    onSuccess: (updatedInvariant) => {
      queryClient.setQueryData(invariantKeys.detail(updatedInvariant.id), updatedInvariant);
      queryClient.invalidateQueries({ queryKey: invariantKeys.lists() });
      toast.success(`Invariant ${updatedInvariant.invariantId} enabled`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to enable invariant: ${error.message}`);
    },
  });
}

/**
 * Hook to disable an invariant
 */
export function useDisableInvariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => invariantsApi.disable(id),
    onSuccess: (updatedInvariant) => {
      queryClient.setQueryData(invariantKeys.detail(updatedInvariant.id), updatedInvariant);
      queryClient.invalidateQueries({ queryKey: invariantKeys.lists() });
      toast.success(`Invariant ${updatedInvariant.invariantId} disabled`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to disable invariant: ${error.message}`);
    },
  });
}
