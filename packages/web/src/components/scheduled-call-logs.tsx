'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Clock, XCircle } from 'lucide-react';

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function mapStatus(call: any): 'completed' | 'failed' | 'in-progress' {
  const meta = call.meta || {};
  const duration = call.duration as number | null | undefined;
  const rawStatus = (meta.status as string | undefined)?.toLowerCase();

  if (rawStatus) {
    if (rawStatus === 'completed') return 'completed';
    if (['queued', 'ringing', 'in-progress'].includes(rawStatus))
      return 'in-progress';
    if (
      ['failed', 'busy', 'no-answer', 'canceled', 'cancelled'].includes(
        rawStatus
      )
    )
      return 'failed';
  }

  // Fallback heuristic: if it has duration, assume completed
  if (duration && duration > 0) return 'completed';
  return 'failed';
}

export default function CallLog() {
  const trpc = useTRPC();

  const { activeCompany } = useMainStore();
  const { data, isLoading, isError } = useQuery(
    trpc.reassuranceSchedules.getScheduleCallLogs.queryOptions({
      page: 1,
      pageSize: 50,
      companyId: activeCompany?.id as string,
    })
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Call History</CardTitle>
          <CardDescription>Loading call logs…</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Please wait while we load your call history.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Call History</CardTitle>
          <CardDescription>Could not load call logs</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            There was a problem loading your call history. Please try again
            later.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Map DB calls -> UI logs
  const logs =
    data.data?.map((call: any) => {
      const meta = call.meta || {};
      const initiatedAt = call.initiated_at
        ? new Date(call.initiated_at)
        : null;

      const date =
        initiatedAt?.toLocaleDateString(undefined, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }) ?? '';
      const time =
        initiatedAt?.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        }) ?? '';

      return {
        id: call.id,
        name: meta.scheduleName || 'Unknown schedule',
        phone: meta.to || 'Unknown number',
        date,
        time,
        status: mapStatus(call),
        duration: formatDuration(call.duration),
      };
    }) ?? [];

  const displayLogs = logs.length > 0 ? logs : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Call History</CardTitle>
        <CardDescription>
          Record of all completed and attempted calls
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium">Schedule</th>
                <th className="text-left py-3 px-4 font-medium">Phone</th>
                <th className="text-left py-3 px-4 font-medium">
                  Date &amp; Time
                </th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {displayLogs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-border hover:bg-muted/50"
                >
                  <td className="py-3 px-4">{log.name}</td>
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                    {log.phone}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm">
                      {log.date} {log.time}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {log.status === 'completed' ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-green-600 dark:text-green-400">
                            Completed
                          </span>
                        </>
                      ) : log.status === 'failed' ? (
                        <>
                          <XCircle className="w-4 h-4 text-destructive" />
                          <span className="text-destructive">Failed</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-4 h-4 text-yellow-500" />
                          <span className="text-yellow-600 dark:text-yellow-400">
                            In Progress
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono">{log.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
