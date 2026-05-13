'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

  const handleSubmit = async (scheduleData: any) => {
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
          companyId={contact.company_id}
          numberId={
            isCreateMode
              ? (activeNumber?.id ?? '')
              : ((schedule as any).number_id ?? activeNumber?.id ?? '')
          }
          initialData={{
            ...(schedule as any),
            emergency_contact_phone:
              (schedule as any).emergency_contact_phone ??
              (schedule as any).emergency_contact_phone_number ??
              '',
            appointmentDetails: (schedule as any).appointment_details ?? undefined,
          }}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
