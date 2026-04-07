import pool from '@/lib/pg';
import type { PoolClient } from 'pg';

export type AppointmentReminderStatus =
  | 'scheduled'
  | 'confirmed'
  | 'reschedule_requested'
  | 'cancelled'
  | 'completed'
  | 'missed';

export interface AppointmentReminderDetail {
  id: string;
  schedule_id: number;
  contact_id: string;
  appointment_title: string;
  appointment_datetime: string;
  appointment_timezone: string;
  provider_name: string | null;
  provider_phone: string | null;
  location_name: string | null;
  location_address: string | null;
  notes: string | null;
  reminder_offset_minutes: number;
  requires_confirmation: boolean;
  status: AppointmentReminderStatus;
  created_at: string;
  updated_at: string;
}

export type UpsertAppointmentReminderDetailInput = {
  schedule_id: number;
  contact_id: string;
  appointment_title: string;
  appointment_datetime: string | Date;
  appointment_timezone: string;
  provider_name?: string | null;
  provider_phone?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  notes?: string | null;
  reminder_offset_minutes?: number;
  requires_confirmation?: boolean;
  status?: AppointmentReminderStatus;
};

export const AppointmentReminderDetailsRepository = {
  async findByScheduleId(
    scheduleId: number,
    db: PoolClient | typeof pool = pool
  ): Promise<AppointmentReminderDetail | null> {
    const res = await db.query<AppointmentReminderDetail>(
      `
      SELECT *
      FROM appointment_reminder_details
      WHERE schedule_id = $1
      LIMIT 1
      `,
      [scheduleId]
    );

    return res.rows[0] ?? null;
  },

  async findByContactId(
    contactId: string,
    db: PoolClient | typeof pool = pool
  ): Promise<AppointmentReminderDetail[]> {
    const res = await db.query<AppointmentReminderDetail>(
      `
      SELECT *
      FROM appointment_reminder_details
      WHERE contact_id = $1
      ORDER BY appointment_datetime ASC, created_at DESC
      `,
      [contactId]
    );

    return res.rows;
  },

  async upsert(
    input: UpsertAppointmentReminderDetailInput,
    db: PoolClient | typeof pool = pool
  ): Promise<AppointmentReminderDetail> {
    const res = await db.query<AppointmentReminderDetail>(
      `
      INSERT INTO appointment_reminder_details (
        schedule_id,
        contact_id,
        appointment_title,
        appointment_datetime,
        appointment_timezone,
        provider_name,
        provider_phone,
        location_name,
        location_address,
        notes,
        reminder_offset_minutes,
        requires_confirmation,
        status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
      )
      ON CONFLICT (schedule_id)
      DO UPDATE SET
        contact_id = EXCLUDED.contact_id,
        appointment_title = EXCLUDED.appointment_title,
        appointment_datetime = EXCLUDED.appointment_datetime,
        appointment_timezone = EXCLUDED.appointment_timezone,
        provider_name = EXCLUDED.provider_name,
        provider_phone = EXCLUDED.provider_phone,
        location_name = EXCLUDED.location_name,
        location_address = EXCLUDED.location_address,
        notes = EXCLUDED.notes,
        reminder_offset_minutes = EXCLUDED.reminder_offset_minutes,
        requires_confirmation = EXCLUDED.requires_confirmation,
        status = EXCLUDED.status,
        updated_at = now()
      RETURNING *
      `,
      [
        input.schedule_id,
        input.contact_id,
        input.appointment_title,
        input.appointment_datetime,
        input.appointment_timezone,
        input.provider_name ?? null,
        input.provider_phone ?? null,
        input.location_name ?? null,
        input.location_address ?? null,
        input.notes ?? null,
        input.reminder_offset_minutes ?? 60,
        input.requires_confirmation ?? true,
        input.status ?? 'scheduled',
      ]
    );

    return res.rows[0];
  },

  async deleteByScheduleId(
    scheduleId: number,
    db: PoolClient | typeof pool = pool
  ): Promise<void> {
    await db.query(
      `
      DELETE FROM appointment_reminder_details
      WHERE schedule_id = $1
      `,
      [scheduleId]
    );
  },

  async updateStatus(
    scheduleId: number,
    status: AppointmentReminderStatus,
    db: PoolClient | typeof pool = pool
  ): Promise<AppointmentReminderDetail | null> {
    const res = await db.query<AppointmentReminderDetail>(
      `
      UPDATE appointment_reminder_details
      SET status = $2,
          updated_at = now()
      WHERE schedule_id = $1
      RETURNING *
      `,
      [scheduleId, status]
    );

    return res.rows[0] ?? null;
  },
};
