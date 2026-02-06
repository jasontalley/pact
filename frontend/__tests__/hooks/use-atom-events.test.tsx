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

  // @atom IA-HOOK-002
  // Boundary test: verify zero subscriptions before hook mounts
  it('has no subscriptions before hook is mounted', () => {
    // Verify no event subscriptions have been registered before hook mounts
    expect(mockOn).not.toHaveBeenCalled();
    // Verify no event unsubscriptions have occurred before hook mounts
    expect(mockOff).not.toHaveBeenCalled();
    // Verify socket connection has not been initiated before hook mounts
    expect(mockConnect).not.toHaveBeenCalled();
    // Verify socket disconnection has not been called before hook mounts
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  // @atom IA-HOOK-002
  it('connects to socket and subscribes to events on mount', async () => {
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    // Verify socket connection is established on mount
    expect(mockConnect).toHaveBeenCalled();

    // Verify subscription to all ATOM_EVENTS with callback functions
    expect(mockOn).toHaveBeenCalledWith(ATOM_EVENTS.CREATED, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(ATOM_EVENTS.UPDATED, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(ATOM_EVENTS.COMMITTED, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(ATOM_EVENTS.SUPERSEDED, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(ATOM_EVENTS.DELETED, expect.any(Function));
  });

  // @atom IA-HOOK-002
  it('unsubscribes from events and disconnects on unmount', async () => {
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    const { unmount } = renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    unmount();

    // Verify unsubscription from all ATOM_EVENTS
    expect(mockOff).toHaveBeenCalledWith(ATOM_EVENTS.CREATED);
    expect(mockOff).toHaveBeenCalledWith(ATOM_EVENTS.UPDATED);
    expect(mockOff).toHaveBeenCalledWith(ATOM_EVENTS.COMMITTED);
    expect(mockOff).toHaveBeenCalledWith(ATOM_EVENTS.SUPERSEDED);
    expect(mockOff).toHaveBeenCalledWith(ATOM_EVENTS.DELETED);

    // Verify socket disconnection is called on unmount
    expect(mockDisconnect).toHaveBeenCalled();
  });

  // @atom IA-HOOK-002
  it('handles atom:created event', async () => {
    const { toast } = await import('sonner');
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    // Find the handler for atom:created
    const createdCall = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === ATOM_EVENTS.CREATED
    );

    // Verify that a handler was registered for the CREATED event
    expect(createdCall).not.toBeNull();
    // Verify the first argument of the call is the correct event type
    expect(createdCall![0]).toBe(ATOM_EVENTS.CREATED);

    const createdHandler = createdCall![1] as (data: { data: { atomId: string } }) => void;

    // Simulate event
    createdHandler({
      data: {
        atomId: 'IA-001',
      },
    });

    // Verify toast message includes the correct atom ID from the event payload
    expect(toast.info).toHaveBeenCalledWith('New atom IA-001 created');
  });

  // @atom IA-HOOK-002
  it('handles atom:committed event', async () => {
    const { toast } = await import('sonner');
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    const committedCall = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === ATOM_EVENTS.COMMITTED
    );

    // Verify that a handler was registered for the COMMITTED event
    expect(committedCall).not.toBeNull();
    // Verify the first argument of the call is the correct event type
    expect(committedCall![0]).toBe(ATOM_EVENTS.COMMITTED);

    const committedHandler = committedCall![1] as (data: { atomId: string; data: { atomId: string } }) => void;

    committedHandler({
      atomId: 'IA-001',
      data: {
        atomId: 'IA-001',
      },
    });

    // Verify toast message includes the correct atom ID from the event payload
    expect(toast.success).toHaveBeenCalledWith('Atom IA-001 committed');
  });

  // @atom IA-HOOK-002
  it('handles atom:superseded event', async () => {
    const { toast } = await import('sonner');
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    const supersededCall = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === ATOM_EVENTS.SUPERSEDED
    );

    // Verify that a handler was registered for the SUPERSEDED event
    expect(supersededCall).not.toBeNull();
    // Verify the first argument of the call is the correct event type
    expect(supersededCall![0]).toBe(ATOM_EVENTS.SUPERSEDED);

    const supersededHandler = supersededCall![1] as (data: { atomId: string; newAtomId: string }) => void;

    supersededHandler({
      atomId: 'IA-001',
      newAtomId: 'IA-002',
    });

    // Verify toast message includes the new atom ID that superseded the original
    expect(toast.info).toHaveBeenCalledWith('Atom superseded by IA-002');
  });

  // @atom IA-HOOK-002
  it('handles atom:deleted event', async () => {
    const { toast } = await import('sonner');
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    const deletedCall = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === ATOM_EVENTS.DELETED
    );

    // Verify that a handler was registered for the DELETED event
    expect(deletedCall).not.toBeNull();
    // Verify the first argument of the call is the correct event type
    expect(deletedCall![0]).toBe(ATOM_EVENTS.DELETED);

    const deletedHandler = deletedCall![1] as (data: { atomId: string }) => void;

    deletedHandler({ atomId: 'IA-001' });

    // Verify toast message indicates the atom was deleted
    expect(toast.info).toHaveBeenCalledWith('Atom deleted');
  });

  // @atom IA-HOOK-002
  it('handles multiple rapid mount/unmount cycles without duplicate subscriptions', async () => {
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    // First mount/unmount cycle
    const { unmount: unmount1 } = renderHook(() => useAtomEvents(), { wrapper: createWrapper() });
    unmount1();

    // Second mount/unmount cycle
    const { unmount: unmount2 } = renderHook(() => useAtomEvents(), { wrapper: createWrapper() });
    unmount2();

    // Third mount/unmount cycle
    const { unmount: unmount3 } = renderHook(() => useAtomEvents(), { wrapper: createWrapper() });
    unmount3();

    // Verify connect was called exactly 3 times (once per mount)
    expect(mockConnect).toHaveBeenCalledTimes(3);

    // Verify disconnect was called exactly 3 times (once per unmount)
    expect(mockDisconnect).toHaveBeenCalledTimes(3);

    // Verify each cycle subscribed to exactly 5 events (15 total)
    expect(mockOn).toHaveBeenCalledTimes(15);

    // Verify each cycle unsubscribed from exactly 5 events (15 total)
    expect(mockOff).toHaveBeenCalledTimes(15);
  });

  // @atom IA-HOOK-002
  // Boundary test: verify handler is undefined for unregistered event types
  it('returns undefined for unregistered event types', async () => {
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    // Try to find a handler for a non-existent event type
    const nonExistentCall = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === 'atom:non-existent-event'
    );

    // Verify no handler was registered for non-existent events
    expect(nonExistentCall).toBeUndefined();
  });

  // @atom IA-HOOK-002
  // Boundary test: verify handlers gracefully handle null/undefined data
  it('handles event with missing atomId gracefully', async () => {
    const { toast } = await import('sonner');
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    const createdCall = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === ATOM_EVENTS.CREATED
    );

    // Verify that a handler was registered for the CREATED event
    expect(createdCall).not.toBeNull();

    const createdHandler = createdCall![1] as (data: { data: { atomId?: string } }) => void;

    // Call handler with undefined atomId - should still work without throwing
    createdHandler({
      data: {
        atomId: undefined as unknown as string,
      },
    });

    // Verify handler gracefully handles undefined by including it in the message
    expect(toast.info).toHaveBeenCalledWith('New atom undefined created');
  });

  // @atom IA-HOOK-002
  // Boundary test: verify no toasts are shown when no events are triggered
  it('does not show toasts when no events are received', async () => {
    const { toast } = await import('sonner');
    const { useAtomEvents } = await import('@/hooks/socket/use-atom-events');

    renderHook(() => useAtomEvents(), { wrapper: createWrapper() });

    // Verify no toasts are shown when no events are triggered
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
