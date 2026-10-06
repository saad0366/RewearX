import { io, Socket } from 'socket.io-client';
import { SOCKET_URL, tokenStore } from './api/client';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (socket && socket.connected) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  const token = tokenStore.access;
  socket = io(SOCKET_URL, {
    auth: { token: token || '' },
    autoConnect: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const reconnectWithToken = () => {
  disconnectSocket();
  return getSocket();
};
