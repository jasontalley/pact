import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { validatorsApi } from '@/lib/api/validators';
import type {
  ValidatorFilters,
  Validator,
  CreateValidatorDto,
  UpdateValidatorDto,
  ValidatorFormat,
  TranslateValidatorDto,
} from '@/types/validator';
import { toast } from 'sonner';

/**
 * Query key factory for validators
 */
export const validatorKeys = {
  all: ['validators'] as const,
  lists: () => [...validatorKeys.all, 'list'] as const,
  list: (filters: ValidatorFilters) => [...validatorKeys.lists(), filters] as const,
  details: () => [...validatorKeys.all, 'detail'] as const,
  detail: (id: string) => [...validatorKeys.details(), id] as const,
  byAtom: (atomId: string) => [...validatorKeys.all, 'atom', atomId] as const,
  statistics: () => [...validatorKeys.all, 'statistics'] as const,
  translations: (id: string) => [...validatorKeys.all, 'translations', id] as const,
};

/**
 * Hook to fetch paginated validators list
 */
export function useValidators(filters: ValidatorFilters = {}) {
  return useQuery({
    queryKey: validatorKeys.list(filters),
    queryFn: () => validatorsApi.list(filters),
  });
}

/**
 * Hook to fetch a single validator by ID
 */
export function useValidator(id: string) {
  return useQuery({
    queryKey: validatorKeys.detail(id),
    queryFn: () => validatorsApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch validators for a specific atom
 */
export function useAtomValidators(atomId: string) {
  return useQuery({
    queryKey: validatorKeys.byAtom(atomId),
    queryFn: () => validatorsApi.getByAtom(atomId),
    enabled: !!atomId,
  });
}

/**
 * Hook to fetch validator statistics
 */
export function useValidatorStatistics() {
  return useQuery({
    queryKey: validatorKeys.statistics(),
    queryFn: () => validatorsApi.getStatistics(),
  });
}

/**
 * Hook to create a new validator
 */
export function useCreateValidator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateValidatorDto) => validatorsApi.create(data),
    onSuccess: (newValidator) => {
      // Invalidate validators list
      queryClient.invalidateQueries({ queryKey: validatorKeys.lists() });
      // Invalidate atom-specific validators
      queryClient.invalidateQueries({ queryKey: validatorKeys.byAtom(newValidator.atomId) });
      toast.success(`Validator "${newValidator.name}" created`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create validator: ${error.message}`);
    },
  });
}

/**
 * Hook to update a validator
 */
export function useUpdateValidator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateValidatorDto }) =>
      validatorsApi.update(id, data),
    onSuccess: (updatedValidator) => {
      // Update the specific validator in cache
      queryClient.setQueryData(validatorKeys.detail(updatedValidator.id), updatedValidator);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: validatorKeys.lists() });
      queryClient.invalidateQueries({ queryKey: validatorKeys.byAtom(updatedValidator.atomId) });
      toast.success(`Validator "${updatedValidator.name}" updated`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update validator: ${error.message}`);
    },
  });
}

/**
 * Hook to delete a validator (soft delete)
 */
export function useDeleteValidator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => validatorsApi.delete(id),
    onSuccess: (deletedValidator) => {
      // Update cache with deactivated validator
      queryClient.setQueryData(validatorKeys.detail(deletedValidator.id), deletedValidator);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: validatorKeys.lists() });
      queryClient.invalidateQueries({ queryKey: validatorKeys.byAtom(deletedValidator.atomId) });
      toast.success('Validator deactivated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete validator: ${error.message}`);
    },
  });
}

/**
 * Hook to permanently delete a validator
 */
export function useHardDeleteValidator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => validatorsApi.hardDelete(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: validatorKeys.detail(deletedId) });
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: validatorKeys.lists() });
      toast.success('Validator permanently deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete validator: ${error.message}`);
    },
  });
}

/**
 * Hook to activate a validator
 */
export function useActivateValidator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => validatorsApi.activate(id),
    onSuccess: (activatedValidator) => {
      queryClient.setQueryData(validatorKeys.detail(activatedValidator.id), activatedValidator);
      queryClient.invalidateQueries({ queryKey: validatorKeys.lists() });
      queryClient.invalidateQueries({ queryKey: validatorKeys.byAtom(activatedValidator.atomId) });
      toast.success(`Validator "${activatedValidator.name}" activated`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to activate validator: ${error.message}`);
    },
  });
}

/**
 * Hook to deactivate a validator
 */
export function useDeactivateValidator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => validatorsApi.deactivate(id),
    onSuccess: (deactivatedValidator) => {
      queryClient.setQueryData(validatorKeys.detail(deactivatedValidator.id), deactivatedValidator);
      queryClient.invalidateQueries({ queryKey: validatorKeys.lists() });
      queryClient.invalidateQueries({ queryKey: validatorKeys.byAtom(deactivatedValidator.atomId) });
      toast.success(`Validator "${deactivatedValidator.name}" deactivated`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to deactivate validator: ${error.message}`);
    },
  });
}

/**
 * Hook to translate validator content
 */
export function useTranslateContent() {
  return useMutation({
    mutationFn: (data: TranslateValidatorDto) => validatorsApi.translate(data),
    onError: (error: Error) => {
      toast.error(`Translation failed: ${error.message}`);
    },
  });
}

/**
 * Hook to translate an existing validator to a new format
 */
export function useTranslateValidator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, targetFormat }: { id: string; targetFormat: ValidatorFormat }) =>
      validatorsApi.translateValidator(id, targetFormat),
    onSuccess: ({ validator }) => {
      queryClient.setQueryData(validatorKeys.detail(validator.id), validator);
      queryClient.invalidateQueries({ queryKey: validatorKeys.translations(validator.id) });
      toast.success('Translation complete');
    },
    onError: (error: Error) => {
      toast.error(`Translation failed: ${error.message}`);
    },
  });
}

/**
 * Hook to get cached translations for a validator
 */
export function useValidatorTranslations(id: string) {
  return useQuery({
    queryKey: validatorKeys.translations(id),
    queryFn: () => validatorsApi.getTranslations(id),
    enabled: !!id,
  });
}

/**
 * Hook to test round-trip translation
 */
export function useTestRoundTrip() {
  return useMutation({
    mutationFn: ({ id, targetFormat }: { id: string; targetFormat: ValidatorFormat }) =>
      validatorsApi.testRoundTrip(id, targetFormat),
    onError: (error: Error) => {
      toast.error(`Round-trip test failed: ${error.message}`);
    },
  });
}
