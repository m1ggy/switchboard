import { Input } from '@/components/ui/input';
import Loader from '@/components/ui/loader';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { formatDuration } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

function CallHistory() {
  const trpc = useTRPC();
  const { activeNumber } = useMainStore();
  const { data: calls, isLoading } = useQuery(
    trpc.logs.getNumberCallLogs.queryOptions(
      { numberId: activeNumber?.id as string },
      { enabled: !!activeNumber }
    )
  );

  const [search, setSearch] = useState('');

  const filteredCallLogs = useMemo(() => {
    return (
      (calls ?? [])?.filter((c) =>
        [c.contact.label.toLowerCase(), c.contact.number.toLowerCase()].some(
          (val) => val.includes(search.toLowerCase())
        )
      ) ?? []
    );
  }, [calls, search]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[300px]">
        <Loader />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Call History</h2>
        <Input
          placeholder="Search by name or number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Number</TableCell>
            <TableCell>Duration</TableCell>
            <TableCell>Initiated At</TableCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredCallLogs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{log.contact.label}</TableCell>
              <TableCell>{log.contact.number}</TableCell>
              <TableCell>{formatDuration(log.duration)} </TableCell>
              <TableCell>{new Date(log.initiated_at).toDateString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default CallHistory;
