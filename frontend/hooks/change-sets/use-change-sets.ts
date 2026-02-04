'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { changeSetsApi } from '@/lib/api/change-sets';
import type { ChangeSetSummary, ChangeSetDetail } from '@/lib/api/change-sets';
import { toast } from 'sonner';

/**
 * Query key factory for change sets
 */
export const changeSetKeys = {
  all: ['change-sets'] as const,
  lists: () => [...changeSetKeys.all, 'list'] as const,
  list: (status?: string) => [...changeSetKeys.lists(), status] as const,
  details: () => [...changeSetKeys.all, 'detail'] as const,
  detail: (id: string) => [...changeSetKeys.details(), id] as const,
};

/**
 * Hook to fetch paginated change sets list with optional status filter
 */
export function useChangeSets(status?: string) {
  return useQuery({
    queryKey: changeSetKeys.list(status),
    queryFn: () => changeSetsApi.list(status),
  });
}

/**
 * Hook to fetch a single change set by ID with atoms
 */
export function useChangeSet(id: string) {
  return useQuery({
    queryKey: changeSetKeys.detail(id),
    queryFn: () => changeSetsApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook to create a new change set
 */
export function useCreateChangeSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; description?: string; summary?: string }) =>
      changeSetsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: changeSetKeys.lists() });
      toast.success('Change set created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create change set: ${error.message}`);
    },
  });
}

/**
 * Hook to submit a change set for review
 */
export function useSubmitChangeSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => changeSetsApi.submit(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: changeSetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: changeSetKeys.detail(id) });
      toast.success('Change set submitted for review');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit: ${error.message}`);
    },
  });
}

/**
 * Hook to approve or reject a change set
 */
export function useApproveChangeSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, decision, comment }: { id: string; decision: 'approved' | 'rejected'; comment?: string }) =>
      changeSetsApi.approve(id, { decision, comment }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: changeSetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: changeSetKeys.detail(id) });
      toast.success('Review submitted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to review: ${error.message}`);
    },
  });
}

/**
 * Hook to commit a change set (makes atoms immutable)
 */
export function useCommitChangeSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => changeSetsApi.commit(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: changeSetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: changeSetKeys.detail(id) });
      toast.success('Change set committed successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to commit: ${error.message}`);
    },
  });
}

/**
 * Hook to add an atom to a change set
 */
export function useAddAtomToChangeSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ changeSetId, atomId }: { changeSetId: string; atomId: string }) =>
      changeSetsApi.addAtom(changeSetId, atomId),
    onSuccess: (_, { changeSetId }) => {
      queryClient.invalidateQueries({ queryKey: changeSetKeys.detail(changeSetId) });
      toast.success('Atom added to change set');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add atom: ${error.message}`);
    },
  });
}
