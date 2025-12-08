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

function mapStatus(
  duration: number | null | undefined,
  meta: { status?: string | null } | null | undefined
): 'completed' | 'failed' | 'in-progress' {
  const rawStatus = meta?.status?.toLowerCase();

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

type UiLogRow = {
  id: string;
  name: string;
  phone: string;
  date: string;
  time: string;
  status: 'completed' | 'failed' | 'in-progress';
  duration: string;
};

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
  // data is now:
  // {
  //   data: Array<Call & { schedule: ReassuranceCallSchedule; number: NumberRow }>;
  //   page: number;
  //   pageSize: number;
  //   total: number;
  // }

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
  const logs: UiLogRow[] =
    data.data?.map((call) => {
      // meta is still where Twilio-ish stuff lives (status, to, etc.)
      const meta = (call.meta ?? {}) as {
        status?: string;
        scheduleName?: string;
        to?: string;
      };

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

      // Prefer joined schedule/number data, fall back to meta if needed
      const name =
        call.schedule?.name ?? meta.scheduleName ?? 'Unknown schedule';

      // Based on your schema:
      // - schedule.phone_number is likely the callee's number
      // - number.number is the company/tenant's number
      // previously you used meta.to, so we use schedule.phone_number first
      const phone =
        call.schedule?.phone_number ??
        meta.to ??
        call.number?.number ??
        'Unknown number';

      return {
        id: String(call.id),
        name,
        phone,
        date,
        time,
        status: mapStatus(call.duration, meta),
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
