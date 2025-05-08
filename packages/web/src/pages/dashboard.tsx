import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';

function Dashboard() {
  const trpc = useTRPC();

  const pingQuery = useQuery(trpc.ping.queryOptions());
  console.log({ pingQuery });

  return (
    <div className="flex justify-center items-center min-h-3/4">
      <p>Dashboard Index</p>
    </div>
  );
}

export default Dashboard;
