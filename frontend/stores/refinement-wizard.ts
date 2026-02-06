import { create } from 'zustand';
import type { AtomizationResult, AtomCategory } from '@/types/atom';

/**
 * Refinement wizard state for multi-step atom creation/refinement
 */
interface RefinementWizardState {
  // Current step (0-indexed)
  step: number;

  // User's raw intent input
  rawIntent: string;

  // Analysis result from backend
  analysisResult: AtomizationResult | null;

  // Selected category
  selectedCategory: AtomCategory | null;

  // Refined description
  refinedDescription: string;

  // Pending suggestions that haven't been accepted/rejected
  pendingSuggestions: string[];

  // Whether the wizard is open
  isOpen: boolean;

  // Loading state
  isAnalyzing: boolean;

  // Error state
  error: string | null;

  // Actions
  setRawIntent: (intent: string) => void;
  setAnalysisResult: (result: AtomizationResult) => void;
  setSelectedCategory: (category: AtomCategory) => void;
  setRefinedDescription: (description: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  acceptSuggestion: (index: number) => void;
  rejectSuggestion: (index: number) => void;
  openWizard: () => void;
  closeWizard: () => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  step: 0,
  rawIntent: '',
  analysisResult: null,
  selectedCategory: null,
  refinedDescription: '',
  pendingSuggestions: [],
  isOpen: false,
  isAnalyzing: false,
  error: null,
};

export const useRefinementWizardStore = create<RefinementWizardState>((set) => ({
  ...initialState,

  setRawIntent: (intent) => set({ rawIntent: intent }),

  setAnalysisResult: (result) =>
    set({
      analysisResult: result,
      refinedDescription: result.suggestedDescription,
      selectedCategory: result.suggestedCategory,
      pendingSuggestions: [
        ...result.clarifyingQuestions,
        ...result.decompositionSuggestions,
      ],
    }),

  setSelectedCategory: (category) => set({ selectedCategory: category }),

  setRefinedDescription: (description) => set({ refinedDescription: description }),

  nextStep: () => set((state) => ({ step: state.step + 1 })),

  prevStep: () => set((state) => ({ step: Math.max(0, state.step - 1) })),

  goToStep: (step) => set({ step }),

  acceptSuggestion: (index) =>
    set((state) => ({
      pendingSuggestions: state.pendingSuggestions.filter((_, i) => i !== index),
    })),

  rejectSuggestion: (index) =>
    set((state) => ({
      pendingSuggestions: state.pendingSuggestions.filter((_, i) => i !== index),
    })),

  openWizard: () => set({ isOpen: true }),

  closeWizard: () => set({ isOpen: false }),

  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));
