import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { templatesApi } from '@/lib/api/templates';
import type {
  TemplateFilters,
  ValidatorTemplate,
  CreateTemplateDto,
  UpdateTemplateDto,
  InstantiateTemplateDto,
  TemplateCategory,
} from '@/types/validator';
import { validatorKeys } from './use-validators';
import { toast } from 'sonner';

/**
 * Query key factory for templates
 */
export const templateKeys = {
  all: ['templates'] as const,
  lists: () => [...templateKeys.all, 'list'] as const,
  list: (filters: TemplateFilters) => [...templateKeys.lists(), filters] as const,
  details: () => [...templateKeys.all, 'detail'] as const,
  detail: (id: string) => [...templateKeys.details(), id] as const,
  byCategory: (category: TemplateCategory) => [...templateKeys.all, 'category', category] as const,
  categories: () => [...templateKeys.all, 'categories'] as const,
  statistics: () => [...templateKeys.all, 'statistics'] as const,
  tags: () => [...templateKeys.all, 'tags'] as const,
  usage: (id: string) => [...templateKeys.all, 'usage', id] as const,
};

/**
 * Hook to fetch paginated templates list
 */
export function useTemplates(filters: TemplateFilters = {}) {
  return useQuery({
    queryKey: templateKeys.list(filters),
    queryFn: () => templatesApi.list(filters),
  });
}

/**
 * Hook to fetch a single template by ID
 */
export function useTemplate(id: string) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: () => templatesApi.get(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch templates by category
 */
export function useTemplatesByCategory(category: TemplateCategory) {
  return useQuery({
    queryKey: templateKeys.byCategory(category),
    queryFn: () => templatesApi.getByCategory(category),
    enabled: !!category,
  });
}

/**
 * Hook to fetch template categories with counts
 */
export function useTemplateCategories() {
  return useQuery({
    queryKey: templateKeys.categories(),
    queryFn: () => templatesApi.getCategories(),
  });
}

/**
 * Hook to fetch template statistics
 */
export function useTemplateStatistics() {
  return useQuery({
    queryKey: templateKeys.statistics(),
    queryFn: () => templatesApi.getStatistics(),
  });
}

/**
 * Hook to fetch popular template tags
 */
export function useTemplateTags(limit?: number) {
  return useQuery({
    queryKey: [...templateKeys.tags(), limit],
    queryFn: () => templatesApi.getPopularTags(limit),
  });
}

/**
 * Hook to fetch template usage information
 */
export function useTemplateUsage(id: string) {
  return useQuery({
    queryKey: templateKeys.usage(id),
    queryFn: () => templatesApi.getUsage(id),
    enabled: !!id,
  });
}

/**
 * Hook to create a new custom template
 */
export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTemplateDto) => templatesApi.create(data),
    onSuccess: (newTemplate) => {
      // Invalidate templates list
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      queryClient.invalidateQueries({ queryKey: templateKeys.categories() });
      queryClient.invalidateQueries({ queryKey: templateKeys.statistics() });
      toast.success(`Template "${newTemplate.name}" created`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to create template: ${error.message}`);
    },
  });
}

/**
 * Hook to update a custom template
 */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTemplateDto }) =>
      templatesApi.update(id, data),
    onSuccess: (updatedTemplate) => {
      // Update the specific template in cache
      queryClient.setQueryData(templateKeys.detail(updatedTemplate.id), updatedTemplate);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      toast.success(`Template "${updatedTemplate.name}" updated`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update template: ${error.message}`);
    },
  });
}

/**
 * Hook to delete a custom template
 */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => templatesApi.delete(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: templateKeys.detail(deletedId) });
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      queryClient.invalidateQueries({ queryKey: templateKeys.categories() });
      queryClient.invalidateQueries({ queryKey: templateKeys.statistics() });
      toast.success('Template deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete template: ${error.message}`);
    },
  });
}

/**
 * Hook to instantiate a validator from a template
 */
export function useInstantiateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: Omit<InstantiateTemplateDto, 'templateId'> }) =>
      templatesApi.instantiate(templateId, data),
    onSuccess: (newValidator, { templateId, data }) => {
      // Invalidate validators list
      queryClient.invalidateQueries({ queryKey: validatorKeys.lists() });
      queryClient.invalidateQueries({ queryKey: validatorKeys.byAtom(data.atomId) });
      // Update template usage
      queryClient.invalidateQueries({ queryKey: templateKeys.usage(templateId) });
      queryClient.invalidateQueries({ queryKey: templateKeys.statistics() });
      toast.success(`Validator "${newValidator.name}" created from template`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to instantiate template: ${error.message}`);
    },
  });
}
