import { TwilioVoiceProvider } from '@/hooks/twilio-provider';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router';
import BaseSidebar from './base-sidebar';
import Header from './header';
import { SidebarProvider } from './ui/sidebar';

function Layout() {
  const trpc = useTRPC();

  const { data: token } = useQuery(trpc.twilio.token.queryOptions());

  console.log('MAIN: ', { token });

  return (
    <TwilioVoiceProvider token={token ?? ''}>
      <SidebarProvider className="transition-all">
        <BaseSidebar />
        <main className="w-full">
          <Header isLoggedIn />
          <Outlet />
        </main>
      </SidebarProvider>
    </TwilioVoiceProvider>
  );
}

export default Layout;
