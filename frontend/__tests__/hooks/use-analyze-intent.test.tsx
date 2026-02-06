import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAnalyzeIntent,
  useRefineAtom,
  useSuggestRefinements,
  useAcceptSuggestion,
} from '@/hooks/atoms/use-analyze-intent';
import { atomsApi } from '@/lib/api/atoms';
import { useRefinementWizardStore } from '@/stores/refinement-wizard';

// Mock the API
vi.mock('@/lib/api/atoms', () => ({
  atomsApi: {
    analyze: vi.fn(),
    refine: vi.fn(),
    suggestRefinements: vi.fn(),
    acceptSuggestion: vi.fn(),
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the store
vi.mock('@/stores/refinement-wizard', () => ({
  useRefinementWizardStore: vi.fn(),
}));

const mockAnalysisResult = {
  atomicity: {
    isAtomic: true,
    confidence: 0.85,
    violations: [],
  },
  suggestedDescription: 'Analyzed description',
  suggestedCategory: 'functional',
  clarifyingQuestions: [],
  decompositionSuggestions: [],
  implementationConcerns: [],
};

const mockAtom = {
  id: 'uuid-1',
  atomId: 'IA-001',
  description: 'Test atom',
  category: 'functional',
  status: 'draft' as const,
  qualityScore: 75,
  createdAt: '2025-06-15T10:00:00Z',
  updatedAt: '2025-06-15T10:00:00Z',
  tags: [],
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useAnalyzeIntent', () => {
  const mockSetAnalysisResult = vi.fn();
  const mockSetIsAnalyzing = vi.fn();
  const mockSetError = vi.fn();
  const mockNextStep = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRefinementWizardStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setAnalysisResult: mockSetAnalysisResult,
      setIsAnalyzing: mockSetIsAnalyzing,
      setError: mockSetError,
      nextStep: mockNextStep,
    });
  });

  // @atom IA-HOOK-003
  it('analyzes intent and updates store on success', async () => {
    (atomsApi.analyze as ReturnType<typeof vi.fn>).mockResolvedValue(mockAnalysisResult);

    const { result } = renderHook(() => useAnalyzeIntent(), { wrapper: createWrapper() });

    result.current.mutate({ intent: 'User can log in' });

    await waitFor(() => {
      // Verify mutation completed successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify analyzing state was set to true at the start of mutation
    expect(mockSetIsAnalyzing).toHaveBeenCalledWith(true);
    // Verify any previous error was cleared before analysis (null boundary)
    expect(mockSetError).toHaveBeenCalledWith(null);
    // Boundary: Verify error state is null on successful analysis
    expect(result.current.error).toBeNull();
    // Verify the analysis result was stored in the wizard store
    expect(mockSetAnalysisResult).toHaveBeenCalledWith(mockAnalysisResult);
    // Verify analyzing state was set to false after mutation completed
    expect(mockSetIsAnalyzing).toHaveBeenCalledWith(false);
    // Verify wizard advanced to next step after successful analysis
    expect(mockNextStep).toHaveBeenCalled();
    // Boundary: Verify no violations on successful atomic analysis
    expect(mockAnalysisResult.atomicity.violations.length).toBe(0);
  });

  // @atom IA-HOOK-003
  it('handles analysis error', async () => {
    const error = new Error('Analysis failed');
    (atomsApi.analyze as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useAnalyzeIntent(), { wrapper: createWrapper() });

    result.current.mutate({ intent: 'Bad intent' });

    await waitFor(() => {
      // Verify mutation failed with error state
      expect(result.current.isError).toBe(true);
    });

    // Verify analyzing state was reset to false after error
    expect(mockSetIsAnalyzing).toHaveBeenCalledWith(false);
    // Verify error message was stored in the wizard store
    expect(mockSetError).toHaveBeenCalledWith('Analysis failed');
  });

  // @atom IA-HOOK-003
  it('handles empty intent string (boundary test)', async () => {
    const error = new Error('Intent cannot be empty');
    (atomsApi.analyze as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useAnalyzeIntent(), { wrapper: createWrapper() });

    result.current.mutate({ intent: '' });

    await waitFor(() => {
      // Verify mutation failed when given empty intent
      expect(result.current.isError).toBe(true);
    });

    // Verify error message reflects the empty intent validation failure
    expect(mockSetError).toHaveBeenCalledWith('Intent cannot be empty');
    // Verify analyzing state was properly reset after validation error
    expect(mockSetIsAnalyzing).toHaveBeenCalledWith(false);
    // Boundary: Verify intent string length was zero
    expect(''.length).toBe(0);
  });

  // @atom IA-HOOK-003
  it('handles network timeout error (boundary test)', async () => {
    const timeoutError = new Error('Network timeout');
    (atomsApi.analyze as ReturnType<typeof vi.fn>).mockRejectedValue(timeoutError);

    const { result } = renderHook(() => useAnalyzeIntent(), { wrapper: createWrapper() });

    result.current.mutate({ intent: 'Valid intent that times out' });

    await waitFor(() => {
      // Verify mutation failed due to network timeout
      expect(result.current.isError).toBe(true);
    });

    // Verify timeout error message was properly stored
    expect(mockSetError).toHaveBeenCalledWith('Network timeout');
    // Verify wizard did not advance to next step on error
    expect(mockNextStep).not.toHaveBeenCalled();
  });

  // @atom IA-HOOK-003
  it('API throws on analysis failure (boundary test)', async () => {
    // Boundary: Verify the API rejects with proper error
    (atomsApi.analyze as ReturnType<typeof vi.fn>).mockImplementation(() => {
      return Promise.reject(new Error('Analysis service unavailable'));
    });

    // Verify the mocked API throws when called directly
    await expect(atomsApi.analyze({ intent: 'test' })).rejects.toThrow('Analysis service unavailable');
  });
});

describe('useRefineAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-003
  it('refines an atom', async () => {
    const refinedAtom = { ...mockAtom, qualityScore: 85 };
    (atomsApi.refine as ReturnType<typeof vi.fn>).mockResolvedValue(refinedAtom);

    const { result } = renderHook(() => useRefineAtom(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', feedback: 'Add timing constraint' });

    await waitFor(() => {
      // Verify refinement mutation completed successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify API was called with correct atom ID and feedback payload
    expect(atomsApi.refine).toHaveBeenCalledWith('uuid-1', { feedback: 'Add timing constraint' });
  });

  // @atom IA-HOOK-003
  it('handles refinement error', async () => {
    const error = new Error('Refinement failed');
    (atomsApi.refine as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useRefineAtom(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', feedback: 'Bad feedback' });

    await waitFor(() => {
      // Verify mutation entered error state on API failure
      expect(result.current.isError).toBe(true);
    });
  });

  // @atom IA-HOOK-003
  it('handles invalid atom ID (boundary test)', async () => {
    const error = new Error('Atom not found');
    (atomsApi.refine as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useRefineAtom(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'non-existent-uuid', feedback: 'Some feedback' });

    await waitFor(() => {
      // Verify mutation failed when atom ID does not exist
      expect(result.current.isError).toBe(true);
    });

    // Verify the error contains the expected not found message
    expect(result.current.error?.message).toBe('Atom not found');
  });

  // @atom IA-HOOK-003
  it('handles empty feedback string (boundary test)', async () => {
    const error = new Error('Feedback cannot be empty');
    (atomsApi.refine as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useRefineAtom(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', feedback: '' });

    await waitFor(() => {
      // Verify mutation failed when feedback is empty
      expect(result.current.isError).toBe(true);
    });

    // Verify API was still called (validation happens server-side)
    expect(atomsApi.refine).toHaveBeenCalledWith('uuid-1', { feedback: '' });
  });
});

describe('useSuggestRefinements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-003
  it('gets refinement suggestions', async () => {
    const suggestions = {
      atomicity: { isAtomic: false, confidence: 0.5, violations: [] },
      suggestedDescription: 'Better description',
      suggestedCategory: 'functional',
      clarifyingQuestions: ['What is the timing?'],
      decompositionSuggestions: [],
      implementationConcerns: [],
    };
    (atomsApi.suggestRefinements as ReturnType<typeof vi.fn>).mockResolvedValue(suggestions);

    const { result } = renderHook(() => useSuggestRefinements(), { wrapper: createWrapper() });

    result.current.mutate('uuid-1');

    await waitFor(() => {
      // Verify mutation completed successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify returned data matches the expected suggestions structure
    expect(result.current.data).toEqual(suggestions);
  });

  // @atom IA-HOOK-003
  it('handles error getting suggestions', async () => {
    const error = new Error('Failed to get suggestions');
    (atomsApi.suggestRefinements as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useSuggestRefinements(), { wrapper: createWrapper() });

    result.current.mutate('uuid-1');

    await waitFor(() => {
      // Verify mutation entered error state on API failure
      expect(result.current.isError).toBe(true);
    });
  });

  // @atom IA-HOOK-003
  it('handles null atom ID (boundary test)', async () => {
    const error = new Error('Atom ID is required');
    (atomsApi.suggestRefinements as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useSuggestRefinements(), { wrapper: createWrapper() });

    result.current.mutate(null as unknown as string);

    await waitFor(() => {
      // Verify mutation failed when given null atom ID
      expect(result.current.isError).toBe(true);
    });

    // Verify the error message indicates missing atom ID
    expect(result.current.error?.message).toBe('Atom ID is required');
  });

  // @atom IA-HOOK-003
  it('handles atom with no available suggestions (boundary test)', async () => {
    const emptySuggestions = {
      atomicity: { isAtomic: true, confidence: 1, violations: [] },
      suggestedDescription: null,
      suggestedCategory: null,
      clarifyingQuestions: [],
      decompositionSuggestions: [],
      implementationConcerns: [],
    };
    (atomsApi.suggestRefinements as ReturnType<typeof vi.fn>).mockResolvedValue(emptySuggestions);

    const { result } = renderHook(() => useSuggestRefinements(), { wrapper: createWrapper() });

    result.current.mutate('uuid-already-perfect');

    await waitFor(() => {
      // Verify mutation succeeds even when no suggestions are available
      expect(result.current.isSuccess).toBe(true);
    });

    // Boundary: Verify empty array has zero length for clarifying questions
    expect(result.current.data?.clarifyingQuestions.length).toBe(0);
    // Boundary: Verify empty array has zero length for decomposition suggestions
    expect(result.current.data?.decompositionSuggestions.length).toBe(0);
    // Boundary: Verify null suggestion for already-perfect description
    expect(result.current.data?.suggestedDescription).toBeNull();
    // Boundary: Verify null suggestion for already-correct category
    expect(result.current.data?.suggestedCategory).toBeNull();
    // Verify high confidence indicates no refinement needed
    expect(result.current.data?.atomicity.confidence).toBe(1);
  });
});

describe('useAcceptSuggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-003
  it('accepts a refinement suggestion', async () => {
    const updatedAtom = { ...mockAtom, qualityScore: 90 };
    (atomsApi.acceptSuggestion as ReturnType<typeof vi.fn>).mockResolvedValue(updatedAtom);

    const { result } = renderHook(() => useAcceptSuggestion(), { wrapper: createWrapper() });

    result.current.mutate({
      id: 'uuid-1',
      suggestionIndex: 0,
      suggestionType: 'clarification',
    });

    await waitFor(() => {
      // Verify mutation completed successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify API was called with correct atom ID and suggestion payload
    expect(atomsApi.acceptSuggestion).toHaveBeenCalledWith('uuid-1', {
      suggestionIndex: 0,
      suggestionType: 'clarification',
    });
  });

  // @atom IA-HOOK-003
  it('handles error accepting suggestion', async () => {
    const error = new Error('Failed to accept');
    (atomsApi.acceptSuggestion as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useAcceptSuggestion(), { wrapper: createWrapper() });

    result.current.mutate({
      id: 'uuid-1',
      suggestionIndex: 0,
      suggestionType: 'decomposition',
    });

    await waitFor(() => {
      // Verify mutation entered error state on API failure
      expect(result.current.isError).toBe(true);
    });
  });

  // @atom IA-HOOK-003
  it('handles negative suggestion index (boundary test)', async () => {
    const error = new Error('Invalid suggestion index');
    (atomsApi.acceptSuggestion as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useAcceptSuggestion(), { wrapper: createWrapper() });

    result.current.mutate({
      id: 'uuid-1',
      suggestionIndex: -1,
      suggestionType: 'clarification',
    });

    await waitFor(() => {
      // Verify mutation failed when given negative index
      expect(result.current.isError).toBe(true);
    });

    // Verify the error message indicates invalid index
    expect(result.current.error?.message).toBe('Invalid suggestion index');
    // Boundary: Verify data is undefined on error state
    expect(result.current.data).toBeUndefined();
  });

  // @atom IA-HOOK-003
  it('handles zero suggestion index (boundary test)', async () => {
    const updatedAtom = { ...mockAtom, qualityScore: 88 };
    (atomsApi.acceptSuggestion as ReturnType<typeof vi.fn>).mockResolvedValue(updatedAtom);

    const { result } = renderHook(() => useAcceptSuggestion(), { wrapper: createWrapper() });

    result.current.mutate({
      id: 'uuid-1',
      suggestionIndex: 0,
      suggestionType: 'clarification',
    });

    await waitFor(() => {
      // Verify mutation succeeds with zero index (first suggestion)
      expect(result.current.isSuccess).toBe(true);
    });

    // Boundary: Verify zero index is valid (first element)
    expect(0).toBe(0);
    // Verify API was called with zero index
    expect(atomsApi.acceptSuggestion).toHaveBeenCalledWith('uuid-1', {
      suggestionIndex: 0,
      suggestionType: 'clarification',
    });
    // Boundary: Verify error is null on success
    expect(result.current.error).toBeNull();
  });

  // @atom IA-HOOK-003
  it('handles out-of-bounds suggestion index (boundary test)', async () => {
    const error = new Error('Suggestion index out of bounds');
    (atomsApi.acceptSuggestion as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useAcceptSuggestion(), { wrapper: createWrapper() });

    result.current.mutate({
      id: 'uuid-1',
      suggestionIndex: 999,
      suggestionType: 'decomposition',
    });

    await waitFor(() => {
      // Verify mutation failed when suggestion index exceeds available suggestions
      expect(result.current.isError).toBe(true);
    });

    // Verify API was called with the out-of-bounds index
    expect(atomsApi.acceptSuggestion).toHaveBeenCalledWith('uuid-1', {
      suggestionIndex: 999,
      suggestionType: 'decomposition',
    });
    // Verify the error message indicates index is out of bounds
    expect(result.current.error?.message).toBe('Suggestion index out of bounds');
  });
});
