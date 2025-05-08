import { Loader } from 'lucide-react';
import { useNavigate } from 'react-router';
import useMainStore from './lib/store';

function AppRoot() {
  const { user } = useMainStore();
  const navigate = useNavigate();

  if (!user) {
    navigate('/sign-in');
  }
  return <Loader />;
}

export default AppRoot;
