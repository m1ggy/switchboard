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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (scheduleData: Schedule) => {
    setIsSubmitting(true);
    try {
      console.log('[v0] Updating schedule:', scheduleData);
      // TODO: Replace with actual API call
      // const response = await updateSchedule(schedule.id, scheduleData)
      onSuccess();
      onOpenChange(false);
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
        />
      </DialogContent>
    </Dialog>
  );
}
