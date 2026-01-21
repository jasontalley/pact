import { describe, it, expect, vi, beforeEach } from 'vitest';
import { atomsApi } from '@/lib/api/atoms';
import { apiClient } from '@/lib/api/client';

// Mock the apiClient
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockAtom = {
  id: 'uuid-1',
  atomId: 'IA-001',
  description: 'Test atom description',
  category: 'functional',
  status: 'draft',
  qualityScore: 75,
  createdAt: '2025-06-15T10:00:00Z',
  updatedAt: '2025-06-15T10:00:00Z',
  tags: [],
};

describe('atomsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('fetches atoms list without filters', async () => {
      const mockResponse = { data: { items: [mockAtom], total: 1 } };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.list();

      expect(apiClient.get).toHaveBeenCalledWith('/atoms', { params: undefined });
      expect(result).toEqual({ items: [mockAtom], total: 1 });
    });

    it('fetches atoms list with filters', async () => {
      const mockResponse = { data: { items: [mockAtom], total: 1 } };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const filters = { status: 'draft' as const, page: 1, limit: 10 };
      const result = await atomsApi.list(filters);

      expect(apiClient.get).toHaveBeenCalledWith('/atoms', { params: filters });
      expect(result).toEqual({ items: [mockAtom], total: 1 });
    });
  });

  describe('get', () => {
    it('fetches a single atom by ID', async () => {
      const mockResponse = { data: mockAtom };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.get('uuid-1');

      expect(apiClient.get).toHaveBeenCalledWith('/atoms/uuid-1');
      expect(result).toEqual(mockAtom);
    });
  });

  describe('create', () => {
    it('creates a new atom', async () => {
      const mockResponse = { data: mockAtom };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const createDto = { description: 'Test atom', category: 'functional' as const };
      const result = await atomsApi.create(createDto);

      expect(apiClient.post).toHaveBeenCalledWith('/atoms', createDto);
      expect(result).toEqual(mockAtom);
    });
  });

  describe('update', () => {
    it('updates a draft atom', async () => {
      const updatedAtom = { ...mockAtom, description: 'Updated description' };
      const mockResponse = { data: updatedAtom };
      (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const updateDto = { description: 'Updated description' };
      const result = await atomsApi.update('uuid-1', updateDto);

      expect(apiClient.patch).toHaveBeenCalledWith('/atoms/uuid-1', updateDto);
      expect(result).toEqual(updatedAtom);
    });
  });

  describe('delete', () => {
    it('deletes a draft atom', async () => {
      (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await atomsApi.delete('uuid-1');

      expect(apiClient.delete).toHaveBeenCalledWith('/atoms/uuid-1');
    });
  });

  describe('commit', () => {
    it('commits a draft atom', async () => {
      const committedAtom = { ...mockAtom, status: 'committed' };
      const mockResponse = { data: committedAtom };
      (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.commit('uuid-1');

      expect(apiClient.patch).toHaveBeenCalledWith('/atoms/uuid-1/commit');
      expect(result).toEqual(committedAtom);
    });
  });

  describe('supersede', () => {
    it('supersedes a committed atom', async () => {
      const supersededAtom = { ...mockAtom, status: 'superseded', supersededBy: 'uuid-2' };
      const mockResponse = { data: supersededAtom };
      (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.supersede('uuid-1', 'uuid-2');

      expect(apiClient.patch).toHaveBeenCalledWith('/atoms/uuid-1/supersede', { newAtomId: 'uuid-2' });
      expect(result).toEqual(supersededAtom);
    });
  });

  describe('addTag', () => {
    it('adds a tag to an atom', async () => {
      const atomWithTag = { ...mockAtom, tags: ['test-tag'] };
      const mockResponse = { data: atomWithTag };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.addTag('uuid-1', 'test-tag');

      expect(apiClient.post).toHaveBeenCalledWith('/atoms/uuid-1/tags', { tag: 'test-tag' });
      expect(result).toEqual(atomWithTag);
    });
  });

  describe('removeTag', () => {
    it('removes a tag from an atom', async () => {
      const mockResponse = { data: mockAtom };
      (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.removeTag('uuid-1', 'test-tag');

      expect(apiClient.delete).toHaveBeenCalledWith('/atoms/uuid-1/tags/test-tag');
      expect(result).toEqual(mockAtom);
    });
  });

  describe('getTags', () => {
    it('fetches all unique tags with counts', async () => {
      const mockTags = [
        { tag: 'authentication', count: 5 },
        { tag: 'api', count: 3 },
      ];
      const mockResponse = { data: mockTags };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.getTags();

      expect(apiClient.get).toHaveBeenCalledWith('/tags');
      expect(result).toEqual(mockTags);
    });
  });

  describe('analyze', () => {
    it('analyzes intent for atomicity', async () => {
      const analysisResult = {
        isAtomic: true,
        confidence: 0.85,
        suggestedDescription: 'Analyzed description',
        suggestedCategory: 'functional',
        clarifyingQuestions: [],
        decompositionSuggestions: [],
        implementationConcerns: [],
      };
      const mockResponse = { data: analysisResult };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const analyzeDto = { intent: 'User can log in' };
      const result = await atomsApi.analyze(analyzeDto);

      expect(apiClient.post).toHaveBeenCalledWith('/atoms/analyze', analyzeDto);
      expect(result).toEqual(analysisResult);
    });
  });

  describe('refine', () => {
    it('refines an atom with feedback', async () => {
      const refinedAtom = { ...mockAtom, description: 'Refined description' };
      const mockResponse = { data: refinedAtom };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const refineDto = { feedback: 'Please clarify timing' };
      const result = await atomsApi.refine('uuid-1', refineDto);

      expect(apiClient.post).toHaveBeenCalledWith('/atoms/uuid-1/refine', refineDto);
      expect(result).toEqual(refinedAtom);
    });
  });

  describe('suggestRefinements', () => {
    it('gets refinement suggestions for an atom', async () => {
      const suggestions = {
        isAtomic: false,
        confidence: 0.5,
        suggestedDescription: 'Better description',
        suggestedCategory: 'functional',
        clarifyingQuestions: ['What is the expected timing?'],
        decompositionSuggestions: [],
        implementationConcerns: [],
      };
      const mockResponse = { data: suggestions };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.suggestRefinements('uuid-1');

      expect(apiClient.post).toHaveBeenCalledWith('/atoms/uuid-1/suggest-refinements');
      expect(result).toEqual(suggestions);
    });
  });

  describe('acceptSuggestion', () => {
    it('accepts a refinement suggestion', async () => {
      const updatedAtom = { ...mockAtom, description: 'Accepted suggestion' };
      const mockResponse = { data: updatedAtom };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const acceptDto = { suggestionIndex: 0 };
      const result = await atomsApi.acceptSuggestion('uuid-1', acceptDto);

      expect(apiClient.post).toHaveBeenCalledWith('/atoms/uuid-1/accept-suggestion', acceptDto);
      expect(result).toEqual(updatedAtom);
    });
  });

  describe('getRefinementHistory', () => {
    it('gets refinement history for an atom', async () => {
      const history = [
        { createdAt: '2025-06-15T10:00:00Z', feedback: 'Initial', description: 'First' },
        { createdAt: '2025-06-15T11:00:00Z', feedback: 'Refined', description: 'Second' },
      ];
      const mockResponse = { data: history };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.getRefinementHistory('uuid-1');

      expect(apiClient.get).toHaveBeenCalledWith('/atoms/uuid-1/refinement-history');
      expect(result).toEqual(history);
    });
  });
});
