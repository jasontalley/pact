/**
 * Configuration API
 *
 * API functions for the admin configuration endpoints.
 */

import { apiClient } from './client';
import type {
  SystemConfigResponse,
  DomainConfigResponse,
  ConfigValue,
  SetConfigValueRequest,
  PaginatedAuditLog,
  AuditLogFilters,
} from '@/types/config';

const BASE_URL = '/admin/config';

/**
 * Configuration API functions
 */
export const configApi = {
  /**
   * Get all configurations grouped by domain
   */
  getAll: async (): Promise<SystemConfigResponse> => {
    const response = await apiClient.get<SystemConfigResponse>(BASE_URL);
    return response.data;
  },

  /**
   * Get all configurations for a specific domain
   */
  getByDomain: async (domain: string): Promise<DomainConfigResponse> => {
    const response = await apiClient.get<DomainConfigResponse>(`${BASE_URL}/${domain}`);
    return response.data;
  },

  /**
   * Get a specific configuration value with metadata
   */
  getValue: async (domain: string, key: string): Promise<ConfigValue> => {
    const response = await apiClient.get<ConfigValue>(`${BASE_URL}/${domain}/${key}`);
    return response.data;
  },

  /**
   * Set a configuration value
   */
  setValue: async (
    domain: string,
    key: string,
    value: unknown,
    reason?: string,
    userId?: string
  ): Promise<ConfigValue> => {
    const response = await apiClient.put<ConfigValue>(
      `${BASE_URL}/${domain}/${key}`,
      { value, reason } as SetConfigValueRequest,
      {
        headers: userId ? { 'x-user-id': userId } : {},
      }
    );
    return response.data;
  },

  /**
   * Reset a configuration to its default value
   */
  resetValue: async (domain: string, key: string, userId?: string): Promise<ConfigValue> => {
    const response = await apiClient.delete<ConfigValue>(`${BASE_URL}/${domain}/${key}`, {
      headers: userId ? { 'x-user-id': userId } : {},
    });
    return response.data;
  },

  /**
   * Get configuration audit log
   */
  getAuditLog: async (filters?: AuditLogFilters): Promise<PaginatedAuditLog> => {
    const response = await apiClient.get<PaginatedAuditLog>(`${BASE_URL}/audit/log`, {
      params: filters,
    });
    return response.data;
  },

  /**
   * Get list of available domains
   */
  getDomains: async (): Promise<{ domains: string[] }> => {
    const response = await apiClient.get<{ domains: string[] }>(`${BASE_URL}/meta/domains`);
    return response.data;
  },
};
