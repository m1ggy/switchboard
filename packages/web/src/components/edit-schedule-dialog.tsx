'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import type { Schedule } from '@/lib/schemas';
import { useMemo, useState } from 'react';
import ScheduleForm from './schedule-form';

import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { useMutation } from '@tanstack/react-query';

interface RawSchedule {
  id: number;
  name?: string | null;
  phone_number?: string | null;
  caller_name?: string | null;
  script_type?: string | null;
  template?: string | null;
  script_content?: string | null;
  name_in_script?: string | null;
  frequency?: string | null;
  frequency_days?: number | null;
  frequency_time?: string | null;
  selected_days?: string[] | null;
  calls_per_day?: number | null;
  max_attempts?: number | null;
  retry_interval?: number | null;
  is_active?: boolean | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_phone_number?: string | null;
  company_id?: string | null;
  number_id?: string | null;
  appointment_details?: Record<string, unknown> | null;
}

interface RawContact {
  id: string;
  number: string;
  label: string;
  created_at?: string | Date | null;
  company_id: string;
}

interface EditScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: RawSchedule;
  onSuccess: () => void;
  contact: RawContact;
}

export default function EditScheduleDialog({
  open,
  onOpenChange,
  schedule,
  onSuccess,
  contact,
}: EditScheduleDialogProps) {
  const trpc = useTRPC();
  const { activeNumber } = useMainStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    'Something went wrong while saving the schedule.'
  );

  // Treat id=0 (or missing) as "create"
  const isCreateMode = useMemo(
    () => !schedule?.id || schedule.id === 0,
    [schedule]
  );

  const updateScheduleMutation = useMutation(
    trpc.reassuranceContactProfiles.update.mutationOptions()
  );

  const createScheduleMutation = useMutation(
    trpc.reassuranceContactProfiles.createSchedule.mutationOptions()
  );

  const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) {
      return err.message;
    }

    return 'Something went wrong while saving the schedule.';
  };

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

      setErrorMessage(getErrorMessage(err));
      setErrorDialogOpen(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (isSubmitting) return;
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

      <AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unable to save schedule</AlertDialogTitle>
            <AlertDialogDescription>{errorMessage}</AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogAction>Okay</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
