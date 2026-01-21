import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useRefinementWizardStore } from '@/stores/refinement-wizard';
import type { AtomizationResult } from '@/types/atom';

describe('useRefinementWizardStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    act(() => {
      useRefinementWizardStore.getState().reset();
    });
  });

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useRefinementWizardStore.getState();
      expect(state.step).toBe(0);
      expect(state.rawIntent).toBe('');
      expect(state.analysisResult).toBeNull();
      expect(state.selectedCategory).toBeNull();
      expect(state.refinedDescription).toBe('');
      expect(state.pendingSuggestions).toEqual([]);
      expect(state.isOpen).toBe(false);
      expect(state.isAnalyzing).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('setRawIntent', () => {
    it('updates raw intent', () => {
      act(() => {
        useRefinementWizardStore.getState().setRawIntent('Test intent');
      });
      expect(useRefinementWizardStore.getState().rawIntent).toBe('Test intent');
    });
  });

  describe('setAnalysisResult', () => {
    it('updates analysis result and related fields', () => {
      const mockResult: AtomizationResult = {
        isAtomic: true,
        confidence: 0.85,
        suggestedDescription: 'Refined description',
        suggestedCategory: 'functional',
        clarifyingQuestions: ['Question 1'],
        decompositionSuggestions: ['Suggestion 1', 'Suggestion 2'],
        implementationConcerns: [],
      };

      act(() => {
        useRefinementWizardStore.getState().setAnalysisResult(mockResult);
      });

      const state = useRefinementWizardStore.getState();
      expect(state.analysisResult).toEqual(mockResult);
      expect(state.refinedDescription).toBe('Refined description');
      expect(state.selectedCategory).toBe('functional');
      expect(state.pendingSuggestions).toEqual([
        'Question 1',
        'Suggestion 1',
        'Suggestion 2',
      ]);
    });
  });

  describe('setSelectedCategory', () => {
    it('updates selected category', () => {
      act(() => {
        useRefinementWizardStore.getState().setSelectedCategory('security');
      });
      expect(useRefinementWizardStore.getState().selectedCategory).toBe('security');
    });
  });

  describe('setRefinedDescription', () => {
    it('updates refined description', () => {
      act(() => {
        useRefinementWizardStore.getState().setRefinedDescription('New description');
      });
      expect(useRefinementWizardStore.getState().refinedDescription).toBe('New description');
    });
  });

  describe('step navigation', () => {
    it('nextStep increments step', () => {
      act(() => {
        useRefinementWizardStore.getState().nextStep();
      });
      expect(useRefinementWizardStore.getState().step).toBe(1);

      act(() => {
        useRefinementWizardStore.getState().nextStep();
      });
      expect(useRefinementWizardStore.getState().step).toBe(2);
    });

    it('prevStep decrements step but not below 0', () => {
      act(() => {
        useRefinementWizardStore.getState().nextStep();
        useRefinementWizardStore.getState().nextStep();
      });
      expect(useRefinementWizardStore.getState().step).toBe(2);

      act(() => {
        useRefinementWizardStore.getState().prevStep();
      });
      expect(useRefinementWizardStore.getState().step).toBe(1);

      act(() => {
        useRefinementWizardStore.getState().prevStep();
      });
      expect(useRefinementWizardStore.getState().step).toBe(0);

      act(() => {
        useRefinementWizardStore.getState().prevStep();
      });
      expect(useRefinementWizardStore.getState().step).toBe(0); // Should not go below 0
    });

    it('goToStep sets specific step', () => {
      act(() => {
        useRefinementWizardStore.getState().goToStep(2);
      });
      expect(useRefinementWizardStore.getState().step).toBe(2);
    });
  });

  describe('suggestion handling', () => {
    beforeEach(() => {
      const mockResult: AtomizationResult = {
        isAtomic: false,
        confidence: 0.5,
        suggestedDescription: 'Test',
        suggestedCategory: 'functional',
        clarifyingQuestions: ['Q1', 'Q2'],
        decompositionSuggestions: ['S1'],
        implementationConcerns: [],
      };
      act(() => {
        useRefinementWizardStore.getState().setAnalysisResult(mockResult);
      });
    });

    it('acceptSuggestion removes suggestion at index', () => {
      expect(useRefinementWizardStore.getState().pendingSuggestions).toHaveLength(3);

      act(() => {
        useRefinementWizardStore.getState().acceptSuggestion(1);
      });

      const suggestions = useRefinementWizardStore.getState().pendingSuggestions;
      expect(suggestions).toHaveLength(2);
      expect(suggestions).toEqual(['Q1', 'S1']);
    });

    it('rejectSuggestion removes suggestion at index', () => {
      act(() => {
        useRefinementWizardStore.getState().rejectSuggestion(0);
      });

      const suggestions = useRefinementWizardStore.getState().pendingSuggestions;
      expect(suggestions).toHaveLength(2);
      expect(suggestions).toEqual(['Q2', 'S1']);
    });
  });

  describe('wizard visibility', () => {
    it('openWizard sets isOpen to true', () => {
      expect(useRefinementWizardStore.getState().isOpen).toBe(false);
      act(() => {
        useRefinementWizardStore.getState().openWizard();
      });
      expect(useRefinementWizardStore.getState().isOpen).toBe(true);
    });

    it('closeWizard sets isOpen to false', () => {
      act(() => {
        useRefinementWizardStore.getState().openWizard();
      });
      expect(useRefinementWizardStore.getState().isOpen).toBe(true);

      act(() => {
        useRefinementWizardStore.getState().closeWizard();
      });
      expect(useRefinementWizardStore.getState().isOpen).toBe(false);
    });
  });

  describe('loading state', () => {
    it('setIsAnalyzing updates analyzing state', () => {
      act(() => {
        useRefinementWizardStore.getState().setIsAnalyzing(true);
      });
      expect(useRefinementWizardStore.getState().isAnalyzing).toBe(true);

      act(() => {
        useRefinementWizardStore.getState().setIsAnalyzing(false);
      });
      expect(useRefinementWizardStore.getState().isAnalyzing).toBe(false);
    });
  });

  describe('error state', () => {
    it('setError updates error', () => {
      act(() => {
        useRefinementWizardStore.getState().setError('Something went wrong');
      });
      expect(useRefinementWizardStore.getState().error).toBe('Something went wrong');

      act(() => {
        useRefinementWizardStore.getState().setError(null);
      });
      expect(useRefinementWizardStore.getState().error).toBeNull();
    });
  });

  describe('reset', () => {
    it('resets all state to initial values', () => {
      // Modify multiple fields
      act(() => {
        useRefinementWizardStore.getState().setRawIntent('Test intent');
        useRefinementWizardStore.getState().nextStep();
        useRefinementWizardStore.getState().openWizard();
        useRefinementWizardStore.getState().setError('Error');
        useRefinementWizardStore.getState().setIsAnalyzing(true);
      });

      // Verify modifications
      let state = useRefinementWizardStore.getState();
      expect(state.rawIntent).toBe('Test intent');
      expect(state.step).toBe(1);
      expect(state.isOpen).toBe(true);
      expect(state.error).toBe('Error');

      // Reset
      act(() => {
        useRefinementWizardStore.getState().reset();
      });

      // Verify reset
      state = useRefinementWizardStore.getState();
      expect(state.step).toBe(0);
      expect(state.rawIntent).toBe('');
      expect(state.isOpen).toBe(false);
      expect(state.error).toBeNull();
      expect(state.isAnalyzing).toBe(false);
    });
  });
});
