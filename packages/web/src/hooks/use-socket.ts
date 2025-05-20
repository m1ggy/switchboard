import { getAuth, onAuthStateChanged, onIdTokenChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { app } from '../lib/firebase';

let socket: Socket | null = null;

export function useSocket() {
  const [ready, setReady] = useState(false);
  const [error] = useState<null | string>(null);

  useEffect(() => {
    const auth = getAuth(app);

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user && !socket) {
        const token = await user.getIdToken();

        socket = io(import.meta.env.VITE_WEBSOCKET_URL, {
          path: '/ws',
          auth: {
            token,
          },
        });

        socket.onAny((event, ...args) => {
          console.log('EVENT:', event, ...args);
        });

        setReady(true);
      } else if (!user && socket) {
        socket.disconnect();
        socket = null;
        setReady(false);
      }
    });

    const unsubToken = onIdTokenChanged(auth, async (user) => {
      if (user && socket) {
        const token = await user.getIdToken(true);
        (socket.auth as { token: string }).token = token;
        socket.connect();
      }
    });

    return () => {
      unsubAuth();
      unsubToken();
    };
  }, []);

  return { socket, ready, error };
}
