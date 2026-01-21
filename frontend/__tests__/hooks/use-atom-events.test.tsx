import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ATOM_EVENTS } from '@/lib/socket/events';

// Create mock functions at module level (before vi.mock hoisting)
const mockOn = vi.fn();
const mockOff = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

// Mock socket client - the mock definition must not reference variables
vi.mock('@/lib/socket/client', () => {
  return {
    socket: {
      on: (...args: unknown[]) => mockOn(...args),
      off: (...args: unknown[]) => mockOff(...args),
    },
    connectSocket: () => mockConnect(),
    disconnectSocket: () => mockDisconnect(),
  };
});

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useAtomEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connects to socket and subscribes to events on mount', async () => {
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    expect(mockConnect).toHaveBeenCalled();
    expect(mockOn).toHaveBeenCalledWith(ATOM_EVENTS.CREATED, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(ATOM_EVENTS.UPDATED, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(ATOM_EVENTS.COMMITTED, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(ATOM_EVENTS.SUPERSEDED, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(ATOM_EVENTS.DELETED, expect.any(Function));
  });

  it('unsubscribes from events and disconnects on unmount', async () => {
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    const { unmount } = renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    unmount();

    expect(mockOff).toHaveBeenCalledWith(ATOM_EVENTS.CREATED);
    expect(mockOff).toHaveBeenCalledWith(ATOM_EVENTS.UPDATED);
    expect(mockOff).toHaveBeenCalledWith(ATOM_EVENTS.COMMITTED);
    expect(mockOff).toHaveBeenCalledWith(ATOM_EVENTS.SUPERSEDED);
    expect(mockOff).toHaveBeenCalledWith(ATOM_EVENTS.DELETED);
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('handles atom:created event', async () => {
    const { toast } = await import('sonner');
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    // Find the handler for atom:created
    const createdCall = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === ATOM_EVENTS.CREATED
    );
    expect(createdCall).toBeDefined();

    const createdHandler = createdCall![1] as (data: { data: { atomId: string } }) => void;

    // Simulate event
    createdHandler({
      data: {
        atomId: 'IA-001',
      },
    });

    expect(toast.info).toHaveBeenCalledWith('New atom IA-001 created');
  });

  it('handles atom:committed event', async () => {
    const { toast } = await import('sonner');
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    const committedCall = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === ATOM_EVENTS.COMMITTED
    );
    expect(committedCall).toBeDefined();

    const committedHandler = committedCall![1] as (data: { atomId: string; data: { atomId: string } }) => void;

    committedHandler({
      atomId: 'IA-001',
      data: {
        atomId: 'IA-001',
      },
    });

    expect(toast.success).toHaveBeenCalledWith('Atom IA-001 committed');
  });

  it('handles atom:superseded event', async () => {
    const { toast } = await import('sonner');
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    const supersededCall = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === ATOM_EVENTS.SUPERSEDED
    );
    expect(supersededCall).toBeDefined();

    const supersededHandler = supersededCall![1] as (data: { atomId: string; newAtomId: string }) => void;

    supersededHandler({
      atomId: 'IA-001',
      newAtomId: 'IA-002',
    });

    expect(toast.info).toHaveBeenCalledWith('Atom superseded by IA-002');
  });

  it('handles atom:deleted event', async () => {
    const { toast } = await import('sonner');
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    const deletedCall = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === ATOM_EVENTS.DELETED
    );
    expect(deletedCall).toBeDefined();

    const deletedHandler = deletedCall![1] as (data: { atomId: string }) => void;

    deletedHandler({ atomId: 'IA-001' });

    expect(toast.info).toHaveBeenCalledWith('Atom deleted');
  });
});
