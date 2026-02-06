'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { driftApi } from '@/lib/api/drift';
import type { DriftListParams } from '@/types/drift';

/**
 * Query keys for drift data
 */
export const driftKeys = {
  all: ['drift'] as const,
  lists: () => [...driftKeys.all, 'list'] as const,
  list: (params?: DriftListParams) => [...driftKeys.lists(), params] as const,
  summary: (projectId?: string) => [...driftKeys.all, 'summary', projectId] as const,
  item: (id: string) => [...driftKeys.all, 'item', id] as const,
  overdue: (projectId?: string) => [...driftKeys.all, 'overdue', projectId] as const,
  aging: (projectId?: string) => [...driftKeys.all, 'aging', projectId] as const,
  convergence: (projectId?: string) => [...driftKeys.all, 'convergence', projectId] as const,
  trend: (period?: string, projectId?: string) =>
    [...driftKeys.all, 'trend', period, projectId] as const,
};

/**
 * Hook to fetch drift summary
 */
export function useDriftSummary(projectId?: string) {
  return useQuery({
    queryKey: driftKeys.summary(projectId),
    queryFn: () => driftApi.getSummary(projectId),
  });
}

/**
 * Hook to fetch paginated drift list
 */
export function useDriftList(params?: DriftListParams) {
  return useQuery({
    queryKey: driftKeys.list(params),
    queryFn: () => driftApi.list(params),
  });
}

/**
 * Hook to fetch single drift item
 */
export function useDriftItem(id: string) {
  return useQuery({
    queryKey: driftKeys.item(id),
    queryFn: () => driftApi.getItem(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch overdue drift items
 */
export function useDriftOverdue(projectId?: string) {
  return useQuery({
    queryKey: driftKeys.overdue(projectId),
    queryFn: () => driftApi.getOverdue(projectId),
  });
}

/**
 * Hook to fetch drift aging distribution
 */
export function useDriftAging(projectId?: string) {
  return useQuery({
    queryKey: driftKeys.aging(projectId),
    queryFn: () => driftApi.getAging(projectId),
  });
}

/**
 * Hook to fetch convergence report
 */
export function useDriftConvergence(projectId?: string) {
  return useQuery({
    queryKey: driftKeys.convergence(projectId),
    queryFn: () => driftApi.getConvergence(projectId),
  });
}

/**
 * Hook to fetch drift trend data
 */
export function useDriftTrend(period?: 'week' | 'month' | 'quarter', projectId?: string) {
  return useQuery({
    queryKey: driftKeys.trend(period, projectId),
    queryFn: () => driftApi.getTrend(period, projectId),
  });
}

/**
 * Hook to acknowledge a drift item
 */
export function useAcknowledgeDrift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
      driftApi.acknowledge(id, comment),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: driftKeys.item(id) });
      queryClient.invalidateQueries({ queryKey: driftKeys.lists() });
      queryClient.invalidateQueries({ queryKey: driftKeys.all });
    },
  });
}

/**
 * Hook to waive a drift item
 */
export function useWaiveDrift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, justification }: { id: string; justification: string }) =>
      driftApi.waive(id, justification),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: driftKeys.item(id) });
      queryClient.invalidateQueries({ queryKey: driftKeys.lists() });
      queryClient.invalidateQueries({ queryKey: driftKeys.all });
    },
  });
}

/**
 * Hook to resolve a drift item
 */
export function useResolveDrift() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => driftApi.resolve(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: driftKeys.item(id) });
      queryClient.invalidateQueries({ queryKey: driftKeys.lists() });
      queryClient.invalidateQueries({ queryKey: driftKeys.all });
    },
  });
}

/**
 * Hook to trigger drift detection
 */
export function useTriggerDriftDetection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (runId: string) => driftApi.triggerDetection(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: driftKeys.all });
    },
  });
}
