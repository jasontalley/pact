import { apiClient } from './client';
import type {
  Commitment,
  CreateCommitmentDto,
  SupersedeCommitmentDto,
  CommitmentFilters,
  PaginatedCommitmentsResponse,
  CommitmentPreview,
  AtomSummary,
} from '@/types/commitment';
import type { Atom } from '@/types/atom';

/**
 * Commitment API functions
 */
export const commitmentsApi = {
  /**
   * List commitments with optional filters
   */
  list: async (params?: CommitmentFilters): Promise<PaginatedCommitmentsResponse> => {
    const response = await apiClient.get<PaginatedCommitmentsResponse>('/commitments', { params });
    return response.data;
  },

  /**
   * Get a single commitment by ID
   */
  get: async (id: string): Promise<Commitment> => {
    const response = await apiClient.get<Commitment>(`/commitments/${id}`);
    return response.data;
  },

  /**
   * Create a new commitment
   * Makes included atoms immutable (INV-006)
   */
  create: async (data: CreateCommitmentDto): Promise<Commitment> => {
    const response = await apiClient.post<Commitment>('/commitments', data);
    return response.data;
  },

  /**
   * Preview a commitment (dry-run)
   * Runs all invariant checks without creating the commitment
   */
  preview: async (data: CreateCommitmentDto): Promise<CommitmentPreview> => {
    const response = await apiClient.post<CommitmentPreview>('/commitments/preview', data);
    return response.data;
  },

  /**
   * Supersede an existing commitment
   * Creates a new commitment and marks the original as superseded
   */
  supersede: async (id: string, data: SupersedeCommitmentDto): Promise<Commitment> => {
    const response = await apiClient.post<Commitment>(`/commitments/${id}/supersede`, data);
    return response.data;
  },

  /**
   * Get supersession history for a commitment
   * Returns the full chain from original to latest
   */
  getHistory: async (id: string): Promise<Commitment[]> => {
    const response = await apiClient.get<Commitment[]>(`/commitments/${id}/history`);
    return response.data;
  },

  /**
   * Get atoms included in a commitment
   */
  getAtoms: async (id: string): Promise<Atom[]> => {
    const response = await apiClient.get<Atom[]>(`/commitments/${id}/atoms`);
    return response.data;
  },
};
