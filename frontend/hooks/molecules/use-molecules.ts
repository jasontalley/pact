import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { moleculesApi } from '@/lib/api/molecules';
import type {
  Molecule,
  MoleculeWithMetrics,
  MoleculeFilters,
  CreateMoleculeDto,
  UpdateMoleculeDto,
  AddAtomToMoleculeDto,
  BatchAddAtomsDto,
  ReorderAtomsDto,
  GetAtomsQueryDto,
  MoleculeAtom,
  MoleculeMetrics,
  MoleculeStatistics,
  LensTypeInfo,
} from '@/types/molecule';
import type { Atom } from '@/types/atom';
import { toast } from 'sonner';
import { atomKeys } from '../atoms/use-atoms';

/**
 * Query key factory for molecules
 */
export const moleculeKeys = {
  all: ['molecules'] as const,
  lists: () => [...moleculeKeys.all, 'list'] as const,
  list: (filters: MoleculeFilters) => [...moleculeKeys.lists(), filters] as const,
  details: () => [...moleculeKeys.all, 'detail'] as const,
  detail: (id: string) => [...moleculeKeys.details(), id] as const,
  atoms: (id: string, options?: GetAtomsQueryDto) =>
    [...moleculeKeys.all, 'atoms', id, options] as const,
  children: (id: string) => [...moleculeKeys.all, 'children', id] as const,
  ancestors: (id: string) => [...moleculeKeys.all, 'ancestors', id] as const,
  metrics: (id: string) => [...moleculeKeys.all, 'metrics', id] as const,
  statistics: () => [...moleculeKeys.all, 'statistics'] as const,
  lensTypes: () => [...moleculeKeys.all, 'lens-types'] as const,
  orphanAtoms: () => [...moleculeKeys.all, 'orphan-atoms'] as const,
  byAtom: (atomId: string) => [...moleculeKeys.all, 'by-atom', atomId] as const,
};

// ========================================
// Molecule CRUD Hooks
// ========================================

/**
 * Hook to fetch paginated molecules list
 */
export function useMolecules(filters: MoleculeFilters = {}) {
  return useQuery({
    queryKey: moleculeKeys.list(filters),
    queryFn: () => moleculesApi.list(filters),
  });
}

/**
 * Hook to fetch a single molecule by ID with metrics
 */
export function useMolecule(id: string) {
  return useQuery({
    queryKey: moleculeKeys.detail(id),
    queryFn: () => moleculesApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook to create a new molecule
 */
export function useCreateMolecule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMoleculeDto) => moleculesApi.create(data),
    onSuccess: (newMolecule) => {
      // Invalidate molecules list
      queryClient.invalidateQueries({ queryKey: moleculeKeys.lists() });
      // Invalidate statistics
      queryClient.invalidateQueries({ queryKey: moleculeKeys.statistics() });
      // If has parent, invalidate parent's children
      if (newMolecule.parentMoleculeId) {
        queryClient.invalidateQueries({
          queryKey: moleculeKeys.children(newMolecule.parentMoleculeId),
        });
      }
      toast.success(`Molecule "${newMolecule.name}" created`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create molecule: ${error.message}`);
    },
  });
}

/**
 * Hook to update a molecule
 */
export function useUpdateMolecule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMoleculeDto }) =>
      moleculesApi.update(id, data),
    onSuccess: (updatedMolecule, { id }) => {
      // Update the specific molecule in cache
      queryClient.setQueryData(moleculeKeys.detail(id), (old: MoleculeWithMetrics | undefined) =>
        old ? { ...old, ...updatedMolecule } : undefined
      );
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: moleculeKeys.lists() });
      toast.success(`Molecule "${updatedMolecule.name}" updated`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update molecule: ${error.message}`);
    },
  });
}

/**
 * Hook to delete a molecule
 */
export function useDeleteMolecule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => moleculesApi.delete(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: moleculeKeys.detail(deletedId) });
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: moleculeKeys.lists() });
      // Invalidate statistics
      queryClient.invalidateQueries({ queryKey: moleculeKeys.statistics() });
      // Invalidate orphan atoms (atoms may become orphans)
      queryClient.invalidateQueries({ queryKey: moleculeKeys.orphanAtoms() });
      toast.success('Molecule deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete molecule: ${error.message}`);
    },
  });
}

// ========================================
// Atom Management Hooks
// ========================================

/**
 * Hook to fetch atoms in a molecule
 */
export function useMoleculeAtoms(moleculeId: string, options?: GetAtomsQueryDto) {
  return useQuery({
    queryKey: moleculeKeys.atoms(moleculeId, options),
    queryFn: () => moleculesApi.getAtoms(moleculeId, options),
    enabled: !!moleculeId,
  });
}

/**
 * Hook to add an atom to a molecule
 */
