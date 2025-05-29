import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatDistance } from 'date-fns';
import { Circle } from 'lucide-react';
import { type PropsWithChildren } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';

function Notifications({ children }: PropsWithChildren) {
  const trpc = useTRPC();

  const { data, refetch } = useQuery(
    trpc.notifications.getNotifications.queryOptions({ page: 1 })
  );

  const notifications = data?.data ?? [];

  const { data: companies } = useQuery(
    trpc.companies.getUserCompanies.queryOptions()
  );

  const { refetch: refetchCount } = useQuery(
    trpc.notifications.getUnreadNotificationsCount.queryOptions()
  );

  const { mutateAsync: readNotifications } = useMutation(
    trpc.notifications.readNotifications.mutationOptions()
  );
  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>Recent</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col">
          {notifications &&
            notifications?.map((notif) => (
              <div
                key={notif.id}
                className={cn(
                  'flex flex-col text-sm px-4 py-2',
                  notif.viewed ? '' : ' bg-muted'
                )}
                onMouseEnter={async () => {
                  if (notif.viewed) return;
                  await readNotifications({ notificationIds: [notif.id] });
                  refetch();
                  refetchCount();
                }}
              >
                <div className="flex justify-between">
                  <span className="text-foreground font-semibold">
                    {notif.meta['companyId']
                      ? companies?.find(
                          (company) => company.id === notif.meta.companyId
                        )?.name
                      : null}
                  </span>
                  {!notif.viewed && <Circle fill="white" size={8} />}
                </div>

                <span className="text-muted-foreground text-sm py-2">
                  {notif.message}
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  {formatDistance(new Date(notif.created_at), new Date(), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default Notifications;
