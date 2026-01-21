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

  it('analyzes intent and updates store on success', async () => {
    (atomsApi.analyze as ReturnType<typeof vi.fn>).mockResolvedValue(mockAnalysisResult);

    const { result } = renderHook(() => useAnalyzeIntent(), { wrapper: createWrapper() });

    result.current.mutate({ intent: 'User can log in' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockSetIsAnalyzing).toHaveBeenCalledWith(true);
    expect(mockSetError).toHaveBeenCalledWith(null);
    expect(mockSetAnalysisResult).toHaveBeenCalledWith(mockAnalysisResult);
    expect(mockSetIsAnalyzing).toHaveBeenCalledWith(false);
    expect(mockNextStep).toHaveBeenCalled();
  });

  it('handles analysis error', async () => {
    const error = new Error('Analysis failed');
    (atomsApi.analyze as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useAnalyzeIntent(), { wrapper: createWrapper() });

    result.current.mutate({ intent: 'Bad intent' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(mockSetIsAnalyzing).toHaveBeenCalledWith(false);
    expect(mockSetError).toHaveBeenCalledWith('Analysis failed');
  });
});

describe('useRefineAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refines an atom', async () => {
    const refinedAtom = { ...mockAtom, qualityScore: 85 };
    (atomsApi.refine as ReturnType<typeof vi.fn>).mockResolvedValue(refinedAtom);

    const { result } = renderHook(() => useRefineAtom(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', feedback: 'Add timing constraint' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(atomsApi.refine).toHaveBeenCalledWith('uuid-1', { feedback: 'Add timing constraint' });
  });

  it('handles refinement error', async () => {
    const error = new Error('Refinement failed');
    (atomsApi.refine as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useRefineAtom(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', feedback: 'Bad feedback' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useSuggestRefinements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(suggestions);
  });

  it('handles error getting suggestions', async () => {
    const error = new Error('Failed to get suggestions');
    (atomsApi.suggestRefinements as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const { result } = renderHook(() => useSuggestRefinements(), { wrapper: createWrapper() });

    result.current.mutate('uuid-1');

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useAcceptSuggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      expect(result.current.isSuccess).toBe(true);
    });

    expect(atomsApi.acceptSuggestion).toHaveBeenCalledWith('uuid-1', {
      suggestionIndex: 0,
      suggestionType: 'clarification',
    });
  });

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
      expect(result.current.isError).toBe(true);
    });
  });
});
