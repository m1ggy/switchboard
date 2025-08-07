import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useTRPC } from './lib/trpc';
import PageLoader from './pages/loader';

function AppRoot() {
  const trpc = useTRPC();
  const { data: userInfo } = useQuery(trpc.users.getUser.queryOptions());
  const navigate = useNavigate();

  useEffect(() => {
    console.log({ userInfo });
    if (!userInfo) {
      navigate('/sign-in');
    } else {
      navigate('/dashboard');
    }
  }, [userInfo, navigate]);
  return <PageLoader />;
}

export default AppRoot;
