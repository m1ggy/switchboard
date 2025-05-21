import { TwilioVoiceProvider } from '@/hooks/twilio-provider';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router';
import BaseSidebar from './base-sidebar';
import CreateContactDialog from './create-contact-dialog';
import DialerDialog from './dialer-dialog';
import Header from './header';
import { IncomingCallDialog } from './incoming-call-dialog';
import SendMessageDialog from './send-message';
import { SidebarProvider } from './ui/sidebar';

function Layout() {
  const trpc = useTRPC();

  const { data: token } = useQuery({
    ...trpc.twilio.token.queryOptions(),
    refetchInterval: 4 * 60 * 60 * 1000,
    refetchOnMount: true,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  console.log('MAIN: ', { token });

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
      </SidebarProvider>
    </TwilioVoiceProvider>
  );
}

export default Layout;
