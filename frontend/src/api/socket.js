import { io } from 'socket.io-client';
import { API_BASE_URL } from './imageUrl';

let socket = null;

export const initSocket = (token) => {
  if (socket) {
    socket.disconnect();
  }

  socket = io(API_BASE_URL, {
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
