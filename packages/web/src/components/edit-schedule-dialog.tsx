'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Schedule } from '@/lib/schemas';
import { useMemo, useState } from 'react';
import ScheduleForm from './schedule-form';

import { useTRPC } from '@/lib/trpc';
import { useMutation } from '@tanstack/react-query';
import type { Contact } from 'api/types/db';

interface EditScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: Schedule;
  onSuccess: () => void;
  contact: Contact;
}

export default function EditScheduleDialog({
  open,
  onOpenChange,
  schedule,
  onSuccess,
  contact,
}: EditScheduleDialogProps) {
  const trpc = useTRPC();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Treat id=0 (or missing) as "create"
  const isCreateMode = useMemo(
    () => !schedule?.id || schedule.id === 0,
    [schedule]
  );

  // ✅ Update mutation (you already have this)
  const updateScheduleMutation = useMutation(
    trpc.reassuranceContactProfiles.update.mutationOptions()
  );

  // ✅ Create mutation (CHANGE THIS to your real procedure name)
  const createScheduleMutation = useMutation(
    trpc.reassuranceContactProfiles.createSchedule.mutationOptions()
    // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    // Replace `createSchedule` with whatever your actual create endpoint is
  );

  const handleSubmit = async (scheduleData: Schedule) => {
    setIsSubmitting(true);
    try {
      const { appointmentDetails, ...rest } = scheduleData as any;
      const appointment_details = appointmentDetails ?? null;

      if (isCreateMode) {
        await createScheduleMutation.mutateAsync({
          ...rest,
          appointment_details,
          id: undefined,
        } as any);
      } else {
        await updateScheduleMutation.mutateAsync({
          ...rest,
          appointment_details,
          id: schedule.id,
        } as any);
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error('[EditScheduleDialog] submit failed', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return; // optional: prevent closing mid-submit
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isCreateMode ? 'Add Schedule' : 'Edit Schedule'}
          </DialogTitle>
        </DialogHeader>

        <ScheduleForm
          contactId={contact.id}
          initialData={schedule}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
