import { apiClient } from './client';
import type {
  Validator,
  CreateValidatorDto,
  UpdateValidatorDto,
  ValidatorFilters,
  ValidatorStatistics,
  TranslateValidatorDto,
  TranslationResult,
  TranslationValidationResult,
  RoundTripResult,
  PaginatedResponse,
  ValidatorFormat,
  CachedTranslation,
} from '@/types/validator';

/**
 * Validator API functions
 */
export const validatorsApi = {
  /**
   * List validators with optional filters
   */
  list: async (params?: ValidatorFilters): Promise<PaginatedResponse<Validator>> => {
    const response = await apiClient.get<PaginatedResponse<Validator>>('/validators', { params });
    return response.data;
  },

  /**
   * Get a single validator by ID
   */
  get: async (id: string): Promise<Validator> => {
    const response = await apiClient.get<Validator>(`/validators/${id}`);
    return response.data;
  },

  /**
   * Create a new validator
   */
  create: async (data: CreateValidatorDto): Promise<Validator> => {
    const response = await apiClient.post<Validator>('/validators', data);
    return response.data;
  },

  /**
   * Update a validator
   */
  update: async (id: string, data: UpdateValidatorDto): Promise<Validator> => {
    const response = await apiClient.patch<Validator>(`/validators/${id}`, data);
    return response.data;
  },

  /**
   * Soft delete a validator (deactivate)
   */
  delete: async (id: string): Promise<Validator> => {
    const response = await apiClient.delete<Validator>(`/validators/${id}`);
    return response.data;
  },

  /**
   * Permanently delete a validator
   */
  hardDelete: async (id: string): Promise<void> => {
    await apiClient.delete(`/validators/${id}/permanent`);
  },

  /**
   * Activate a validator
   */
  activate: async (id: string): Promise<Validator> => {
    const response = await apiClient.patch<Validator>(`/validators/${id}/activate`);
    return response.data;
  },

  /**
   * Deactivate a validator
   */
  deactivate: async (id: string): Promise<Validator> => {
    const response = await apiClient.patch<Validator>(`/validators/${id}/deactivate`);
    return response.data;
  },

  /**
   * Get validator statistics
   */
  getStatistics: async (): Promise<ValidatorStatistics> => {
    const response = await apiClient.get<ValidatorStatistics>('/validators/statistics');
    return response.data;
  },

  /**
   * Get cached translations for a validator
   */
  getTranslations: async (id: string): Promise<Record<ValidatorFormat, CachedTranslation>> => {
    const response = await apiClient.get<Record<ValidatorFormat, CachedTranslation>>(`/validators/${id}/translations`);
    return response.data;
  },

  /**
   * Translate content between formats (standalone)
   */
  translate: async (data: TranslateValidatorDto): Promise<TranslationResult> => {
    const response = await apiClient.post<TranslationResult>('/validators/translate', data);
    return response.data;
  },

  /**
   * Translate an existing validator to a new format
   */
  translateValidator: async (id: string, targetFormat: ValidatorFormat): Promise<{
    translation: TranslationResult;
    validator: Validator;
  }> => {
    const response = await apiClient.post<{
      translation: TranslationResult;
      validator: Validator;
    }>(`/validators/${id}/translate/${targetFormat}`);
    return response.data;
  },

  /**
   * Validate a translation for semantic equivalence
   */
  validateTranslation: async (
    id: string,
    translatedContent: string,
    targetFormat: ValidatorFormat
  ): Promise<TranslationValidationResult> => {
    const response = await apiClient.post<TranslationValidationResult>(
      `/validators/${id}/validate-translation`,
      { translatedContent, targetFormat }
    );
    return response.data;
  },

  /**
   * Test round-trip translation preservation
   */
  testRoundTrip: async (id: string, targetFormat: ValidatorFormat): Promise<RoundTripResult> => {
    const response = await apiClient.post<RoundTripResult>(
      `/validators/${id}/test-round-trip/${targetFormat}`
    );
    return response.data;
  },

  /**
   * Get validators for a specific atom
   */
  getByAtom: async (atomId: string): Promise<Validator[]> => {
    const response = await apiClient.get<PaginatedResponse<Validator>>('/validators', {
      params: { atomId },
    });
    return response.data.items;
  },
};
