'use client';

import { getQueryClient } from '@/App';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Edit2, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';

export default function ActiveCalls() {
  const trpc = useTRPC();
  const queryClient = getQueryClient();

  const {
    data: schedules,
    isLoading,
    isError,
  } = useQuery(trpc.reassuranceSchedules.getSchedules.queryOptions());

  const { mutateAsync: enableSchedule, isPending: enabling } = useMutation(
    trpc.reassuranceSchedules.enableSchedule.mutationOptions()
  );
  const { mutateAsync: disableSchedule, isPending: disabling } = useMutation(
    trpc.reassuranceSchedules.disableSchedule.mutationOptions()
  );
  const { mutateAsync: deleteSchedule, isPending: deleting } = useMutation(
    trpc.reassuranceSchedules.deleteSchedule.mutationOptions()
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.reassuranceSchedules.getSchedules.queryOptions().queryKey,
    });
  };

  const handleToggleStatus = async (
    id: number,
    status: 'active' | 'paused'
  ) => {
    try {
      if (status === 'active') {
        await disableSchedule({ id });
      } else {
        await enableSchedule({ id });
      }
      await invalidate();
      toast.success(
        status === 'active' ? 'Schedule paused' : 'Schedule resumed'
      );
    } catch (err) {
      console.error(err);
      toast.error('Failed to update schedule status');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSchedule({ id });
      await invalidate();
      toast.success('Schedule deleted');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete schedule');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Call Schedules</CardTitle>
          <CardDescription>Loading schedules…</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Please wait while we load your reassurance call schedules.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isError || !schedules) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Call Schedules</CardTitle>
          <CardDescription>Could not load schedules</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            There was a problem loading your schedules. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Map DB fields (snake_case) to UI-friendly shape
  const calls = schedules.map((s) => ({
    id: s.id,
    name: s.name,
    phoneNumber: (s as any).phone_number,
    frequency: (s as any).frequency,
    scriptType: (s as any).script_type,
    template: (s as any).template,
    status: (s as any).is_active ? 'active' : 'paused',
  }));

  if (calls.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Call Schedules</CardTitle>
          <CardDescription>No call schedules configured yet</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Create your first call schedule to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  const anyMutating = enabling || disabling || deleting;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Call Schedules</CardTitle>
        <CardDescription>
          {calls.length} schedule{calls.length !== 1 ? 's' : ''} configured
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {calls.map((call) => (
            <div
              key={call.id}
              className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      call.status === 'active'
                        ? 'bg-green-500'
                        : 'bg-yellow-500'
                    }`}
                  />
                  <h3 className="font-medium">{call.name}</h3>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {call.phoneNumber} • {call.frequency} •{' '}
                  {call.scriptType === 'template'
                    ? call.template || 'Template'
                    : 'Custom'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleStatus(call.id, call.status)}
                  title={call.status === 'active' ? 'Pause' : 'Resume'}
                  disabled={anyMutating}
                >
                  {call.status === 'active' ? (
                    <PauseCircle className="w-4 h-4" />
                  ) : (
                    <PlayCircle className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={anyMutating}
                  // TODO: wire up edit dialog / page
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(call.id)}
                  className="text-destructive hover:text-destructive"
                  disabled={anyMutating}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
