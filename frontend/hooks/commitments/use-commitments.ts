import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commitmentsApi } from '@/lib/api/commitments';
import type {
  Commitment,
  CreateCommitmentDto,
  SupersedeCommitmentDto,
  CommitmentFilters,
} from '@/types/commitment';
import { atomKeys } from '@/hooks/atoms/use-atoms';
import { toast } from 'sonner';

/**
 * Query key factory for commitments
 */
export const commitmentKeys = {
  all: ['commitments'] as const,
  lists: () => [...commitmentKeys.all, 'list'] as const,
  list: (filters: CommitmentFilters) => [...commitmentKeys.lists(), filters] as const,
  details: () => [...commitmentKeys.all, 'detail'] as const,
  detail: (id: string) => [...commitmentKeys.details(), id] as const,
  history: (id: string) => [...commitmentKeys.all, 'history', id] as const,
  atoms: (id: string) => [...commitmentKeys.all, 'atoms', id] as const,
};

/**
 * Hook to fetch paginated commitments list
 */
export function useCommitments(filters: CommitmentFilters = {}) {
  return useQuery({
    queryKey: commitmentKeys.list(filters),
    queryFn: () => commitmentsApi.list(filters),
  });
}

/**
 * Hook to fetch a single commitment by ID
 */
export function useCommitment(id: string) {
  return useQuery({
    queryKey: commitmentKeys.detail(id),
    queryFn: () => commitmentsApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook to preview a commitment (dry-run)
 */
export function usePreviewCommitment() {
  return useMutation({
    mutationFn: (data: CreateCommitmentDto) => commitmentsApi.preview(data),
    onError: (error: Error) => {
      toast.error(`Failed to preview commitment: ${error.message}`);
    },
  });
}

/**
 * Hook to create a new commitment
 */
export function useCreateCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCommitmentDto) => commitmentsApi.create(data),
    onSuccess: (newCommitment) => {
      // Invalidate commitments list to refetch
      queryClient.invalidateQueries({ queryKey: commitmentKeys.lists() });
      // Also invalidate atoms as their status changes to committed
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.success(`Commitment ${newCommitment.commitmentId} created successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create commitment: ${error.message}`);
    },
  });
}

/**
 * Hook to supersede an existing commitment
 */
export function useSupersedeCommitment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SupersedeCommitmentDto }) =>
      commitmentsApi.supersede(id, data),
    onSuccess: (newCommitment, { id: originalId }) => {
      // Update the original commitment in cache
      queryClient.invalidateQueries({ queryKey: commitmentKeys.detail(originalId) });
      // Add new commitment to cache
      queryClient.setQueryData(commitmentKeys.detail(newCommitment.id), newCommitment);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: commitmentKeys.lists() });
      // Invalidate history for both
      queryClient.invalidateQueries({ queryKey: commitmentKeys.history(originalId) });
      // Also invalidate atoms
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.success(`Commitment superseded with ${newCommitment.commitmentId}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to supersede commitment: ${error.message}`);
    },
  });
}

/**
 * Hook to fetch supersession history for a commitment
 */
export function useCommitmentHistory(id: string) {
  return useQuery({
    queryKey: commitmentKeys.history(id),
    queryFn: () => commitmentsApi.getHistory(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch atoms in a commitment
 */
export function useCommitmentAtoms(id: string) {
  return useQuery({
    queryKey: commitmentKeys.atoms(id),
    queryFn: () => commitmentsApi.getAtoms(id),
    enabled: !!id,
  });
}
