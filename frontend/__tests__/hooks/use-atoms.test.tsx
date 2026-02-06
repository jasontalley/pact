import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAtoms,
  useAtom,
  useCreateAtom,
  useUpdateAtom,
  useDeleteAtom,
  useCommitAtom,
  useSupersedeAtom,
  useAddTag,
  useRemoveTag,
  useTags,
  atomKeys,
} from '@/hooks/atoms/use-atoms';
import { atomsApi } from '@/lib/api/atoms';

// Mock the API
vi.mock('@/lib/api/atoms', () => ({
  atomsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(),
    supersede: vi.fn(),
    addTag: vi.fn(),
    removeTag: vi.fn(),
    getTags: vi.fn(),
  },
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

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

describe('atomKeys', () => {
  // @atom IA-HOOK-001
  it('generates correct query keys', () => {
    // Verify base 'all' key is correct array structure
    expect(atomKeys.all).toEqual(['atoms']);
    // Verify lists() returns proper nested key structure
    expect(atomKeys.lists()).toEqual(['atoms', 'list']);
    // Verify list() with filters includes filter object in key
    expect(atomKeys.list({ status: 'draft' })).toEqual(['atoms', 'list', { status: 'draft' }]);
    // Verify details() returns proper nested key structure
    expect(atomKeys.details()).toEqual(['atoms', 'detail']);
    // Verify detail() with ID includes the ID in key
    expect(atomKeys.detail('uuid-1')).toEqual(['atoms', 'detail', 'uuid-1']);
    // Verify tags() returns proper key structure
    expect(atomKeys.tags()).toEqual(['atoms', 'tags']);
  });
});

describe('useAtoms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-001
  it('fetches atoms list', async () => {
    const mockData = { items: [mockAtom], total: 1 };
    (atomsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const { result } = renderHook(() => useAtoms(), { wrapper: createWrapper() });

    await waitFor(() => {
      // Verify query completes successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify returned data matches API response
    expect(result.current.data).toEqual(mockData);
    // Verify API was called with empty filters object
    expect(atomsApi.list).toHaveBeenCalledWith({});
  });

  // @atom IA-HOOK-001
  it('fetches atoms with filters', async () => {
    const mockData = { items: [mockAtom], total: 1 };
    (atomsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const filters = { status: 'draft' as const };
    const { result } = renderHook(() => useAtoms(filters), { wrapper: createWrapper() });

    await waitFor(() => {
      // Verify query completes successfully with filters
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify API was called with the provided filters
    expect(atomsApi.list).toHaveBeenCalledWith(filters);
  });

  // @atom IA-HOOK-001
  it('handles empty results gracefully', async () => {
    const emptyData = { items: [], total: 0 };
    (atomsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(emptyData);

    const { result } = renderHook(() => useAtoms(), { wrapper: createWrapper() });

    await waitFor(() => {
      // Verify query completes successfully even with empty results
      expect(result.current.isSuccess).toBe(true);
    });

    // BOUNDARY: Verify empty items array has zero length
    expect(result.current.data?.items.length).toBe(0);
    // BOUNDARY: Verify total count is explicitly zero
    expect(result.current.data?.total).toBe(0);
  });

  // @atom IA-HOOK-001
  it('handles API error state', async () => {
    const apiError = new Error('Network error');
    (atomsApi.list as ReturnType<typeof vi.fn>).mockRejectedValue(apiError);

    const { result } = renderHook(() => useAtoms(), { wrapper: createWrapper() });

    await waitFor(() => {
      // Verify query enters error state on API failure
      expect(result.current.isError).toBe(true);
    });

    // Verify error object contains the API error
    expect(result.current.error).toBe(apiError);
    // BOUNDARY: Verify data is undefined when in error state (null boundary)
    expect(result.current.data).toBeUndefined();
  });

  // @atom IA-HOOK-001
  it('handles pagination at zero offset boundary', async () => {
    const mockData = { items: [mockAtom], total: 100 };
    (atomsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const filters = { offset: 0, limit: 10 };
    const { result } = renderHook(() => useAtoms(filters), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // BOUNDARY: Verify API called with zero offset (first page)
    expect(atomsApi.list).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
  });
});

describe('useAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-001
  it('fetches a single atom by ID', async () => {
    (atomsApi.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockAtom);

    const { result } = renderHook(() => useAtom('uuid-1'), { wrapper: createWrapper() });

    await waitFor(() => {
      // Verify query completes successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify returned data matches the fetched atom
    expect(result.current.data).toEqual(mockAtom);
    // Verify API was called with correct ID
    expect(atomsApi.get).toHaveBeenCalledWith('uuid-1');
  });

  // @atom IA-HOOK-001
  it('does not fetch when ID is empty', () => {
    const { result } = renderHook(() => useAtom(''), { wrapper: createWrapper() });

    // Verify hook is not in loading state when disabled
    expect(result.current.isLoading).toBe(false);
    // Verify API was never called with empty ID
    expect(atomsApi.get).not.toHaveBeenCalled();
  });

  // @atom IA-HOOK-001
  it('handles atom not found error', async () => {
    const notFoundError = new Error('Atom not found');
    (atomsApi.get as ReturnType<typeof vi.fn>).mockRejectedValue(notFoundError);

    const { result } = renderHook(() => useAtom('nonexistent-id'), { wrapper: createWrapper() });

    await waitFor(() => {
      // Verify query enters error state when atom not found
      expect(result.current.isError).toBe(true);
    });

    // Verify error contains the not found error
    expect(result.current.error).toBe(notFoundError);
    // BOUNDARY: Verify data is undefined when atom not found (null boundary)
    expect(result.current.data).toBeUndefined();
  });

  // @atom IA-HOOK-001
  it('returns null data before fetch completes', () => {
    (atomsApi.get as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useAtom('uuid-1'), { wrapper: createWrapper() });

    // BOUNDARY: Verify data is undefined during loading (null boundary)
    expect(result.current.data).toBeUndefined();
    // BOUNDARY: Verify error is null during loading (null boundary)
    expect(result.current.error).toBeNull();
  });
});

describe('useCreateAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-001
  it('creates a new atom', async () => {
    (atomsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockAtom);

    const { result } = renderHook(() => useCreateAtom(), { wrapper: createWrapper() });

    result.current.mutate({ description: 'Test atom', category: 'functional' });

    await waitFor(() => {
      // Verify mutation completes successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify API was called with correct creation payload
    expect(atomsApi.create).toHaveBeenCalledWith({ description: 'Test atom', category: 'functional' });
  });

  // @atom IA-HOOK-001
  it('handles creation error', async () => {
    const validationError = new Error('Validation failed: description is required');
    (atomsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(validationError);

    const { result } = renderHook(() => useCreateAtom(), { wrapper: createWrapper() });

    result.current.mutate({ description: '', category: 'functional' });

    await waitFor(() => {
      // Verify mutation enters error state on validation failure
      expect(result.current.isError).toBe(true);
    });

    // Verify error contains the validation error
    expect(result.current.error).toBe(validationError);
  });

  // @atom IA-HOOK-001
  it('rejects creation with empty description via API', async () => {
    (atomsApi.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Description cannot be empty')
    );

    const { result } = renderHook(() => useCreateAtom(), { wrapper: createWrapper() });

    // BOUNDARY: Test empty string boundary for description
    result.current.mutate({ description: '', category: 'functional' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // BOUNDARY: Verify mutation data is undefined on error (null boundary)
    expect(result.current.data).toBeUndefined();
  });
});

describe('useUpdateAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-001
  it('updates a draft atom', async () => {
    const updatedAtom = { ...mockAtom, description: 'Updated' };
    (atomsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedAtom);

    const { result } = renderHook(() => useUpdateAtom(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', data: { description: 'Updated' } });

    await waitFor(() => {
      // Verify mutation completes successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify API was called with correct ID and update data
    expect(atomsApi.update).toHaveBeenCalledWith('uuid-1', { description: 'Updated' });
  });
});

describe('useDeleteAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-001
  it('deletes a draft atom', async () => {
    (atomsApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteAtom(), { wrapper: createWrapper() });

    result.current.mutate('uuid-1');

    await waitFor(() => {
      // Verify mutation completes successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify API was called with correct ID for deletion
    expect(atomsApi.delete).toHaveBeenCalledWith('uuid-1');
  });
});

describe('useCommitAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-001
  it('commits a draft atom', async () => {
    const committedAtom = { ...mockAtom, status: 'committed' as const };
    (atomsApi.commit as ReturnType<typeof vi.fn>).mockResolvedValue(committedAtom);

    const { result } = renderHook(() => useCommitAtom(), { wrapper: createWrapper() });

    result.current.mutate('uuid-1');

    await waitFor(() => {
      // Verify mutation completes successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify API was called with correct ID for commit operation
    expect(atomsApi.commit).toHaveBeenCalledWith('uuid-1');
  });
});

describe('useSupersedeAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-001
  it('supersedes a committed atom', async () => {
    const supersededAtom = { ...mockAtom, status: 'superseded' as const };
    (atomsApi.supersede as ReturnType<typeof vi.fn>).mockResolvedValue(supersededAtom);

    const { result } = renderHook(() => useSupersedeAtom(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', newAtomId: 'uuid-2' });

    await waitFor(() => {
      // Verify mutation completes successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify API was called with correct IDs for supersede operation
    expect(atomsApi.supersede).toHaveBeenCalledWith('uuid-1', 'uuid-2');
  });
});

describe('useAddTag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-001
  it('adds a tag to an atom', async () => {
    const atomWithTag = { ...mockAtom, tags: ['new-tag'] };
    (atomsApi.addTag as ReturnType<typeof vi.fn>).mockResolvedValue(atomWithTag);

    const { result } = renderHook(() => useAddTag(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', tag: 'new-tag' });

    await waitFor(() => {
      // Verify mutation completes successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify API was called with correct ID and tag
    expect(atomsApi.addTag).toHaveBeenCalledWith('uuid-1', 'new-tag');
  });
});

describe('useRemoveTag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-001
  it('removes a tag from an atom', async () => {
    (atomsApi.removeTag as ReturnType<typeof vi.fn>).mockResolvedValue(mockAtom);

    const { result } = renderHook(() => useRemoveTag(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', tag: 'old-tag' });

    await waitFor(() => {
      // Verify mutation completes successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify API was called with correct ID and tag for removal
    expect(atomsApi.removeTag).toHaveBeenCalledWith('uuid-1', 'old-tag');
  });
});

describe('useTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // @atom IA-HOOK-001
  it('fetches all unique tags', async () => {
    const mockTags = [
      { tag: 'auth', count: 5 },
      { tag: 'api', count: 3 },
    ];
    (atomsApi.getTags as ReturnType<typeof vi.fn>).mockResolvedValue(mockTags);

    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() });

    await waitFor(() => {
      // Verify query completes successfully
      expect(result.current.isSuccess).toBe(true);
    });

    // Verify returned data matches the tags from API
    expect(result.current.data).toEqual(mockTags);
    // Verify API getTags was called
    expect(atomsApi.getTags).toHaveBeenCalled();
  });

  // @atom IA-HOOK-001
  it('handles empty tags list', async () => {
    const emptyTags: { tag: string; count: number }[] = [];
    (atomsApi.getTags as ReturnType<typeof vi.fn>).mockResolvedValue(emptyTags);

    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() });

    await waitFor(() => {
      // Verify query completes successfully even with no tags
      expect(result.current.isSuccess).toBe(true);
    });

    // BOUNDARY: Verify empty array length is zero
    expect(result.current.data?.length).toBe(0);
  });

  // @atom IA-HOOK-001
  it('handles tag with zero count', async () => {
    const tagsWithZeroCount = [
      { tag: 'unused-tag', count: 0 },
      { tag: 'used-tag', count: 5 },
    ];
    (atomsApi.getTags as ReturnType<typeof vi.fn>).mockResolvedValue(tagsWithZeroCount);

    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // BOUNDARY: Verify tag with zero count is included in results
    const zeroCountTag = result.current.data?.find((t) => t.tag === 'unused-tag');
    expect(zeroCountTag?.count).toBe(0);
  });

  // @atom IA-HOOK-001
  it('returns undefined data before tags fetch completes', () => {
    (atomsApi.getTags as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() });

    // BOUNDARY: Verify data is undefined during loading (null boundary)
    expect(result.current.data).toBeUndefined();
  });
});
