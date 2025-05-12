import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import useMainStore from './lib/store';
import PageLoader from './pages/loader';

function AppRoot() {
  const { user } = useMainStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/sign-in');
    }
  }, [user, navigate]);
  return <PageLoader />;
}

export default AppRoot;
