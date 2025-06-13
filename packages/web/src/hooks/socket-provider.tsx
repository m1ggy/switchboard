import { getQueryClient } from '@/App';
import { auth } from '@/lib/firebase';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import type { Notification } from 'api/types/db';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type PropsWithChildren,
} from 'react';
import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { useNotification } from './browser-notification-provider';

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
  const cleanupRef = useRef<() => void>(null);
  const { enableVisibilityNotification, showSystemNotification } =
    useNotification();
  const user = auth.currentUser;
  const trpc = useTRPC();

  const { activeNumber } = useMainStore();

  const { refetch: refetchNotifications } = useQuery(
    trpc.notifications.getNotifications.queryOptions()
  );
  const { refetch: refetchCount } = useQuery(
    trpc.notifications.getUnreadNotificationsCount.queryOptions()
  );
  const { refetch: refetchInboxes } = useQuery(
    trpc.inboxes.getNumberInboxes.queryOptions({
      numberId: activeNumber?.id as string,
    })
  );

  const { refetch: refetchInboxesUnreadCount, data: inboxsWithUnreadCount } =
    useQuery(
      trpc.inboxes.getUnreadInboxesCount.queryOptions({
        numberId: activeNumber?.id as string,
      })
    );

  const { data: companies } = useQuery(
    trpc.companies.getUserCompanies.queryOptions()
  );

  const client = getQueryClient();
  useEffect(() => {
    if (!user || !socket) return;

    const channel = `${user.uid}-notif`;

    const handler = async (notif: Notification) => {
      let title = 'New Notification';

      if (notif.meta.companyId) {
        const notifCompany = companies?.find(
          (company) => company.id === notif.meta.companyId
        );
        if (notifCompany) {
          title = `Notification for ${notifCompany.name}`;
        }
      }

      if (
        notif.meta.event &&
        notif.meta.event === 'refresh' &&
        notif.meta.target
      ) {
        const targets = notif.meta.target as Record<string, string>;
        if (targets['contactId']) {
          client.invalidateQueries({
            queryKey: trpc.inboxes.getActivityByContact.infiniteQueryKey({
              contactId: targets.contactId,
            }),
          });
        }
      }

      toast.info(title, { description: notif.message });

      await client.invalidateQueries({
        queryKey: trpc.inboxes.getNumberInboxes.queryKey({
          numberId: activeNumber?.number as string,
        }),
      });

      await client.invalidateQueries({
        queryKey: trpc.notifications.getNotifications.queryKey({ page: 1 }),
      });
      showSystemNotification(title, { body: notif.message });

      await refetchNotifications();
      await refetchCount();
      await refetchInboxes();
      await refetchInboxesUnreadCount();

      // scroll to bottom
      window.dispatchEvent(new Event('new-message-scroll'));
    };

    socket.on(channel, handler);

    return () => {
      socket.off(channel, handler);
    };
  }, [user, socket, refetchCount, refetchNotifications, companies, client]);

  useEffect(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    const totalUnreadCount = inboxsWithUnreadCount?.reduce(
      (prev, curr) => prev + curr.unreadCount,
      0
    );

    if (totalUnreadCount && totalUnreadCount > 0) {
      cleanupRef.current = enableVisibilityNotification(
        `(${totalUnreadCount}) Notifications`
      );
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [inboxsWithUnreadCount, enableVisibilityNotification]);

  if (!socket) return children;

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};
