/**
 * Configuration React Query Hooks
 *
 * Hooks for managing system configuration.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { configApi } from '@/lib/api/config';
import type { AuditLogFilters, ConfigDomain, ConfigValue } from '@/types/config';
import { toast } from 'sonner';

/**
 * Query key factory for configuration
 */
export const configKeys = {
  all: ['config'] as const,
  system: () => [...configKeys.all, 'system'] as const,
  domain: (domain: string) => [...configKeys.all, 'domain', domain] as const,
  value: (domain: string, key: string) => [...configKeys.all, 'value', domain, key] as const,
  audit: () => [...configKeys.all, 'audit'] as const,
  auditLog: (filters?: AuditLogFilters) => [...configKeys.audit(), filters] as const,
  domains: () => [...configKeys.all, 'domains'] as const,
};

/**
 * Hook to fetch all system configurations
 */
export function useSystemConfig() {
  return useQuery({
    queryKey: configKeys.system(),
    queryFn: () => configApi.getAll(),
    staleTime: 30000, // Consider stale after 30s
  });
}

/**
 * Hook to fetch configurations for a specific domain
 */
export function useDomainConfig(domain: ConfigDomain) {
  return useQuery({
    queryKey: configKeys.domain(domain),
    queryFn: () => configApi.getByDomain(domain),
    staleTime: 30000,
  });
}

/**
 * Hook to fetch a specific configuration value
 */
export function useConfigValue(domain: string, key: string) {
  return useQuery({
    queryKey: configKeys.value(domain, key),
    queryFn: () => configApi.getValue(domain, key),
    staleTime: 30000,
    enabled: !!domain && !!key,
  });
}

/**
 * Hook to set a configuration value
 */
export function useSetConfigValue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      domain,
      key,
      value,
      reason,
      userId,
    }: {
      domain: string;
      key: string;
      value: unknown;
      reason?: string;
      userId?: string;
    }) => configApi.setValue(domain, key, value, reason, userId),

    onMutate: async ({ domain, key, value }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: configKeys.domain(domain) });
      await queryClient.cancelQueries({ queryKey: configKeys.value(domain, key) });

      // Snapshot the previous value
      const previousConfig = queryClient.getQueryData(configKeys.value(domain, key));

      // Optimistically update the value
      queryClient.setQueryData<ConfigValue>(configKeys.value(domain, key), (old) =>
        old ? { ...old, value, source: 'database' } : old
      );

      return { previousConfig };
    },

    onSuccess: (data, { domain }) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: configKeys.system() });
      queryClient.invalidateQueries({ queryKey: configKeys.domain(domain) });
      queryClient.invalidateQueries({ queryKey: configKeys.audit() });

      toast.success(`Configuration ${data.key} updated`);
    },

    onError: (error: Error, { domain, key }, context) => {
      // Rollback on error
      if (context?.previousConfig) {
        queryClient.setQueryData(configKeys.value(domain, key), context.previousConfig);
      }
      toast.error(`Failed to update configuration: ${error.message}`);
    },
  });
}

/**
 * Hook to reset a configuration to default
 */
export function useResetConfigValue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      domain,
      key,
      userId,
    }: {
      domain: string;
      key: string;
      userId?: string;
    }) => configApi.resetValue(domain, key, userId),

    onSuccess: (data, { domain }) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: configKeys.system() });
      queryClient.invalidateQueries({ queryKey: configKeys.domain(domain) });
      queryClient.invalidateQueries({ queryKey: configKeys.audit() });

      toast.success(`Configuration ${data.key} reset to default`);
    },

    onError: (error: Error) => {
      toast.error(`Failed to reset configuration: ${error.message}`);
    },
  });
}

/**
 * Hook to fetch audit log
 */
export function useConfigAuditLog(filters?: AuditLogFilters) {
  return useQuery({
    queryKey: configKeys.auditLog(filters),
    queryFn: () => configApi.getAuditLog(filters),
    staleTime: 10000, // Audit log should be relatively fresh
  });
}

/**
 * Hook to fetch available domains
 */
export function useConfigDomains() {
  return useQuery({
    queryKey: configKeys.domains(),
    queryFn: () => configApi.getDomains(),
    staleTime: 300000, // Domains rarely change
  });
}

/**
 * Hook to invalidate all config queries (useful after bulk changes)
 */
export function useInvalidateConfig() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: configKeys.all });
  };
}

/**
 * Helper hook to check if a config value is modified from default
 */
export function useIsConfigModified(config: ConfigValue | undefined): boolean {
  if (!config) return false;
  return config.source === 'database' || config.source === 'environment';
}

/**
 * Helper hook to format config value for display
 */
export function formatConfigValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return '-';
  if (type === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (type === 'json') return JSON.stringify(value, null, 2);
  if (type === 'number') return value.toString();
  return String(value);
}
