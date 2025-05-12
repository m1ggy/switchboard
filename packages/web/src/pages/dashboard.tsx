import { useSocket } from '@/hooks/use-socket';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';

function Dashboard() {
  const trpc = useTRPC();

  const { socket } = useSocket();

  const pingQuery = useQuery(trpc.ping.queryOptions());
  const protectedQuery = useQuery(trpc.testProtectedRoute.queryOptions());
  console.log({ pingQuery, protectedQuery, socket });

  return (
    <div className="flex justify-center items-center min-h-3/4">
      <p>Dashboard Index</p>
    </div>
  );
}

export default Dashboard;
