import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { io, Socket } from 'socket.io-client';
import { app } from './firebase';

let socket: Socket | null = null;

const auth = getAuth(app);

onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log('USER: ', user);
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
  }
});

export function getSocket() {
  return socket;
}
