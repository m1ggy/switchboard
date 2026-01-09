'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Schedule } from '@/lib/schemas';
import { useState } from 'react';
import ScheduleForm from './schedule-form';

import { useTRPC } from '@/lib/trpc';
import { useMutation } from '@tanstack/react-query';

interface EditScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: Schedule;
  onSuccess: () => void;
}

export default function EditScheduleDialog({
  open,
  onOpenChange,
  schedule,
  onSuccess,
}: EditScheduleDialogProps) {
  const trpc = useTRPC();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateScheduleMutation = useMutation(
    trpc.reassuranceContactProfiles.update.mutationOptions()
  );

  const handleSubmit = async (scheduleData: Schedule) => {
    setIsSubmitting(true);
    try {
      await updateScheduleMutation.mutateAsync({
        ...scheduleData,
        id: schedule.id, // ✅ ensure we send the schedule id
      });

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error('[EditScheduleDialog] update failed', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Schedule</DialogTitle>
        </DialogHeader>

        <ScheduleForm
          contactId={schedule.contact_id}
          initialData={schedule}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting} // ✅ optional if ScheduleForm supports it
        />
      </DialogContent>
    </Dialog>
  );
}
