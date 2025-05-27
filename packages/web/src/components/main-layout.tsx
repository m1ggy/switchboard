import { TwilioVoiceProvider } from '@/hooks/twilio-provider';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Outlet } from 'react-router';
import ActiveCallDialog from './active-call-dialog';
import BaseSidebar from './base-sidebar';
import CompanySwitcherDialog from './company-switcher-dialog';
import CreateContactDialog from './create-contact-dialog';
import DialerDialog from './dialer-dialog';
import Header from './header';
import { IncomingCallDialog } from './incoming-call-dialog';
import SendMessageDialog from './send-message';
import { SidebarProvider } from './ui/sidebar';

function Layout() {
  const trpc = useTRPC();
  const { activeNumber } = useMainStore();

  const { data: token } = useQuery({
    ...trpc.twilio.token.queryOptions({ identity: activeNumber?.number }),
    refetchInterval: 4 * 60 * 60 * 1000,
    refetchOnMount: true,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    enabled: Boolean(activeNumber),
  });

  const { mutate } = useMutation(trpc.twilio.presence.mutationOptions());

  useEffect(() => {
    const interval = setInterval(() => {
      if (activeNumber) mutate({ identity: activeNumber?.number });
    }, 15000);
    return () => clearInterval(interval);
  }, [activeNumber, mutate]);
  return (
    <TwilioVoiceProvider token={token ?? ''}>
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
      </SidebarProvider>
    </TwilioVoiceProvider>
  );
}

export default Layout;
