import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

/**
 * Socket.io client instance for real-time communication
 * Connects to the /atoms namespace on the backend
 */
export const socket: Socket = io(`${SOCKET_URL}/atoms`, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 10000,
});

// Connection event handlers
socket.on('connect', () => {
  console.debug('[Socket] Connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.debug('[Socket] Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  // Use warn instead of error to reduce noise when backend is down
  console.warn('[Socket] Connection error (is the backend running?):', error.message);
});

/**
 * Connect to the WebSocket server
 */
export function connectSocket(): void {
  if (!socket.connected) {
    socket.connect();
  }
}

/**
 * Disconnect from the WebSocket server
 */
export function disconnectSocket(): void {
  if (socket.connected) {
    socket.disconnect();
  }
}
