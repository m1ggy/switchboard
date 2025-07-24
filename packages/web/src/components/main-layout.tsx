import { NotificationProvider } from '@/hooks/browser-notification-provider';
import { JitsiProvider } from '@/hooks/jitsi-provider';
import { SocketProvider } from '@/hooks/socket-provider';
import { TwilioVoiceProvider } from '@/hooks/twilio-provider';
import { getSocket } from '@/lib/socket';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import type { Socket } from 'socket.io-client';
import ActiveCallDialog from './active-call-dialog';
import ActiveVideoCallDialog from './active-video-call-dialog';
import BaseSidebar from './base-sidebar';
import CompanySwitcherDialog from './company-switcher-dialog';
import CreateContactDialog from './create-contact-dialog';
import DialerDialog from './dialer-dialog';
import Header from './header';
import { IncomingCallDialog } from './incoming-call-dialog';
import SendMessageDialog from './send-message';
import { SidebarProvider } from './ui/sidebar';

function Layout() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const rootSocket = getSocket();
  const trpc = useTRPC();
  const { activeNumber } = useMainStore();
  const navigate = useNavigate();

  const { data: userInfo } = useQuery(trpc.users.getUser.queryOptions());

  const { mutate } = useMutation(trpc.twilio.presence.mutationOptions());

  useEffect(() => {
    const interval = setInterval(() => {
      if (activeNumber) mutate({ identity: activeNumber?.number });
    }, 15000);
    return () => clearInterval(interval);
  }, [activeNumber, mutate]);

  useEffect(() => {
    if (rootSocket) {
      setSocket(rootSocket);
    }
  }, [rootSocket]);

  useEffect(() => {
    if (userInfo && !userInfo.onboarding_completed) {
      navigate('/onboarding');
    }
  }, [userInfo, navigate]);

  return (
    <NotificationProvider>
      <SocketProvider socket={socket}>
        <TwilioVoiceProvider key={activeNumber?.number}>
          <JitsiProvider>
            <SidebarProvider className="transition-all">
              <BaseSidebar />
              <main className="w-full">
                <Header isLoggedIn />
                <Outlet />
              </main>
              <SendMessageDialog />
              <CreateContactDialog />
              <DialerDialog />
              <IncomingCallDialog />
              <ActiveCallDialog />
              <CompanySwitcherDialog />
              <ActiveVideoCallDialog />
            </SidebarProvider>
          </JitsiProvider>
        </TwilioVoiceProvider>
      </SocketProvider>
    </NotificationProvider>
  );
}

export default Layout;
