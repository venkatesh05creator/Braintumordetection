import { io } from 'socket.io-client';
import { BACKEND_ORIGIN } from './imageUrl';

let socket = null;

export const initSocket = (token) => {
  if (socket) {
    socket.disconnect();
  }

  // When BACKEND_ORIGIN is empty (same-domain deployment), io() connects
  // to the current origin host rather than localhost:8000.
  socket = io(BACKEND_ORIGIN || undefined, {
    auth: { token },
    autoConnect: false,
    transports: ['websocket'],
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
