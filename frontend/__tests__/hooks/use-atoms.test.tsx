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
  it('generates correct query keys', () => {
    expect(atomKeys.all).toEqual(['atoms']);
    expect(atomKeys.lists()).toEqual(['atoms', 'list']);
    expect(atomKeys.list({ status: 'draft' })).toEqual(['atoms', 'list', { status: 'draft' }]);
    expect(atomKeys.details()).toEqual(['atoms', 'detail']);
    expect(atomKeys.detail('uuid-1')).toEqual(['atoms', 'detail', 'uuid-1']);
    expect(atomKeys.tags()).toEqual(['atoms', 'tags']);
  });
});

describe('useAtoms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches atoms list', async () => {
    const mockData = { items: [mockAtom], total: 1 };
    (atomsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const { result } = renderHook(() => useAtoms(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(atomsApi.list).toHaveBeenCalledWith({});
  });

  it('fetches atoms with filters', async () => {
    const mockData = { items: [mockAtom], total: 1 };
    (atomsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    const filters = { status: 'draft' as const };
    const { result } = renderHook(() => useAtoms(filters), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(atomsApi.list).toHaveBeenCalledWith(filters);
  });
});

describe('useAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a single atom by ID', async () => {
    (atomsApi.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockAtom);

    const { result } = renderHook(() => useAtom('uuid-1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockAtom);
    expect(atomsApi.get).toHaveBeenCalledWith('uuid-1');
  });

  it('does not fetch when ID is empty', () => {
    const { result } = renderHook(() => useAtom(''), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(false);
    expect(atomsApi.get).not.toHaveBeenCalled();
  });
});

describe('useCreateAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new atom', async () => {
    (atomsApi.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockAtom);

    const { result } = renderHook(() => useCreateAtom(), { wrapper: createWrapper() });

    result.current.mutate({ description: 'Test atom', category: 'functional' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(atomsApi.create).toHaveBeenCalledWith({ description: 'Test atom', category: 'functional' });
  });
});

describe('useUpdateAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a draft atom', async () => {
    const updatedAtom = { ...mockAtom, description: 'Updated' };
    (atomsApi.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedAtom);

    const { result } = renderHook(() => useUpdateAtom(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', data: { description: 'Updated' } });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(atomsApi.update).toHaveBeenCalledWith('uuid-1', { description: 'Updated' });
  });
});

describe('useDeleteAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a draft atom', async () => {
    (atomsApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteAtom(), { wrapper: createWrapper() });

    result.current.mutate('uuid-1');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(atomsApi.delete).toHaveBeenCalledWith('uuid-1');
  });
});

describe('useCommitAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('commits a draft atom', async () => {
    const committedAtom = { ...mockAtom, status: 'committed' as const };
    (atomsApi.commit as ReturnType<typeof vi.fn>).mockResolvedValue(committedAtom);

    const { result } = renderHook(() => useCommitAtom(), { wrapper: createWrapper() });

    result.current.mutate('uuid-1');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(atomsApi.commit).toHaveBeenCalledWith('uuid-1');
  });
});

describe('useSupersedeAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('supersedes a committed atom', async () => {
    const supersededAtom = { ...mockAtom, status: 'superseded' as const };
    (atomsApi.supersede as ReturnType<typeof vi.fn>).mockResolvedValue(supersededAtom);

    const { result } = renderHook(() => useSupersedeAtom(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', newAtomId: 'uuid-2' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(atomsApi.supersede).toHaveBeenCalledWith('uuid-1', 'uuid-2');
  });
});

describe('useAddTag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a tag to an atom', async () => {
    const atomWithTag = { ...mockAtom, tags: ['new-tag'] };
    (atomsApi.addTag as ReturnType<typeof vi.fn>).mockResolvedValue(atomWithTag);

    const { result } = renderHook(() => useAddTag(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', tag: 'new-tag' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(atomsApi.addTag).toHaveBeenCalledWith('uuid-1', 'new-tag');
  });
});

describe('useRemoveTag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes a tag from an atom', async () => {
    (atomsApi.removeTag as ReturnType<typeof vi.fn>).mockResolvedValue(mockAtom);

    const { result } = renderHook(() => useRemoveTag(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'uuid-1', tag: 'old-tag' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(atomsApi.removeTag).toHaveBeenCalledWith('uuid-1', 'old-tag');
  });
});

describe('useTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches all unique tags', async () => {
    const mockTags = [
      { tag: 'auth', count: 5 },
      { tag: 'api', count: 3 },
    ];
    (atomsApi.getTags as ReturnType<typeof vi.fn>).mockResolvedValue(mockTags);

    const { result } = renderHook(() => useTags(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockTags);
    expect(atomsApi.getTags).toHaveBeenCalled();
  });
});