export function useAddAtomToMolecule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      moleculeId,
      data,
    }: {
      moleculeId: string;
      data: AddAtomToMoleculeDto;
    }) => moleculesApi.addAtom(moleculeId, data),
    onSuccess: (_, { moleculeId, data }) => {
      // Invalidate molecule's atoms list
      queryClient.invalidateQueries({ queryKey: moleculeKeys.atoms(moleculeId) });
      // Invalidate molecule detail (metrics change)
      queryClient.invalidateQueries({ queryKey: moleculeKeys.detail(moleculeId) });
      // Invalidate molecule metrics
      queryClient.invalidateQueries({ queryKey: moleculeKeys.metrics(moleculeId) });
      // Invalidate orphan atoms list
      queryClient.invalidateQueries({ queryKey: moleculeKeys.orphanAtoms() });
      // Invalidate molecules for the atom
      queryClient.invalidateQueries({ queryKey: moleculeKeys.byAtom(data.atomId) });
      toast.success('Atom added to molecule');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add atom: ${error.message}`);
    },
  });
}

/**
 * Hook to batch add atoms to a molecule
 */
export function useBatchAddAtoms() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      moleculeId,
      data,
    }: {
      moleculeId: string;
      data: BatchAddAtomsDto;
    }) => moleculesApi.batchAddAtoms(moleculeId, data),
    onSuccess: (_, { moleculeId, data }) => {
      // Invalidate molecule's atoms list
      queryClient.invalidateQueries({ queryKey: moleculeKeys.atoms(moleculeId) });
      // Invalidate molecule detail
      queryClient.invalidateQueries({ queryKey: moleculeKeys.detail(moleculeId) });
      // Invalidate molecule metrics
      queryClient.invalidateQueries({ queryKey: moleculeKeys.metrics(moleculeId) });
      // Invalidate orphan atoms list
      queryClient.invalidateQueries({ queryKey: moleculeKeys.orphanAtoms() });
      // Invalidate molecules for each atom
      data.atoms.forEach((atom) => {
        queryClient.invalidateQueries({ queryKey: moleculeKeys.byAtom(atom.atomId) });
      });
      toast.success(`${data.atoms.length} atoms added to molecule`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to add atoms: ${error.message}`);
    },
  });
}

/**
 * Hook to remove an atom from a molecule (soft delete)
 */
export function useRemoveAtomFromMolecule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ moleculeId, atomId }: { moleculeId: string; atomId: string }) =>
      moleculesApi.removeAtom(moleculeId, atomId),
    onSuccess: (_, { moleculeId, atomId }) => {
      // Invalidate molecule's atoms list
      queryClient.invalidateQueries({ queryKey: moleculeKeys.atoms(moleculeId) });
      // Invalidate molecule detail
      queryClient.invalidateQueries({ queryKey: moleculeKeys.detail(moleculeId) });
      // Invalidate molecule metrics
      queryClient.invalidateQueries({ queryKey: moleculeKeys.metrics(moleculeId) });
      // Invalidate orphan atoms list (atom may become orphan)
      queryClient.invalidateQueries({ queryKey: moleculeKeys.orphanAtoms() });
      // Invalidate molecules for the atom
      queryClient.invalidateQueries({ queryKey: moleculeKeys.byAtom(atomId) });
      toast.success('Atom removed from molecule');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove atom: ${error.message}`);
    },
  });
}

/**
 * Hook to reorder atoms in a molecule
 */
export function useReorderAtoms() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ moleculeId, data }: { moleculeId: string; data: ReorderAtomsDto }) =>
      moleculesApi.reorderAtoms(moleculeId, data),
    onSuccess: (_, { moleculeId }) => {
      // Invalidate molecule's atoms list
      queryClient.invalidateQueries({ queryKey: moleculeKeys.atoms(moleculeId) });
      toast.success('Atoms reordered');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reorder atoms: ${error.message}`);
    },
  });
}

/**
 * Hook to batch update atom properties in a molecule
 */
export function useBatchUpdateAtoms() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      moleculeId,
      atoms,
    }: {
      moleculeId: string;
      atoms: Array<{ atomId: string; order?: number; note?: string | null }>;
    }) => moleculesApi.batchUpdateAtoms(moleculeId, atoms),
    onSuccess: (_, { moleculeId }) => {
      // Invalidate molecule's atoms list
      queryClient.invalidateQueries({ queryKey: moleculeKeys.atoms(moleculeId) });
      toast.success('Atoms updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update atoms: ${error.message}`);
    },
  });
}

// ========================================
// Hierarchy Navigation Hooks
// ========================================

/**
 * Hook to fetch child molecules
 */
export function useMoleculeChildren(id: string) {
  return useQuery({
    queryKey: moleculeKeys.children(id),
    queryFn: () => moleculesApi.getChildren(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch ancestor chain (from immediate parent to root)
 */
export function useMoleculeAncestors(id: string) {
  return useQuery({
    queryKey: moleculeKeys.ancestors(id),
    queryFn: () => moleculesApi.getAncestors(id),
    enabled: !!id,
  });
}

// ========================================
// Metrics & Statistics Hooks
// ========================================

/**
 * Hook to fetch computed metrics for a molecule
 */
export function useMoleculeMetrics(id: string) {
  return useQuery({
    queryKey: moleculeKeys.metrics(id),
    queryFn: () => moleculesApi.getMetrics(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch aggregate statistics about molecules
 */
export function useMoleculeStatistics() {
  return useQuery({
    queryKey: moleculeKeys.statistics(),
    queryFn: () => moleculesApi.getStatistics(),
  });
}

/**
 * Hook to fetch available lens types with metadata
 */
export function useLensTypes() {
  return useQuery({
    queryKey: moleculeKeys.lensTypes(),
    queryFn: () => moleculesApi.getLensTypes(),
    staleTime: Infinity, // Lens types don't change
  });
}

/**
 * Hook to fetch orphan atoms (not in any molecule)
 */
export function useOrphanAtoms() {
  return useQuery({
    queryKey: moleculeKeys.orphanAtoms(),
    queryFn: () => moleculesApi.getOrphanAtoms(),
  });
}

// ========================================
// Atom Integration Hooks
// ========================================

/**
 * Hook to fetch molecules containing a specific atom
 */
export function useMoleculesForAtom(atomId: string) {
  return useQuery({
    queryKey: moleculeKeys.byAtom(atomId),
    queryFn: () => moleculesApi.getMoleculesForAtom(atomId),
    enabled: !!atomId,
  });
}
