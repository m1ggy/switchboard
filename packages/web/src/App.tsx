import { Toaster } from '@/components/ui/sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from 'api/trpc';
import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import AppRoot from './AppRoot';
import Layout from './components/main-layout';
import { ThemeProvider } from './components/theme-provider';
import { AuthProvider } from './hooks/auth-provider';
import { auth } from './lib/firebase';
import { TRPCProvider } from './lib/trpc';
import AddContact from './pages/add-contact';
import AllContacts from './pages/all-contacts';
import CallHistory from './pages/call-history';
import Dashboard from './pages/dashboard';
import Draft from './pages/draft';
import Inbox from './pages/inbox';
import Sent from './pages/sent';
import SignIn from './pages/sign-in';
import AuthRoute from './routes/auth-route';
import PrivateRoute from './routes/private-route';
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
      },
    },
  });
}
let browserQueryClient: QueryClient | undefined = undefined;
export function getQueryClient() {
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
function App() {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpLink({
          url: `${import.meta.env.VITE_TRPC_URL || 'http://localhost:3000/trpc'}`,
          async headers() {
            const currentUser = auth.currentUser;
            const token = currentUser ? await currentUser.getIdToken() : null;
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
        }),
      ],
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <ThemeProvider defaultTheme="dark" storageKey="switchboard-ui-theme">
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route
                  path="/"
                  element={
                    <PrivateRoute>
                      <AppRoot />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/sign-in"
                  element={
                    <AuthRoute>
                      <SignIn />
                    </AuthRoute>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    <PrivateRoute>
                      <Layout />
                    </PrivateRoute>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="inbox" element={<Inbox />} />
                  <Route path="drafts" element={<Draft />} />
                  <Route path="sent" element={<Sent />} />
                  <Route path="call-history" element={<CallHistory />} />
                  <Route path="add-contact" element={<AddContact />} />
                  <Route path="all-contacts" element={<AllContacts />} />
                </Route>
              </Routes>
            </BrowserRouter>
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </TRPCProvider>
    </QueryClientProvider>
  );
}

export default App;
