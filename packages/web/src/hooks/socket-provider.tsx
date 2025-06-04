import { auth } from '@/lib/firebase';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import type { Notification } from 'api/types/db';
import {
  createContext,
  useContext,
  useEffect,
  type PropsWithChildren,
} from 'react';
import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';

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
  const user = auth.currentUser;
  const trpc = useTRPC();

  const { refetch: refetchNotifications } = useQuery(
    trpc.notifications.getNotifications.queryOptions()
  );
  const { refetch: refetchCount } = useQuery(
    trpc.notifications.getUnreadNotificationsCount.queryOptions()
  );

  const { data: companies } = useQuery(
    trpc.companies.getUserCompanies.queryOptions()
  );

  useEffect(() => {
    if (!user || !socket) return;

    const channel = `${user.uid}-notif`;

    const handler = async (notif: Notification) => {
      await refetchNotifications();
      await refetchCount();

      let title = 'New Notification';

      if (notif.meta.companyId) {
        const notifCompany = companies?.find(
          (company) => company.id === notif.meta.companyId
        );
        if (notifCompany) {
          title = `Notification for ${notifCompany.name}`;
        }
      }

      toast.info(title, { description: notif.message });
    };

    socket.on(channel, handler);

    return () => {
      socket.off(channel, handler);
    };
  }, [user, socket, refetchCount, refetchNotifications, companies]);

  if (!socket) return children;

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};
