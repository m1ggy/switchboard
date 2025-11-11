// src/components/layout.tsx (your main layout file)
import { NotificationProvider } from '@/hooks/browser-notification-provider';
import { JitsiProvider } from '@/hooks/jitsi-provider';
import { SocketProvider } from '@/hooks/socket-provider';
import { TwilioVoiceProvider } from '@/hooks/twilio-provider';
import { getSocket } from '@/lib/socket';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
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
import Loader from './ui/loader';
import { SidebarProvider } from './ui/sidebar';

import { auth } from '@/lib/firebase';
import { isAccountLocked } from '@/lib/utils';
import AppLock from '@/pages/app-lock';
import { signOut } from 'firebase/auth';
import { AppUpdatePrompt } from './app-update-prompt';
import NetworkStatusBanner from './network-status-banner';

const ALLOWLIST_PREFIXES = ['/dashboard/settings'];

function Layout() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const rootSocket = getSocket();
  const trpc = useTRPC();
  const { activeNumber } = useMainStore();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: userInfo, isLoading: userLoading } = useQuery(
    trpc.users.getUser.queryOptions()
  );

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
    console.log({
      flag:
        (userInfo && !userInfo.onboarding_completed) ||
        (!userLoading && !userInfo),
      userInfo,
      userLoading,
    });
    if (
      (userInfo && !userInfo.onboarding_completed) ||
      (!userLoading && !userInfo)
    ) {
      navigate('/onboarding');
    }
  }, [userInfo, navigate, userLoading]);

  if (userLoading) {
    return (
      <div className="flex h-[100vh] w-full items-center justify-center">
        <Loader />
      </div>
    );
  }

  // ---- NEW: compute locked + allowlist
  const locked = isAccountLocked(userInfo);
  const isAllowlisted = ALLOWLIST_PREFIXES.some((p) =>
    location.pathname.startsWith(p)
  );

  const handleManageBilling = () => navigate('/dashboard/settings');
  const handleLogout = () => signOut(auth);

  return (
    <NotificationProvider>
      <SocketProvider socket={socket}>
        <TwilioVoiceProvider key={activeNumber?.number}>
          <JitsiProvider>
            <SidebarProvider className="transition-all">
              <BaseSidebar />
              <main className="w-full">
                <NetworkStatusBanner />
                <Header isLoggedIn />
                <Outlet />
              </main>

              {/* dialogs / modals */}
              <SendMessageDialog />
              <CreateContactDialog />
              <DialerDialog />
              <IncomingCallDialog />
              <ActiveCallDialog />
              <CompanySwitcherDialog />
              <ActiveVideoCallDialog />

              {locked && !isAllowlisted && (
                <AppLock
                  endsAt={userInfo?.plan_ends_at ?? null}
                  onManageBilling={handleManageBilling}
                  onLogout={handleLogout}
                />
              )}

              <AppUpdatePrompt />
            </SidebarProvider>
          </JitsiProvider>
        </TwilioVoiceProvider>
      </SocketProvider>
    </NotificationProvider>
  );
}

export default Layout;
