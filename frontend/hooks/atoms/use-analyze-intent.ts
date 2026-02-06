import { useMutation } from '@tanstack/react-query';
import { atomsApi } from '@/lib/api/atoms';
import type { AnalyzeIntentDto } from '@/types/atom';
import { useRefinementWizardStore } from '@/stores/refinement-wizard';
import { toast } from 'sonner';

/**
 * Hook to analyze raw intent for atomicity
 */
export function useAnalyzeIntent() {
  const { setAnalysisResult, setIsAnalyzing, setError, nextStep } =
    useRefinementWizardStore();

  return useMutation({
    mutationFn: (data: AnalyzeIntentDto) => atomsApi.analyze(data),
    onMutate: () => {
      setIsAnalyzing(true);
      setError(null);
    },
    onSuccess: (result) => {
      setAnalysisResult(result);
      setIsAnalyzing(false);
      nextStep();

      // Show feedback based on atomicity
      if (result.atomicity.isAtomic) {
        toast.success('Intent looks atomic! Ready to create.');
      } else {
        toast.info('Intent may need refinement. See suggestions.');
      }
    },
    onError: (error: Error) => {
      setIsAnalyzing(false);
      setError(error.message);
      toast.error(`Analysis failed: ${error.message}`);
    },
  });
}

/**
 * Hook to refine an existing atom
 */
export function useRefineAtom() {
  return useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback: string }) =>
      atomsApi.refine(id, { feedback }),
    onSuccess: (refinedAtom) => {
      toast.success(`Atom refined. New quality score: ${refinedAtom.qualityScore}`);
    },
    onError: (error: Error) => {
      toast.error(`Refinement failed: ${error.message}`);
    },
  });
}

/**
 * Hook to get refinement suggestions for an atom
 */
export function useSuggestRefinements() {
  return useMutation({
    mutationFn: (id: string) => atomsApi.suggestRefinements(id),
    onError: (error: Error) => {
      toast.error(`Failed to get suggestions: ${error.message}`);
    },
  });
}

/**
 * Hook to accept a refinement suggestion
 */
export function useAcceptSuggestion() {
  return useMutation({
    mutationFn: ({
      id,
      suggestionIndex,
      suggestionType,
    }: {
      id: string;
      suggestionIndex: number;
      suggestionType: 'clarification' | 'decomposition' | 'precision';
    }) => atomsApi.acceptSuggestion(id, { suggestionIndex, suggestionType }),
    onSuccess: (updatedAtom) => {
      toast.success(`Suggestion applied. Quality score: ${updatedAtom.qualityScore}`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to apply suggestion: ${error.message}`);
    },
  });
}
