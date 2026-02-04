import { useQuery } from '@tanstack/react-query';
import { qualityApi } from '@/lib/api/quality';

export const qualityKeys = {
  all: ['quality'] as const,
  profiles: () => [...qualityKeys.all, 'profiles'] as const,
};

export function useQualityProfiles() {
  return useQuery({
    queryKey: qualityKeys.profiles(),
    queryFn: () => qualityApi.getProfiles(),
    staleTime: 300_000,
  });
}
