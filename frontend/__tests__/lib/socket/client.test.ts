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

  it('creates a socket with correct configuration', async () => {
    const { io } = await import('socket.io-client');
    await import('@/lib/socket/client');

    expect(io).toHaveBeenCalledWith('http://localhost:3000/atoms', {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
  });

  it('registers connect event handler', async () => {
    await import('@/lib/socket/client');

    expect(mockOn).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('registers disconnect event handler', async () => {
    await import('@/lib/socket/client');

    expect(mockOn).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('registers connect_error event handler', async () => {
    await import('@/lib/socket/client');

    expect(mockOn).toHaveBeenCalledWith('connect_error', expect.any(Function));
  });

  it('connectSocket calls socket.connect when not connected', async () => {
    const { connectSocket, socket } = await import('@/lib/socket/client');

    // Mock not connected
    Object.defineProperty(socket, 'connected', { value: false, writable: true });

    connectSocket();
    expect(mockConnect).toHaveBeenCalled();
  });

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
    expect(mockConnect).not.toHaveBeenCalled();
  });

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
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('disconnectSocket can be called multiple times safely', async () => {
    const { disconnectSocket } = await import('@/lib/socket/client');

    // Should not throw when called
    expect(() => disconnectSocket()).not.toThrow();
  });

  it('exports socket instance', async () => {
    const { socket } = await import('@/lib/socket/client');
    expect(socket).toBeDefined();
  });
});
