/**
 * Atom status enum matching backend
 */
export type AtomStatus = 'draft' | 'committed' | 'superseded';

/**
 * Atom category enum matching backend
 */
export type AtomCategory =
  | 'functional'
  | 'performance'
  | 'security'
  | 'reliability'
  | 'usability'
  | 'maintainability';

/**
 * Canvas position for atom visualization
 */
export interface CanvasPosition {
  x: number;
  y: number;
}

/**
 * Observable outcome that can be verified externally
 */
export interface ObservableOutcome {
  description: string;
  measurementCriteria?: string;
}

/**
 * Criteria that would disprove the atom's intent
 */
export interface FalsifiabilityCriterion {
  condition: string;
  expectedBehavior: string;
}

/**
 * Refinement history entry
 */
export interface RefinementEntry {
  timestamp: string;
  previousDescription: string;
  newDescription: string;
  feedback?: string;
  qualityScoreBefore?: number;
  qualityScoreAfter?: number;
}

/**
 * Core Atom entity
 */
export interface Atom {
  id: string;
  atomId: string;
  description: string;
  category: AtomCategory;
  status: AtomStatus;
  qualityScore: number | null;
  tags: string[];
  canvasPosition: CanvasPosition | null;
  observableOutcomes: ObservableOutcome[];
  falsifiabilityCriteria: FalsifiabilityCriterion[];
  parentIntent: string | null;
  refinementHistory: RefinementEntry[];
  supersededBy: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  committedAt: string | null;
}

/**
 * DTO for creating a new atom
 */
export interface CreateAtomDto {
  description: string;
  category: AtomCategory;
  tags?: string[];
  canvasPosition?: CanvasPosition;
}

/**
 * DTO for updating an atom
 */
export interface UpdateAtomDto {
  description?: string;
  category?: AtomCategory;
  tags?: string[];
  canvasPosition?: CanvasPosition;
  observableOutcomes?: string[];
  falsifiabilityCriteria?: string[];
}

/**
 * DTO for analyzing raw intent
 */
export interface AnalyzeIntentDto {
  rawIntent: string;
}

/**
 * Result of intent analysis
 */
export interface AtomicityResult {
  isAtomic: boolean;
  confidence: number;
  violations: string[];
  suggestions: string[];
}

/**
 * Result of intent atomization
 */
export interface AtomizationResult {
  atomicity: AtomicityResult;
  suggestedDescription: string;
  suggestedCategory: AtomCategory;
  clarifyingQuestions: string[];
  decompositionSuggestions: string[];
}

/**
 * DTO for refining an atom
 */
export interface RefineAtomDto {
  feedback: string;
}

/**
 * DTO for accepting a suggestion
 */
export interface AcceptSuggestionDto {
  suggestionIndex: number;
  suggestionType: 'clarification' | 'decomposition' | 'precision';
}

/**
 * Search/filter parameters for atoms
 */
export interface AtomFilters {
  search?: string;
  status?: AtomStatus;
  category?: AtomCategory;
  tags?: string[];
  tagsAll?: string[];
  qualityScoreMin?: number;
  qualityScoreMax?: number;
  createdAfter?: string;
  createdBefore?: string;
  committedAfter?: string;
  committedBefore?: string;
  createdBy?: string;
  sortBy?: 'createdAt' | 'qualityScore' | 'atomId' | 'committedAt';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
  cursor?: string;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor?: string;
}
