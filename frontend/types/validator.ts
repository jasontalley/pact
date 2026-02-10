/**
 * Validator type enum matching backend
 */
export type ValidatorType = 'gherkin' | 'executable' | 'declarative';

/**
 * Validator format enum matching backend
 */
export type ValidatorFormat = 'gherkin' | 'natural_language' | 'typescript' | 'json';

/**
 * Template category enum matching backend
 */
export type TemplateCategory =
  | 'authentication'
  | 'authorization'
  | 'data-integrity'
  | 'performance'
  | 'state-transition'
  | 'error-handling'
  | 'custom';

/**
 * Cached translation for a validator
 */
export interface CachedTranslation {
  content: string;
  confidence: number;
  translatedAt: string;
}

/**
 * Core Validator entity
 */
export interface Validator {
  id: string;
  atomId: string;
  name: string;
  description: string | null;
  validatorType: ValidatorType;
  content: string;
  format: ValidatorFormat;
  originalFormat: ValidatorFormat;
  translatedContent: Record<ValidatorFormat, CachedTranslation> | null;
  templateId: string | null;
  parameters: Record<string, unknown> | null;
  isActive: boolean;
  executionCount: number;
  lastExecutedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Parameter schema for templates (JSON Schema format)
 */
export interface ParameterSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
    default?: unknown;
  }>;
  required?: string[];
}

/**
 * Validator Template entity
 */
export interface ValidatorTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  format: ValidatorFormat;
  templateContent: string;
  parametersSchema: ParameterSchema;
  exampleUsage: string | null;
  tags: string[];
  isBuiltin: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * DTO for creating a new validator
 */
export interface CreateValidatorDto {
  atomId: string;
  name: string;
  description?: string;
  validatorType: ValidatorType;
  content: string;
  format: ValidatorFormat;
  templateId?: string;
  parameters?: Record<string, unknown>;
}

/**
 * DTO for updating a validator
 */
export interface UpdateValidatorDto {
  name?: string;
  description?: string;
  content?: string;
}

/**
 * DTO for translating validator content
 */
export interface TranslateValidatorDto {
  content: string;
  sourceFormat: ValidatorFormat;
  targetFormat: ValidatorFormat;
}

/**
 * Translation result from API
 */
export interface TranslationResult {
  content: string;
  sourceFormat: ValidatorFormat;
  targetFormat: ValidatorFormat;
  confidence: number;
  warnings: string[];
  wasLLMUsed: boolean;
}

/**
 * Translation validation result
 */
export interface TranslationValidationResult {
  isValid: boolean;
  semanticEquivalence: number;
  warnings: string[];
  suggestions: string[];
}

/**
 * Round-trip test result
 */
export interface RoundTripResult {
  originalContent: string;
  translatedContent: string;
  roundTripContent: string;
  preservationScore: number;
  isAcceptable: boolean;
  differences: string[];
}

/**
 * Search/filter parameters for validators
 */
export interface ValidatorFilters {
  atomId?: string;
  validatorType?: ValidatorType;
  format?: ValidatorFormat;
  isActive?: boolean;
  search?: string;
  sortBy?: 'createdAt' | 'name' | 'executionCount';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
}

/**
 * Validator statistics
 */
export interface ValidatorStatistics {
  total: number;
  byType: Record<ValidatorType, number>;
  byFormat: Record<ValidatorFormat, number>;
  activeCount: number;
  inactiveCount: number;
}

/**
 * DTO for creating a new template
 */
export interface CreateTemplateDto {
  name: string;
  description: string;
  category: TemplateCategory;
  format: ValidatorFormat;
  templateContent: string;
  parametersSchema: ParameterSchema;
  exampleUsage?: string;
  tags?: string[];
}

/**
 * DTO for updating a template
 */
export interface UpdateTemplateDto {
  name?: string;
  description?: string;
  templateContent?: string;
  parametersSchema?: ParameterSchema;
  exampleUsage?: string;
  tags?: string[];
}

/**
 * DTO for instantiating a validator from a template
 */
export interface InstantiateTemplateDto {
  atomId: string;
  parameters: Record<string, unknown>;
  name?: string;
  description?: string;
}

/**
 * Search/filter parameters for templates
 */
export interface TemplateFilters {
  category?: TemplateCategory;
  format?: ValidatorFormat;
  isBuiltin?: boolean;
  tags?: string[];
  search?: string;
  sortBy?: 'createdAt' | 'name' | 'usageCount';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
}

/**
 * Template statistics
 */
export interface TemplateStatistics {
  total: number;
  byCategory: Record<TemplateCategory, number>;
  byFormat: Record<ValidatorFormat, number>;
  builtinCount: number;
  customCount: number;
}

/**
 * Category with count for UI display
 */
export interface CategoryCount {
  category: TemplateCategory;
  count: number;
}

/**
 * Tag with count for popularity display
 */
export interface TagCount {
  tag: string;
  count: number;
}

/**
 * Template usage information
 */
export interface TemplateUsage {
  usageCount: number;
  validators: Array<{
    id: string;
    name: string;
    atomId: string;
    createdAt: string;
  }>;
}

/**
 * Paginated response wrapper (reused from atom types)
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}
