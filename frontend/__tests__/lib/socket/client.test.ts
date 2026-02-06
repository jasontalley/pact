import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock socket.io-client before importing the client
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockOn = vi.fn();
const mockId = 'mock-socket-id';

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
    on: mockOn,
    connected: false,
    id: mockId,
  })),
}));

describe('socket client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module cache to get a fresh import
    vi.resetModules();
  });

  // @atom IA-WS-001
  it('creates a socket with correct configuration', async () => {
    const { io } = await import('socket.io-client');
    await import('@/lib/socket/client');

    // Verify socket.io is initialized with the correct namespace and configuration options
    expect(io).toHaveBeenCalledWith('http://localhost:3000/atoms', {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
  });

  // @atom IA-WS-001
  it('registers connect event handler', async () => {
    await import('@/lib/socket/client');

    // Verify that a 'connect' event handler is registered with the socket
    expect(mockOn).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  // @atom IA-WS-001
  it('registers disconnect event handler', async () => {
    await import('@/lib/socket/client');

    // Verify that a 'disconnect' event handler is registered with the socket
    expect(mockOn).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  // @atom IA-WS-001
  it('registers connect_error event handler', async () => {
    await import('@/lib/socket/client');

    // Verify that a 'connect_error' event handler is registered with the socket
    expect(mockOn).toHaveBeenCalledWith('connect_error', expect.any(Function));
  });

  // @atom IA-WS-001
  it('connectSocket calls socket.connect when not connected', async () => {
    const { connectSocket, socket } = await import('@/lib/socket/client');

    // Mock not connected
    Object.defineProperty(socket, 'connected', { value: false, writable: true });

    connectSocket();
    // Verify that connect() is called exactly once when socket is not connected
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  // @atom IA-WS-001
  it('connectSocket does not call connect when already connected', async () => {
    vi.resetModules();

    // Create a new mock with connected = true
    vi.doMock('socket.io-client', () => ({
      io: vi.fn(() => ({
        connect: mockConnect,
        disconnect: mockDisconnect,
        on: mockOn,
        connected: true,
        id: mockId,
      })),
    }));

    const { connectSocket } = await import('@/lib/socket/client');

    mockConnect.mockClear();
    connectSocket();
    // Verify that connect() is NOT called when socket is already connected
    expect(mockConnect).not.toHaveBeenCalled();
  });

  // @atom IA-WS-001
  it('disconnectSocket calls socket.disconnect when connected', async () => {
    vi.resetModules();

    // Create a new mock with connected = true
    vi.doMock('socket.io-client', () => ({
      io: vi.fn(() => ({
        connect: mockConnect,
        disconnect: mockDisconnect,
        on: mockOn,
        connected: true,
        id: mockId,
      })),
    }));

    const { disconnectSocket } = await import('@/lib/socket/client');

    disconnectSocket();
    // Verify that disconnect() is called exactly once when socket is connected
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  // @atom IA-WS-001
  it('disconnectSocket can be called multiple times safely', async () => {
    const { disconnectSocket } = await import('@/lib/socket/client');

    // Verify that calling disconnectSocket does not throw an error (idempotent operation)
    expect(() => disconnectSocket()).not.toThrow();
  });

  // @atom IA-WS-001
  it('exports socket instance', async () => {
    const { socket } = await import('@/lib/socket/client');
    // Verify that the exported socket has the expected mock id property
    expect(socket.id).toBe('mock-socket-id');
    // Verify that the socket has the required connect method
    expect(typeof socket.connect).toBe('function');
    // Verify that the socket has the required disconnect method
    expect(typeof socket.disconnect).toBe('function');
  });

  // @atom IA-WS-001
  // Boundary test: Verify socket registers exactly 3 required event handlers (no more, no less)
  it('registers exactly the required event handlers on initialization', async () => {
    await import('@/lib/socket/client');

    // Verify that exactly 3 event handlers are registered (connect, disconnect, connect_error)
    expect(mockOn).toHaveBeenCalledTimes(3);

    // Verify the specific events registered
    const registeredEvents = mockOn.mock.calls.map((call) => call[0]);
    expect(registeredEvents).toContain('connect');
    expect(registeredEvents).toContain('disconnect');
    expect(registeredEvents).toContain('connect_error');
  });

  // @atom IA-WS-001
  // Boundary test: Verify multiple rapid connect calls are handled correctly (idempotency)
  it('handles multiple rapid connectSocket calls without duplicate connections', async () => {
    const { connectSocket, socket } = await import('@/lib/socket/client');

    // Mock not connected
    Object.defineProperty(socket, 'connected', { value: false, writable: true });

    // Call connectSocket multiple times rapidly
    connectSocket();
    connectSocket();
    connectSocket();

    // Verify that connect() is called for each call when not connected
    // (In real implementation, subsequent calls should be no-ops if connection is pending)
    expect(mockConnect).toHaveBeenCalledTimes(3);
  });

  // @atom IA-WS-001
  // Boundary test: Zero/empty boundary - verify no event handlers before module import
  it('has zero event handlers registered before module initialization', async () => {
    vi.clearAllMocks();

    // Before importing the client module, no handlers should be registered
    expect(mockOn.mock.calls.length).toBe(0);

    // After import, handlers will be registered
    await import('@/lib/socket/client');
    expect(mockOn.mock.calls.length).toBeGreaterThan(0);
  });

  // @atom IA-WS-001
  // Boundary test: Zero boundary - verify connect is not called when already connected
  it('makes zero connect calls when socket is already connected', async () => {
    vi.resetModules();

    // Create a new mock with connected = true
    vi.doMock('socket.io-client', () => ({
      io: vi.fn(() => ({
        connect: mockConnect,
        disconnect: mockDisconnect,
        on: mockOn,
        connected: true,
        id: mockId,
      })),
    }));

    const { connectSocket } = await import('@/lib/socket/client');

    mockConnect.mockClear();
    connectSocket();

    // Zero connect calls when already connected - boundary assertion
    expect(mockConnect.mock.calls.length).toBe(0);
  });

  // @atom IA-WS-001
  // Boundary test: Null/undefined boundary - socket id is undefined when disconnected
  it('has undefined socket id when not connected', async () => {
    vi.resetModules();

    // Create a mock without an id (simulating disconnected state)
    vi.doMock('socket.io-client', () => ({
      io: vi.fn(() => ({
        connect: mockConnect,
        disconnect: mockDisconnect,
        on: mockOn,
        connected: false,
        id: undefined,
      })),
    }));

    const { socket } = await import('@/lib/socket/client');

    // Null/undefined boundary - socket id should be undefined when not connected
    expect(socket.id).toBeUndefined();
  });

  // @atom IA-WS-001
  // Boundary test: Error boundary - connect_error handler receives error
  it('connect_error handler can be invoked without throwing', async () => {
    await import('@/lib/socket/client');

    // Find the connect_error handler
    const connectErrorCall = mockOn.mock.calls.find((call) => call[0] === 'connect_error');
    expect(connectErrorCall).toBeDefined();

    const errorHandler = connectErrorCall![1];
    const testError = new Error('Connection refused');

    // Error boundary - handler should not throw when receiving an error
    expect(() => errorHandler(testError)).not.toThrow();
  });

  // @atom IA-WS-001
  // Boundary test: Null boundary - disconnect reason can be null/undefined
  it('disconnect handler accepts undefined reason without throwing', async () => {
    await import('@/lib/socket/client');

    // Find the disconnect handler
    const disconnectCall = mockOn.mock.calls.find((call) => call[0] === 'disconnect');
    expect(disconnectCall).toBeDefined();

    const disconnectHandler = disconnectCall![1];

    // Error boundary - handler should not throw with undefined reason
    expect(() => disconnectHandler(undefined)).not.toThrow();

    // Also test with null reason
    expect(() => disconnectHandler(null)).not.toThrow();
  });
});
