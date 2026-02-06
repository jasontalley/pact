import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { atomsApi } from '@/lib/api/atoms';
import type { AtomFilters, Atom, CreateAtomDto, UpdateAtomDto } from '@/types/atom';
import { toast } from 'sonner';

/**
 * Query key factory for atoms
 */
export const atomKeys = {
  all: ['atoms'] as const,
  lists: () => [...atomKeys.all, 'list'] as const,
  list: (filters: AtomFilters) => [...atomKeys.lists(), filters] as const,
  details: () => [...atomKeys.all, 'detail'] as const,
  detail: (id: string) => [...atomKeys.details(), id] as const,
  tags: () => [...atomKeys.all, 'tags'] as const,
  pendingReview: () => [...atomKeys.all, 'pending-review'] as const,
  pendingCount: () => [...atomKeys.all, 'pending-count'] as const,
};

/**
 * Hook to fetch paginated atoms list
 */
export function useAtoms(filters: AtomFilters = {}) {
  return useQuery({
    queryKey: atomKeys.list(filters),
    queryFn: () => atomsApi.list(filters),
  });
}

/**
 * Hook to fetch a single atom by ID
 */
export function useAtom(id: string) {
  return useQuery({
    queryKey: atomKeys.detail(id),
    queryFn: () => atomsApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook to create a new atom
 */
export function useCreateAtom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAtomDto) => atomsApi.create(data),
    onSuccess: (newAtom) => {
      // Invalidate atoms list to refetch
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.success(`Atom ${newAtom.atomId} created`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create atom: ${error.message}`);
    },
  });
}

/**
 * Hook to update a draft atom
 */
export function useUpdateAtom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAtomDto }) =>
      atomsApi.update(id, data),
    onSuccess: (updatedAtom) => {
      // Update the specific atom in cache
      queryClient.setQueryData(atomKeys.detail(updatedAtom.id), updatedAtom);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.success(`Atom ${updatedAtom.atomId} updated`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update atom: ${error.message}`);
    },
  });
}

/**
 * Hook to delete a draft atom
 */
export function useDeleteAtom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => atomsApi.delete(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: atomKeys.detail(deletedId) });
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.success('Atom deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete atom: ${error.message}`);
    },
  });
}

/**
 * Hook to commit a draft atom
 */
export function useCommitAtom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => atomsApi.commit(id),
    // Optimistic update
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: atomKeys.lists() });

      // Snapshot previous value
      const previousAtoms = queryClient.getQueryData(atomKeys.lists());

      return { previousAtoms };
    },
    onSuccess: (committedAtom) => {
      // Update specific atom
      queryClient.setQueryData(atomKeys.detail(committedAtom.id), committedAtom);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.success(`Atom ${committedAtom.atomId} committed successfully`);
    },
    onError: (error: Error, _, context) => {
      // Rollback on error
      if (context?.previousAtoms) {
        queryClient.setQueryData(atomKeys.lists(), context.previousAtoms);
      }
      toast.error(`Failed to commit atom: ${error.message}`);
    },
  });
}

/**
 * Hook to supersede a committed atom
 */
export function useSupersedeAtom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, newAtomId }: { id: string; newAtomId: string }) =>
      atomsApi.supersede(id, newAtomId),
    onSuccess: (supersededAtom) => {
      // Update specific atom
      queryClient.setQueryData(atomKeys.detail(supersededAtom.id), supersededAtom);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.success(`Atom ${supersededAtom.atomId} superseded`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to supersede atom: ${error.message}`);
    },
  });
}

/**
 * Hook to add a tag to an atom
 */
export function useAddTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string }) =>
      atomsApi.addTag(id, tag),
    onSuccess: (updatedAtom) => {
      queryClient.setQueryData(atomKeys.detail(updatedAtom.id), updatedAtom);
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      queryClient.invalidateQueries({ queryKey: atomKeys.tags() });
    },
    onError: (error: Error) => {
      toast.error(`Failed to add tag: ${error.message}`);
    },
  });
}

/**
 * Hook to remove a tag from an atom
 */
export function useRemoveTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string }) =>
      atomsApi.removeTag(id, tag),
    onSuccess: (updatedAtom) => {
      queryClient.setQueryData(atomKeys.detail(updatedAtom.id), updatedAtom);
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      queryClient.invalidateQueries({ queryKey: atomKeys.tags() });
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove tag: ${error.message}`);
    },
  });
}

/**
 * Hook to fetch all unique tags
 */
export function useTags() {
  return useQuery({
    queryKey: atomKeys.tags(),
    queryFn: () => atomsApi.getTags(),
  });
}

/**
 * Hook to fetch atoms pending human review (Phase 18)
 */
export function usePendingReviewAtoms() {
  return useQuery({
    queryKey: atomKeys.pendingReview(),
    queryFn: () => atomsApi.getPendingReview(),
  });
}

/**
 * Hook to get count of atoms pending review (Phase 18)
 */
export function usePendingCount() {
  return useQuery({
    queryKey: atomKeys.pendingCount(),
    queryFn: () => atomsApi.getPendingCount(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

/**
 * Hook to approve a proposed atom (Phase 18)
 */
export function useApproveAtom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { approvedBy: string; description?: string; category?: string } }) =>
      atomsApi.approve(id, data),
    onSuccess: (approvedAtom) => {
      // Update specific atom in cache
      queryClient.setQueryData(atomKeys.detail(approvedAtom.id), approvedAtom);
      // Invalidate pending review queries
      queryClient.invalidateQueries({ queryKey: atomKeys.pendingReview() });
      queryClient.invalidateQueries({ queryKey: atomKeys.pendingCount() });
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.success(`Atom ${approvedAtom.atomId} approved and committed`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve atom: ${error.message}`);
    },
  });
}

/**
 * Hook to reject a proposed atom (Phase 18)
 */
export function useRejectAtom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { rejectedBy: string; reason?: string } }) =>
      atomsApi.reject(id, data),
    onSuccess: (rejectedAtom) => {
      // Update specific atom in cache
      queryClient.setQueryData(atomKeys.detail(rejectedAtom.id), rejectedAtom);
      // Invalidate pending review queries
      queryClient.invalidateQueries({ queryKey: atomKeys.pendingReview() });
      queryClient.invalidateQueries({ queryKey: atomKeys.pendingCount() });
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: atomKeys.lists() });
      toast.success(`Atom ${rejectedAtom.atomId} rejected`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to reject atom: ${error.message}`);
    },
  });
}
