'use client';

import { getQueryClient } from '@/App';
import { useTRPC } from '@/lib/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import EditDialog from '@/components/edit-scheduled-call-dialog';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import useMainStore from '@/lib/store';
import { Edit2, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';

const parseSelectedDays = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    // Already an array of strings? just sanitize each
    return raw
      .map((d) => (typeof d === 'string' ? d.trim() : ''))
      .filter(Boolean);
  }

  if (typeof raw !== 'string') return [];

  let s = raw.trim();
  if (!s) return [];

  if (s.startsWith('{') && s.endsWith('}')) {
    s = s.slice(1, -1); // remove outer braces
  }

  return s
    .split(',')
    .map((d) =>
      d
        .trim()
        // strip leading/trailing quotes if present
        .replace(/^"+|"+$/g, '')
        .replace(/^'+|'+$/g, '')
    )
    .filter(Boolean);
};

export default function ActiveCalls() {
  const trpc = useTRPC();
  const queryClient = getQueryClient();

  const [editingCall, setEditingCall] = useState<any | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { activeCompany } = useMainStore();
  const companyId = activeCompany?.id as string;

  const {
    data: schedules,
    isLoading,
    isError,
  } = useQuery(
    trpc.reassuranceSchedules.getSchedules.queryOptions({ companyId })
  );

  const { mutateAsync: enableSchedule, isPending: enabling } = useMutation(
    trpc.reassuranceSchedules.enableSchedule.mutationOptions()
  );
  const { mutateAsync: disableSchedule, isPending: disabling } = useMutation(
    trpc.reassuranceSchedules.disableSchedule.mutationOptions()
  );
  const { mutateAsync: deleteSchedule, isPending: deleting } = useMutation(
    trpc.reassuranceSchedules.deleteSchedule.mutationOptions()
  );

  // ⬇️ You'll need a matching tRPC mutation on the backend for this
  const { mutateAsync: updateSchedule, isPending: updating } = useMutation(
    trpc.reassuranceSchedules.updateSchedule.mutationOptions()
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.reassuranceSchedules.getSchedules.queryOptions({
        companyId,
      }).queryKey,
    });
  };

  const handleToggleStatus = async (
    id: number,
    status: 'active' | 'paused'
  ) => {
    try {
      if (status === 'active') {
        await disableSchedule({ id, companyId });
      } else {
        await enableSchedule({ id, companyId });
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
      await deleteSchedule({ id, companyId });
      await invalidate();
      toast.success('Schedule deleted');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete schedule');
    }
  };

  // 🔁 Open dialog with the schedule mapped into EditDialog's form shape
  const handleEditClick = (call: any) => {
    console.log({ call });
    setEditingCall(call);
    setIsEditDialogOpen(true);
  };

  const handleEditSave = async (data: any) => {
    if (!editingCall) return;

    try {
      const normalizedSelectedDays = Array.isArray(data.selectedDays)
        ? data.selectedDays
        : typeof data.selectedDays === 'string'
          ? parseSelectedDays(data.selectedDays)
          : [];

      await updateSchedule({
        id: editingCall.id,
        data: {
          ...data,
          selectedDays: normalizedSelectedDays,
        },
      });

      await invalidate();
      toast.success('Schedule updated');

      setIsEditDialogOpen(false);
      setEditingCall(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update schedule');
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

  const calls = schedules.map((s) => ({
    id: s.id,
    name: s.name,
    phoneNumber: s.phone_number,
    callerName: s.caller_name ?? '',
    scriptType: s.script_type ?? 'template',
    scriptContent: s.script_content ?? '',
    nameInScript: s.name_in_script ?? 'contact',
    frequency: s.frequency ?? 'daily',
    frequencyDays: s.frequency_days ?? 1,
    frequencyTime: s.frequency_time ?? '09:00',
    selectedDays: s.selected_days ?? ['monday'],
    callsPerDay: s.calls_per_day ?? 1,
    maxAttempts: s.max_attempts ?? 3,
    template: s.template ?? 'wellness',
    retryInterval: s.retry_interval ?? 30,
    status: s.is_active ? 'active' : 'paused',
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

  const anyMutating = enabling || disabling || deleting || updating;

  return (
    <>
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
                    onClick={() =>
                      handleToggleStatus(call.id, call.status as any)
                    }
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
                    onClick={() => handleEditClick(call)}
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

      {/* ✨ Edit dialog wired up here */}
      <EditDialog
        call={editingCall}
        isOpen={!!isEditDialogOpen && !!editingCall}
        onClose={() => {
          setIsEditDialogOpen(false);
          setEditingCall(null);
        }}
        onSave={handleEditSave}
      />
    </>
  );
}
