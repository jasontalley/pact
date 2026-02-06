import { apiClient } from './client';
import type {
  Molecule,
  MoleculeWithMetrics,
  CreateMoleculeDto,
  UpdateMoleculeDto,
  MoleculeFilters,
  MoleculeListResponse,
  MoleculeMetrics,
  MoleculeStatistics,
  MoleculeAtom,
  AddAtomToMoleculeDto,
  BatchAddAtomsDto,
  ReorderAtomsDto,
  GetAtomsQueryDto,
  LensTypeInfo,
} from '@/types/molecule';
import type { Atom } from '@/types/atom';

/**
 * Molecules API functions
 */
export const moleculesApi = {
  // ========================================
  // Molecule CRUD
  // ========================================

  /**
   * List molecules with optional filters and pagination
   */
  list: async (params?: MoleculeFilters): Promise<MoleculeListResponse> => {
    const response = await apiClient.get<MoleculeListResponse>('/molecules', { params });
    return response.data;
  },

  /**
   * Get a single molecule by ID with metrics
   */
  get: async (id: string): Promise<MoleculeWithMetrics> => {
    const response = await apiClient.get<MoleculeWithMetrics>(`/molecules/${id}`);
    return response.data;
  },

  /**
   * Create a new molecule
   */
  create: async (data: CreateMoleculeDto): Promise<Molecule> => {
    const response = await apiClient.post<Molecule>('/molecules', data);
    return response.data;
  },

  /**
   * Update a molecule
   */
  update: async (id: string, data: UpdateMoleculeDto): Promise<Molecule> => {
    const response = await apiClient.patch<Molecule>(`/molecules/${id}`, data);
    return response.data;
  },

  /**
   * Delete a molecule (does not delete atoms)
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/molecules/${id}`);
  },

  // ========================================
  // Atom Management
  // ========================================

  /**
   * Get atoms in a molecule
   */
  getAtoms: async (id: string, options?: GetAtomsQueryDto): Promise<Atom[]> => {
    const response = await apiClient.get<Atom[]>(`/molecules/${id}/atoms`, {
      params: options,
    });
    return response.data;
  },

  /**
   * Add an atom to a molecule
   */
  addAtom: async (moleculeId: string, data: AddAtomToMoleculeDto): Promise<MoleculeAtom> => {
    const response = await apiClient.post<MoleculeAtom>(
      `/molecules/${moleculeId}/atoms`,
      data
    );
    return response.data;
  },

  /**
   * Batch add atoms to a molecule
   */
  batchAddAtoms: async (
    moleculeId: string,
    data: BatchAddAtomsDto
  ): Promise<MoleculeAtom[]> => {
    const response = await apiClient.post<MoleculeAtom[]>(
      `/molecules/${moleculeId}/atoms:batch`,
      data
    );
    return response.data;
  },

  /**
   * Remove an atom from a molecule (soft delete)
   */
  removeAtom: async (moleculeId: string, atomId: string): Promise<void> => {
    await apiClient.delete(`/molecules/${moleculeId}/atoms/${atomId}`);
  },

  /**
   * Reorder atoms in a molecule
   */
  reorderAtoms: async (moleculeId: string, data: ReorderAtomsDto): Promise<void> => {
    await apiClient.patch(`/molecules/${moleculeId}/atoms:reorder`, data);
  },

  /**
   * Batch update atom properties in a molecule
   */
  batchUpdateAtoms: async (
    moleculeId: string,
    atoms: Array<{ atomId: string; order?: number; note?: string | null }>
  ): Promise<void> => {
    await apiClient.patch(`/molecules/${moleculeId}/atoms:batchUpdate`, { atoms });
  },

  // ========================================
  // Hierarchy Navigation
  // ========================================

  /**
   * Get child molecules
   */
  getChildren: async (id: string): Promise<Molecule[]> => {
    const response = await apiClient.get<Molecule[]>(`/molecules/${id}/children`);
    return response.data;
  },

  /**
   * Get ancestor chain (from immediate parent to root)
   */
  getAncestors: async (id: string): Promise<Molecule[]> => {
    const response = await apiClient.get<Molecule[]>(`/molecules/${id}/ancestors`);
    return response.data;
  },

  // ========================================
  // Metrics & Statistics
  // ========================================

  /**
   * Get computed metrics for a molecule
   */
  getMetrics: async (id: string): Promise<MoleculeMetrics> => {
    const response = await apiClient.get<MoleculeMetrics>(`/molecules/${id}/metrics`);
    return response.data;
  },

  /**
   * Get aggregate statistics about molecules
   */
  getStatistics: async (): Promise<MoleculeStatistics> => {
    const response = await apiClient.get<MoleculeStatistics>('/molecules/statistics');
    return response.data;
  },

  /**
   * Get available lens types with metadata
   */
  getLensTypes: async (): Promise<LensTypeInfo[]> => {
    const response = await apiClient.get<LensTypeInfo[]>('/molecules/lens-types');
    return response.data;
  },

  /**
   * Get orphan atoms (not in any molecule)
   */
  getOrphanAtoms: async (): Promise<Atom[]> => {
    const response = await apiClient.get<Atom[]>('/molecules/orphan-atoms');
    return response.data;
  },

  // ========================================
  // Atom Integration
  // ========================================

  /**
   * Get molecules containing a specific atom
   */
  getMoleculesForAtom: async (atomId: string): Promise<Molecule[]> => {
    const response = await apiClient.get<Molecule[]>(`/atoms/${atomId}/molecules`);
    return response.data;
  },
};
