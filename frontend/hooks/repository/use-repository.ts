import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repositoryAdminApi } from '@/lib/api/repository';
import type { UpdateRepositoryConfigRequest } from '@/types/repository';
import { toast } from 'sonner';

export const repositoryKeys = {
  all: ['repository'] as const,
  config: () => [...repositoryKeys.all, 'config'] as const,
};

export function useRepositoryConfig() {
  return useQuery({
    queryKey: repositoryKeys.config(),
    queryFn: () => repositoryAdminApi.getConfig(),
    staleTime: 30000,
  });
}

export function useUpdateRepositoryConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateRepositoryConfigRequest) =>
      repositoryAdminApi.updateConfig(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.config() });
      toast.success('Repository configuration updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update repository config: ${error.message}`);
    },
  });
}

export function useValidatePath() {
  return useMutation({
    mutationFn: (path: string) => repositoryAdminApi.validatePath(path),
  });
}
