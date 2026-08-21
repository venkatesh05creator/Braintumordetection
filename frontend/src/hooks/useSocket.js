import { useEffect } from 'react';
import useAuthStore from '../store/authStore';
import { initSocket, disconnectSocket, getSocket } from '../api/socket';

export default function useSocket(eventHandlers = {}) {
  const { user } = useAuthStore();
  const token = localStorage.getItem('access_token');

  useEffect(() => {
    if (!token || !user) {
      disconnectSocket();
      return;
    }

    const socket = initSocket(token);

    socket.on('connect', () => {
      console.log('Socket.io connected:', socket.id);
      
      // Join personal user room (for messages)
      socket.emit('join_room', { room: `user_${user.id}` });
      
      // If doctor, join doctor room (for symptom escalation alerts)
      if (user.role === 'doctor') {
        socket.emit('join_room', { room: `doctor_${user.id}` });
      }
    });

    // Register generic/provided event handlers
    Object.entries(eventHandlers).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    socket.connect();

    return () => {
      // Unregister handlers
      Object.keys(eventHandlers).forEach((event) => {
        socket.off(event);
      });
      disconnectSocket();
    };
  }, [token, user?.id]);

  return getSocket();
}
