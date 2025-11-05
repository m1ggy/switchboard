import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useTRPC } from './lib/trpc';
import PageLoader from './pages/loader';

function AppRoot() {
  const trpc = useTRPC();
  const { data: userInfo, isLoading } = useQuery(
    trpc.users.getUser.queryOptions()
  );
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      if (!userInfo) {
        navigate('/sign-in');
      } else {
        navigate('/dashboard');
      }
    }
  }, [userInfo, navigate, isLoading]);
  return <PageLoader />;
}

export default AppRoot;
