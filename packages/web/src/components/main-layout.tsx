import { Outlet } from 'react-router';
import BaseSidebar from './base-sidebar';
import Header from './header';
import { SidebarProvider } from './ui/sidebar';

function Layout() {
  return (
    <SidebarProvider className="transition-all">
      <BaseSidebar />
      <main className="w-full">
        <Header isLoggedIn />
        <Outlet />
      </main>
    </SidebarProvider>
  );
}

export default Layout;
