import { createContext, useContext, type PropsWithChildren } from 'react';
import type { Socket } from 'socket.io-client';

interface SocketContextValue {
  socket: Socket;
}
const SocketContext = createContext<SocketContextValue | null>(null);

export function useSocket() {
  const context = useContext(SocketContext);

  return context;
}

interface SocketProviderProps extends PropsWithChildren {
  socket: Socket | null;
}

export const SocketProvider = ({ socket, children }: SocketProviderProps) => {
  if (!socket) return children;

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};
