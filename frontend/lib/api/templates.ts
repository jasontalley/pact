import { apiClient } from './client';
import type {
  ValidatorTemplate,
  CreateTemplateDto,
  UpdateTemplateDto,
  InstantiateTemplateDto,
  TemplateFilters,
  TemplateStatistics,
  TemplateCategory,
  CategoryCount,
  TagCount,
  TemplateUsage,
  PaginatedResponse,
  Validator,
} from '@/types/validator';

/**
 * Validator Template API functions
 */
export const templatesApi = {
  /**
   * List templates with optional filters
   */
  list: async (params?: TemplateFilters): Promise<PaginatedResponse<ValidatorTemplate>> => {
    const response = await apiClient.get<PaginatedResponse<ValidatorTemplate>>('/templates', { params });
    return response.data;
  },

  /**
   * Get a single template by ID
   */
  get: async (id: string): Promise<ValidatorTemplate> => {
    const response = await apiClient.get<ValidatorTemplate>(`/templates/${id}`);
    return response.data;
  },

  /**
   * Create a new custom template
   */
  create: async (data: CreateTemplateDto): Promise<ValidatorTemplate> => {
    const response = await apiClient.post<ValidatorTemplate>('/templates', data);
    return response.data;
  },

  /**
   * Update a custom template (not allowed for built-in templates)
   */
  update: async (id: string, data: UpdateTemplateDto): Promise<ValidatorTemplate> => {
    const response = await apiClient.patch<ValidatorTemplate>(`/templates/${id}`, data);
    return response.data;
  },

  /**
   * Delete a custom template (not allowed for built-in templates)
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/templates/${id}`);
  },

  /**
   * Instantiate a validator from a template
   */
  instantiate: async (id: string, data: Omit<InstantiateTemplateDto, 'templateId'>): Promise<Validator> => {
    const response = await apiClient.post<Validator>(`/templates/${id}/instantiate`, data);
    return response.data;
  },

  /**
   * Get all template categories with counts
   */
  getCategories: async (): Promise<CategoryCount[]> => {
    const response = await apiClient.get<CategoryCount[]>('/templates/categories');
    return response.data;
  },

  /**
   * Get popular tags
   */
  getPopularTags: async (limit?: number): Promise<TagCount[]> => {
    const response = await apiClient.get<TagCount[]>('/templates/tags', {
      params: limit ? { limit } : undefined,
    });
    return response.data;
  },

  /**
   * Get template statistics
   */
  getStatistics: async (): Promise<TemplateStatistics> => {
    const response = await apiClient.get<TemplateStatistics>('/templates/statistics');
    return response.data;
  },

  /**
   * Get templates by category
   */
  getByCategory: async (category: TemplateCategory): Promise<ValidatorTemplate[]> => {
    const response = await apiClient.get<ValidatorTemplate[]>(`/templates/category/${category}`);
    return response.data;
  },

  /**
   * Get template usage information
   */
  getUsage: async (id: string): Promise<TemplateUsage> => {
    const response = await apiClient.get<TemplateUsage>(`/templates/${id}/usage`);
    return response.data;
  },
};
