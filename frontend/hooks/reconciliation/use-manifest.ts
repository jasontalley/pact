import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { manifestApi } from '@/lib/api/reconciliation';
import { toast } from 'sonner';

/**
 * Query key factory for manifests
 */
export const manifestKeys = {
  all: ['manifest'] as const,
  detail: (id: string) => [...manifestKeys.all, id] as const,
  project: (projectId: string) => [...manifestKeys.all, 'project', projectId] as const,
  latest: (projectId: string) => [...manifestKeys.all, 'project', projectId, 'latest'] as const,
};

/**
 * Hook to get a manifest by ID
 */
export function useManifest(manifestId: string | null) {
  return useQuery({
    queryKey: manifestId ? manifestKeys.detail(manifestId) : ['disabled'],
    queryFn: () => manifestApi.get(manifestId!),
    enabled: !!manifestId,
  });
}

/**
 * Hook to get the latest completed manifest for a project
 */
export function useLatestManifest(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? manifestKeys.latest(projectId) : ['disabled'],
    queryFn: () => manifestApi.latest(projectId!),
    enabled: !!projectId,
    refetchInterval: (query) => {
      // Poll while no manifest exists (may be generating in background)
      if (!query.state.data) return 10000;
      if (query.state.data.status === 'generating') return 5000;
      return false;
    },
  });
}

/**
 * Hook to get the latest manifest for the default project (no projectId needed).
 * Polls while generating, stops when complete.
 */
export function useLatestDefaultManifest() {
  return useQuery({
    queryKey: [...manifestKeys.all, 'default', 'latest'] as const,
    queryFn: () => manifestApi.latestDefault(),
    refetchInterval: (query) => {
      if (!query.state.data) return 15000;
      if (query.state.data.status === 'generating') return 5000;
      return false;
    },
  });
}

/**
 * Hook to list manifests for a project
 */
export function useManifestList(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? manifestKeys.project(projectId) : ['disabled'],
    queryFn: () => manifestApi.list(projectId!),
    enabled: !!projectId,
  });
}

/**
 * Hook to trigger manifest generation
 */
export function useGenerateManifest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { projectId?: string; rootDirectory?: string; contentSource?: string }) =>
      manifestApi.generate(data),
    onSuccess: (manifest) => {
      toast.success(`Manifest generated (${manifest.evidenceInventory.summary.total} evidence items)`);
      // Invalidate manifest queries
      queryClient.invalidateQueries({ queryKey: manifestKeys.all });
    },
    onError: (error: Error) => {
      toast.error(`Manifest generation failed: ${error.message}`);
    },
  });
}
