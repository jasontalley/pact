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
    // @atom IA-API-002
    it('fetches atoms list without filters', async () => {
      const mockResponse = { data: { items: [mockAtom], total: 1 } };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.list();

      // Should call apiClient.get with the correct endpoint and no params
      expect(apiClient.get).toHaveBeenCalledWith('/atoms', { params: undefined });
      // Should return the items and total from the API response
      expect(result).toEqual({ items: [mockAtom], total: 1 });
    });

    // @atom IA-API-002
    it('fetches atoms list with filters', async () => {
      const mockResponse = { data: { items: [mockAtom], total: 1 } };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const filters = { status: 'draft' as const, page: 1, limit: 10 };
      const result = await atomsApi.list(filters);

      // Should pass filter params to the API endpoint
      expect(apiClient.get).toHaveBeenCalledWith('/atoms', { params: filters });
      // Should return filtered results from the API
      expect(result).toEqual({ items: [mockAtom], total: 1 });
    });

    // @atom IA-API-002
    it('handles API error when listing atoms', async () => {
      const error = new Error('Network error');
      (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      // API errors should propagate as exceptions to the caller
      await expect(atomsApi.list()).rejects.toThrow('Network error');
    });
  });

  describe('get', () => {
    // @atom IA-API-002
    it('fetches a single atom by ID', async () => {
      const mockResponse = { data: mockAtom };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.get('uuid-1');

      // Should call apiClient.get with the correct atom ID in the URL
      expect(apiClient.get).toHaveBeenCalledWith('/atoms/uuid-1');
      // Should return the atom data from the API response
      expect(result).toEqual(mockAtom);
    });

    // @atom IA-API-002
    it('handles 404 error for non-existent atom', async () => {
      const error = new Error('Not found');
      (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      // Should propagate 404 errors for invalid atom IDs
      await expect(atomsApi.get('non-existent-id')).rejects.toThrow('Not found');
    });

    // @atom IA-API-002
    it('handles empty string ID parameter', async () => {
      const error = new Error('Invalid ID');
      (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      // Empty ID should result in an API error
      await expect(atomsApi.get('')).rejects.toThrow('Invalid ID');
    });
  });

  describe('create', () => {
    // @atom IA-API-002
    it('creates a new atom', async () => {
      const mockResponse = { data: mockAtom };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const createDto = { description: 'Test atom', category: 'functional' as const };
      const result = await atomsApi.create(createDto);

      // Should call apiClient.post with the atom creation endpoint and DTO
      expect(apiClient.post).toHaveBeenCalledWith('/atoms', createDto);
      // Should return the newly created atom from the API
      expect(result).toEqual(mockAtom);
    });

    // @atom IA-API-002
    it('handles validation error when creating atom with invalid data', async () => {
      const error = new Error('Validation failed');
      (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const invalidDto = { description: '', category: 'functional' as const };

      // Should propagate validation errors for invalid atom data
      await expect(atomsApi.create(invalidDto)).rejects.toThrow('Validation failed');
    });
  });

  describe('update', () => {
    // @atom IA-API-002
    it('updates a draft atom', async () => {
      const updatedAtom = { ...mockAtom, description: 'Updated description' };
      const mockResponse = { data: updatedAtom };
      (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const updateDto = { description: 'Updated description' };
      const result = await atomsApi.update('uuid-1', updateDto);

      // Should call apiClient.patch with the atom ID and update DTO
      expect(apiClient.patch).toHaveBeenCalledWith('/atoms/uuid-1', updateDto);
      // Should return the updated atom from the API
      expect(result).toEqual(updatedAtom);
    });
  });

  describe('delete', () => {
    // @atom IA-API-002
    it('deletes a draft atom', async () => {
      (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await atomsApi.delete('uuid-1');

      // Should call apiClient.delete with the correct atom ID
      expect(apiClient.delete).toHaveBeenCalledWith('/atoms/uuid-1');
    });
  });

  describe('commit', () => {
    // @atom IA-API-002
    it('commits a draft atom', async () => {
      const committedAtom = { ...mockAtom, status: 'committed' };
      const mockResponse = { data: committedAtom };
      (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.commit('uuid-1');

      // Should call apiClient.patch with the commit endpoint
      expect(apiClient.patch).toHaveBeenCalledWith('/atoms/uuid-1/commit');
      // Should return the committed atom with updated status
      expect(result).toEqual(committedAtom);
    });
  });

  describe('supersede', () => {
    // @atom IA-API-002
    it('supersedes a committed atom', async () => {
      const supersededAtom = { ...mockAtom, status: 'superseded', supersededBy: 'uuid-2' };
      const mockResponse = { data: supersededAtom };
      (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.supersede('uuid-1', 'uuid-2');

      // Should call apiClient.patch with supersede endpoint and new atom ID
      expect(apiClient.patch).toHaveBeenCalledWith('/atoms/uuid-1/supersede', { newAtomId: 'uuid-2' });
      // Should return the superseded atom with supersededBy reference
      expect(result).toEqual(supersededAtom);
    });
  });

  describe('addTag', () => {
    // @atom IA-API-002
    it('adds a tag to an atom', async () => {
      const atomWithTag = { ...mockAtom, tags: ['test-tag'] };
      const mockResponse = { data: atomWithTag };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.addTag('uuid-1', 'test-tag');

      // Should call apiClient.post with the tags endpoint and tag data
      expect(apiClient.post).toHaveBeenCalledWith('/atoms/uuid-1/tags', { tag: 'test-tag' });
      // Should return the atom with the new tag added
      expect(result).toEqual(atomWithTag);
    });
  });

  describe('removeTag', () => {
    // @atom IA-API-002
    it('removes a tag from an atom', async () => {
      const mockResponse = { data: mockAtom };
      (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.removeTag('uuid-1', 'test-tag');

      // Should call apiClient.delete with the specific tag endpoint
      expect(apiClient.delete).toHaveBeenCalledWith('/atoms/uuid-1/tags/test-tag');
      // Should return the atom without the removed tag
      expect(result).toEqual(mockAtom);
    });
  });

  describe('getTags', () => {
    // @atom IA-API-002
    it('fetches all unique tags with counts', async () => {
      const mockTags = [
        { tag: 'authentication', count: 5 },
        { tag: 'api', count: 3 },
      ];
      const mockResponse = { data: mockTags };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.getTags();

      // Should call apiClient.get with the tags endpoint under /atoms
      expect(apiClient.get).toHaveBeenCalledWith('/atoms/tags');
      // Should return array of tags with their usage counts
      expect(result).toEqual(mockTags);
    });
  });

  describe('analyze', () => {
    // @atom IA-API-002
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

      // Should call apiClient.post with the analyze endpoint and intent data
      expect(apiClient.post).toHaveBeenCalledWith('/atoms/analyze', analyzeDto);
      // Should return the atomicity analysis result from the API
      expect(result).toEqual(analysisResult);
    });
  });

  describe('refine', () => {
    // @atom IA-API-002
    it('refines an atom with feedback', async () => {
      const refinedAtom = { ...mockAtom, description: 'Refined description' };
      const mockResponse = { data: refinedAtom };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const refineDto = { feedback: 'Please clarify timing' };
      const result = await atomsApi.refine('uuid-1', refineDto);

      // Should call apiClient.post with refine endpoint and feedback data
      expect(apiClient.post).toHaveBeenCalledWith('/atoms/uuid-1/refine', refineDto);
      // Should return the refined atom with updated description
      expect(result).toEqual(refinedAtom);
    });
  });

  describe('suggestRefinements', () => {
    // @atom IA-API-002
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

      // Should call apiClient.post with suggest-refinements endpoint
      expect(apiClient.post).toHaveBeenCalledWith('/atoms/uuid-1/suggest-refinements');
      // Should return refinement suggestions including clarifying questions
      expect(result).toEqual(suggestions);
    });
  });

  describe('acceptSuggestion', () => {
    // @atom IA-API-002
    it('accepts a refinement suggestion', async () => {
      const updatedAtom = { ...mockAtom, description: 'Accepted suggestion' };
      const mockResponse = { data: updatedAtom };
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const acceptDto = { suggestionIndex: 0 };
      const result = await atomsApi.acceptSuggestion('uuid-1', acceptDto);

      // Should call apiClient.post with accept-suggestion endpoint and index
      expect(apiClient.post).toHaveBeenCalledWith('/atoms/uuid-1/accept-suggestion', acceptDto);
      // Should return the atom updated with the accepted suggestion
      expect(result).toEqual(updatedAtom);
    });

    // @atom IA-API-002
    it('handles invalid suggestion index', async () => {
      const error = new Error('Invalid suggestion index');
      (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const acceptDto = { suggestionIndex: 999 };

      // Should propagate error for out-of-bounds suggestion index
      await expect(atomsApi.acceptSuggestion('uuid-1', acceptDto)).rejects.toThrow('Invalid suggestion index');
    });
  });

  describe('getRefinementHistory', () => {
    // @atom IA-API-002
    it('gets refinement history for an atom', async () => {
      const history = [
        { createdAt: '2025-06-15T10:00:00Z', feedback: 'Initial', description: 'First' },
        { createdAt: '2025-06-15T11:00:00Z', feedback: 'Refined', description: 'Second' },
      ];
      const mockResponse = { data: history };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.getRefinementHistory('uuid-1');

      // Should call apiClient.get with refinement-history endpoint
      expect(apiClient.get).toHaveBeenCalledWith('/atoms/uuid-1/refinement-history');
      // Should return chronological list of refinement entries
      expect(result).toEqual(history);
    });

    // @atom IA-API-002
    it('returns empty array for atom with no refinement history', async () => {
      const mockResponse = { data: [] };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

      const result = await atomsApi.getRefinementHistory('uuid-1');

      // Should call apiClient.get with the correct endpoint
      expect(apiClient.get).toHaveBeenCalledWith('/atoms/uuid-1/refinement-history');
      // Should return empty array when no refinements exist
      expect(result).toEqual([]);
    });
  });
});
