import { apiClient } from './client';
import type {
  Atom,
  CreateAtomDto,
  UpdateAtomDto,
  AtomFilters,
  PaginatedResponse,
  AnalyzeIntentDto,
  AtomizationResult,
  RefineAtomDto,
  AcceptSuggestionDto,
  RefinementEntry,
} from '@/types/atom';

/**
 * Atom API functions
 */
export const atomsApi = {
  /**
   * List atoms with optional filters
   */
  list: async (params?: AtomFilters): Promise<PaginatedResponse<Atom>> => {
    const response = await apiClient.get<PaginatedResponse<Atom>>('/atoms', { params });
    return response.data;
  },

  /**
   * Get a single atom by ID
   */
  get: async (id: string): Promise<Atom> => {
    const response = await apiClient.get<Atom>(`/atoms/${id}`);
    return response.data;
  },

  /**
   * Create a new atom
   */
  create: async (data: CreateAtomDto): Promise<Atom> => {
    const response = await apiClient.post<Atom>('/atoms', data);
    return response.data;
  },

  /**
   * Update a draft atom
   */
  update: async (id: string, data: UpdateAtomDto): Promise<Atom> => {
    const response = await apiClient.patch<Atom>(`/atoms/${id}`, data);
    return response.data;
  },

  /**
   * Delete a draft atom
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/atoms/${id}`);
  },

  /**
   * Commit a draft atom (makes it immutable)
   */
  commit: async (id: string): Promise<Atom> => {
    const response = await apiClient.patch<Atom>(`/atoms/${id}/commit`);
    return response.data;
  },

  /**
   * Supersede a committed atom with a new atom
   */
  supersede: async (id: string, newAtomId: string): Promise<Atom> => {
    const response = await apiClient.patch<Atom>(`/atoms/${id}/supersede`, { newAtomId });
    return response.data;
  },

  /**
   * Add a tag to an atom
   */
  addTag: async (id: string, tag: string): Promise<Atom> => {
    const response = await apiClient.post<Atom>(`/atoms/${id}/tags`, { tag });
    return response.data;
  },

  /**
   * Remove a tag from an atom
   */
  removeTag: async (id: string, tag: string): Promise<Atom> => {
    const response = await apiClient.delete<Atom>(`/atoms/${id}/tags/${tag}`);
    return response.data;
  },

  /**
   * Get all unique tags with counts
   */
  getTags: async (): Promise<{ tag: string; count: number }[]> => {
    const response = await apiClient.get<{ tag: string; count: number }[]>('/tags');
    return response.data;
  },

  /**
   * Analyze raw intent for atomicity
   */
  analyze: async (data: AnalyzeIntentDto): Promise<AtomizationResult> => {
    const response = await apiClient.post<AtomizationResult>('/atoms/analyze', data);
    return response.data;
  },

  /**
   * Refine an atom with feedback
   */
  refine: async (id: string, data: RefineAtomDto): Promise<Atom> => {
    const response = await apiClient.post<Atom>(`/atoms/${id}/refine`, data);
    return response.data;
  },

  /**
   * Get refinement suggestions for an atom
   */
  suggestRefinements: async (id: string): Promise<AtomizationResult> => {
    const response = await apiClient.post<AtomizationResult>(`/atoms/${id}/suggest-refinements`);
    return response.data;
  },

  /**
   * Accept a refinement suggestion
   */
  acceptSuggestion: async (id: string, data: AcceptSuggestionDto): Promise<Atom> => {
    const response = await apiClient.post<Atom>(`/atoms/${id}/accept-suggestion`, data);
    return response.data;
  },

  /**
   * Get refinement history for an atom
   */
  getRefinementHistory: async (id: string): Promise<RefinementEntry[]> => {
    const response = await apiClient.get<RefinementEntry[]>(`/atoms/${id}/refinement-history`);
    return response.data;
  },
};
