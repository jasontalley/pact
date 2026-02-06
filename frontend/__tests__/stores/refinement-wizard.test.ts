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
    // @atom IA-STORE-003
    it('has correct initial values', () => {
      const state = useRefinementWizardStore.getState();
      // Verify step starts at 0 (first step of wizard)
      expect(state.step).toBe(0);
      // Verify rawIntent is empty string (no user input yet)
      expect(state.rawIntent).toBe('');
      // Verify analysisResult is null (no analysis performed yet)
      expect(state.analysisResult).toBeNull();
      // Verify selectedCategory is null (no category selected yet)
      expect(state.selectedCategory).toBeNull();
      // Verify refinedDescription is empty string (no refinement yet)
      expect(state.refinedDescription).toBe('');
      // Verify pendingSuggestions is empty array (no suggestions yet)
      expect(state.pendingSuggestions).toEqual([]);
      // Verify wizard is closed by default
      expect(state.isOpen).toBe(false);
      // Verify not analyzing by default
      expect(state.isAnalyzing).toBe(false);
      // Verify no error state initially
      expect(state.error).toBeNull();
    });
  });

  describe('setRawIntent', () => {
    // @atom IA-STORE-003
    it('updates raw intent', () => {
      act(() => {
        useRefinementWizardStore.getState().setRawIntent('Test intent');
      });
      // Verify rawIntent is updated to the provided value
      expect(useRefinementWizardStore.getState().rawIntent).toBe('Test intent');
    });
  });

  describe('setAnalysisResult', () => {
    // @atom IA-STORE-003
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
      // Verify the full analysis result object is stored
      expect(state.analysisResult).toEqual(mockResult);
      // Verify refinedDescription is populated from suggestedDescription
      expect(state.refinedDescription).toBe('Refined description');
      // Verify selectedCategory is populated from suggestedCategory
      expect(state.selectedCategory).toBe('functional');
      // Verify pendingSuggestions combines clarifyingQuestions and decompositionSuggestions
      expect(state.pendingSuggestions).toEqual([
        'Question 1',
        'Suggestion 1',
        'Suggestion 2',
      ]);
    });
  });

  describe('setSelectedCategory', () => {
    // @atom IA-STORE-003
    it('updates selected category', () => {
      act(() => {
        useRefinementWizardStore.getState().setSelectedCategory('security');
      });
      // Verify selectedCategory is updated to the provided value
      expect(useRefinementWizardStore.getState().selectedCategory).toBe('security');
    });
  });

  describe('setRefinedDescription', () => {
    // @atom IA-STORE-003
    it('updates refined description', () => {
      act(() => {
        useRefinementWizardStore.getState().setRefinedDescription('New description');
      });
      // Verify refinedDescription is updated to the provided value
      expect(useRefinementWizardStore.getState().refinedDescription).toBe('New description');
    });
  });

  describe('step navigation', () => {
    // @atom IA-STORE-003
    it('nextStep increments step', () => {
      act(() => {
        useRefinementWizardStore.getState().nextStep();
      });
      // Verify step increments from 0 to 1
      expect(useRefinementWizardStore.getState().step).toBe(1);

      act(() => {
        useRefinementWizardStore.getState().nextStep();
      });
      // Verify step increments from 1 to 2
      expect(useRefinementWizardStore.getState().step).toBe(2);
    });

    // @atom IA-STORE-003
    it('prevStep decrements step but not below 0', () => {
      act(() => {
        useRefinementWizardStore.getState().nextStep();
        useRefinementWizardStore.getState().nextStep();
      });
      // Verify step is at 2 after two increments
      expect(useRefinementWizardStore.getState().step).toBe(2);

      act(() => {
        useRefinementWizardStore.getState().prevStep();
      });
      // Verify step decrements from 2 to 1
      expect(useRefinementWizardStore.getState().step).toBe(1);

      act(() => {
        useRefinementWizardStore.getState().prevStep();
      });
      // Verify step decrements from 1 to 0
      expect(useRefinementWizardStore.getState().step).toBe(0);

      act(() => {
        useRefinementWizardStore.getState().prevStep();
      });
      // Verify step remains at 0 (lower boundary - should not go below 0)
      expect(useRefinementWizardStore.getState().step).toBe(0);
    });

    // @atom IA-STORE-003
    it('goToStep sets specific step', () => {
      act(() => {
        useRefinementWizardStore.getState().goToStep(2);
      });
      // Verify step is set directly to the provided value
      expect(useRefinementWizardStore.getState().step).toBe(2);
    });

    // @atom IA-STORE-003
    it('goToStep handles boundary value of 0', () => {
      // First move to a higher step
      act(() => {
        useRefinementWizardStore.getState().goToStep(3);
      });
      // Verify we're at step 3
      expect(useRefinementWizardStore.getState().step).toBe(3);

      // Now go to step 0 (lower boundary)
      act(() => {
        useRefinementWizardStore.getState().goToStep(0);
      });
      // Verify step is set to 0 (minimum valid step)
      expect(useRefinementWizardStore.getState().step).toBe(0);
    });

    // @atom IA-STORE-003
    it('goToStep allows negative step values (no validation)', () => {
      act(() => {
        useRefinementWizardStore.getState().goToStep(-1);
      });
      // Verify goToStep sets the value directly without clamping
      // Note: Unlike prevStep which clamps to 0, goToStep allows direct navigation
      expect(useRefinementWizardStore.getState().step).toBe(-1);
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

    // @atom IA-STORE-003
    it('acceptSuggestion removes suggestion at index', () => {
      // Verify initial state has 3 suggestions
      expect(useRefinementWizardStore.getState().pendingSuggestions).toHaveLength(3);

      act(() => {
        useRefinementWizardStore.getState().acceptSuggestion(1);
      });

      const suggestions = useRefinementWizardStore.getState().pendingSuggestions;
      // Verify suggestion at index 1 was removed, reducing length to 2
      expect(suggestions).toHaveLength(2);
      // Verify correct suggestions remain (Q1 and S1, with Q2 removed)
      expect(suggestions).toEqual(['Q1', 'S1']);
    });

    // @atom IA-STORE-003
    it('rejectSuggestion removes suggestion at index', () => {
      act(() => {
        useRefinementWizardStore.getState().rejectSuggestion(0);
      });

      const suggestions = useRefinementWizardStore.getState().pendingSuggestions;
      // Verify suggestion at index 0 was removed, reducing length to 2
      expect(suggestions).toHaveLength(2);
      // Verify correct suggestions remain (Q2 and S1, with Q1 removed)
      expect(suggestions).toEqual(['Q2', 'S1']);
    });

    // @atom IA-STORE-003
    it('acceptSuggestion handles last suggestion (boundary: single element array)', () => {
      // Remove first two suggestions to leave only one
      act(() => {
        useRefinementWizardStore.getState().acceptSuggestion(0);
        useRefinementWizardStore.getState().acceptSuggestion(0);
      });
      // Verify only one suggestion remains
      expect(useRefinementWizardStore.getState().pendingSuggestions).toHaveLength(1);

      // Accept the last remaining suggestion
      act(() => {
        useRefinementWizardStore.getState().acceptSuggestion(0);
      });

      // Verify suggestions array is now empty (boundary case: removing last element)
      expect(useRefinementWizardStore.getState().pendingSuggestions).toHaveLength(0);
      // Verify the array is an empty array, not null or undefined
      expect(useRefinementWizardStore.getState().pendingSuggestions).toEqual([]);
    });
  });

  describe('wizard visibility', () => {
    // @atom IA-STORE-003
    it('openWizard sets isOpen to true', () => {
      // Verify wizard is initially closed
      expect(useRefinementWizardStore.getState().isOpen).toBe(false);
      act(() => {
        useRefinementWizardStore.getState().openWizard();
      });
      // Verify wizard is now open
      expect(useRefinementWizardStore.getState().isOpen).toBe(true);
    });

    // @atom IA-STORE-003
    it('closeWizard sets isOpen to false', () => {
      act(() => {
        useRefinementWizardStore.getState().openWizard();
      });
      // Verify wizard is open before closing
      expect(useRefinementWizardStore.getState().isOpen).toBe(true);

      act(() => {
        useRefinementWizardStore.getState().closeWizard();
      });
      // Verify wizard is closed after calling closeWizard
      expect(useRefinementWizardStore.getState().isOpen).toBe(false);
    });
  });

  describe('loading state', () => {
    // @atom IA-STORE-003
    it('setIsAnalyzing updates analyzing state', () => {
      act(() => {
        useRefinementWizardStore.getState().setIsAnalyzing(true);
      });
      // Verify isAnalyzing is set to true
      expect(useRefinementWizardStore.getState().isAnalyzing).toBe(true);

      act(() => {
        useRefinementWizardStore.getState().setIsAnalyzing(false);
      });
      // Verify isAnalyzing is set to false
      expect(useRefinementWizardStore.getState().isAnalyzing).toBe(false);
    });
  });

  describe('error state', () => {
    // @atom IA-STORE-003
    it('setError updates error', () => {
      act(() => {
        useRefinementWizardStore.getState().setError('Something went wrong');
      });
      // Verify error message is stored
      expect(useRefinementWizardStore.getState().error).toBe('Something went wrong');

      act(() => {
        useRefinementWizardStore.getState().setError(null);
      });
      // Verify error can be cleared by setting to null
      expect(useRefinementWizardStore.getState().error).toBeNull();
    });

    // @atom IA-STORE-003
    it('setError handles empty string (boundary: empty vs null)', () => {
      act(() => {
        useRefinementWizardStore.getState().setError('');
      });
      // Verify empty string is stored as error (boundary case: empty string is falsy but valid)
      expect(useRefinementWizardStore.getState().error).toBe('');
      // Verify empty string is not the same as null (distinct boundary values)
      expect(useRefinementWizardStore.getState().error).not.toBeNull();
    });
  });

  describe('reset', () => {
    // @atom IA-STORE-003
    it('resets all state to initial values', () => {
      // Modify multiple fields
      act(() => {
        useRefinementWizardStore.getState().setRawIntent('Test intent');
        useRefinementWizardStore.getState().nextStep();
        useRefinementWizardStore.getState().openWizard();
        useRefinementWizardStore.getState().setError('Error');
        useRefinementWizardStore.getState().setIsAnalyzing(true);
      });

      // Verify modifications were applied
      let state = useRefinementWizardStore.getState();
      // Verify rawIntent was modified
      expect(state.rawIntent).toBe('Test intent');
      // Verify step was incremented
      expect(state.step).toBe(1);
      // Verify wizard was opened
      expect(state.isOpen).toBe(true);
      // Verify error was set
      expect(state.error).toBe('Error');

      // Reset
      act(() => {
        useRefinementWizardStore.getState().reset();
      });

      // Verify reset restored all values to initial state
      state = useRefinementWizardStore.getState();
      // Verify step is reset to 0
      expect(state.step).toBe(0);
      // Verify rawIntent is reset to empty string
      expect(state.rawIntent).toBe('');
      // Verify wizard is closed
      expect(state.isOpen).toBe(false);
      // Verify error is cleared
      expect(state.error).toBeNull();
      // Verify analyzing state is reset
      expect(state.isAnalyzing).toBe(false);
    });
  });
});
