import pool from '@/lib/pg';
import type { PoolClient } from 'pg';

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

  status:
    | 'scheduled'
    | 'confirmed'
    | 'reschedule_requested'
    | 'cancelled'
    | 'completed'
    | 'missed';

  created_at: string;
  updated_at: string;
}

type IncludeAppointmentReminderInput = {
  schedule_id: number;
  contact_id: string;

  appointment_title: string;
  appointment_datetime: string;
  appointment_timezone: string;

  provider_name?: string | null;
  provider_phone?: string | null;

  location_name?: string | null;
  location_address?: string | null;

  notes?: string | null;

  reminder_offset_minutes?: number;
  requires_confirmation?: boolean;

  status?:
    | 'scheduled'
    | 'confirmed'
    | 'reschedule_requested'
    | 'cancelled'
    | 'completed'
    | 'missed';
};

type UpdateAppointmentReminderInput = {
  id: string;

  appointment_title: string;
  appointment_datetime: string;
  appointment_timezone: string;

  provider_name?: string | null;
  provider_phone?: string | null;

  location_name?: string | null;
  location_address?: string | null;

  notes?: string | null;

  reminder_offset_minutes: number;
  requires_confirmation: boolean;

  status:
    | 'scheduled'
    | 'confirmed'
    | 'reschedule_requested'
    | 'cancelled'
    | 'completed'
    | 'missed';
};

export const AppointmentReminderDetailsRepository = {
  async include(
    input: IncludeAppointmentReminderInput,
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

  async find(id: string): Promise<AppointmentReminderDetail | null> {
    const res = await pool.query<AppointmentReminderDetail>(
      `
      SELECT *
      FROM appointment_reminder_details
      WHERE id = $1
      `,
      [id]
    );

    return res.rows[0] || null;
  },

  async findByScheduleId(
    scheduleId: number
  ): Promise<AppointmentReminderDetail | null> {
    const res = await pool.query<AppointmentReminderDetail>(
      `
      SELECT *
      FROM appointment_reminder_details
      WHERE schedule_id = $1
      LIMIT 1
      `,
      [scheduleId]
    );

    return res.rows[0] || null;
  },

  async getAllByContactId(
    contactId: string
  ): Promise<AppointmentReminderDetail[]> {
    const res = await pool.query<AppointmentReminderDetail>(
      `
      SELECT *
      FROM appointment_reminder_details
      WHERE contact_id = $1
      ORDER BY appointment_datetime DESC, created_at DESC
      `,
      [contactId]
    );

    return res.rows;
  },

  async update(
    input: UpdateAppointmentReminderInput,
    client?: PoolClient
  ): Promise<AppointmentReminderDetail> {
    const db = client ?? pool;

    const res = await db.query<AppointmentReminderDetail>(
      `
      UPDATE appointment_reminder_details
      SET
        appointment_title = $2,
        appointment_datetime = $3,
        appointment_timezone = $4,
        provider_name = $5,
        provider_phone = $6,
        location_name = $7,
        location_address = $8,
        notes = $9,
        reminder_offset_minutes = $10,
        requires_confirmation = $11,
        status = $12,
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        input.id,
        input.appointment_title,
        input.appointment_datetime,
        input.appointment_timezone,
        input.provider_name ?? null,
        input.provider_phone ?? null,
        input.location_name ?? null,
        input.location_address ?? null,
        input.notes ?? null,
        input.reminder_offset_minutes,
        input.requires_confirmation,
        input.status,
      ]
    );

    return res.rows[0];
  },

  async updateStatus(
    id: string,
    status:
      | 'scheduled'
      | 'confirmed'
      | 'reschedule_requested'
      | 'cancelled'
      | 'completed'
      | 'missed',
    client?: PoolClient
  ): Promise<AppointmentReminderDetail> {
    const db = client ?? pool;

    const res = await db.query<AppointmentReminderDetail>(
      `
      UPDATE appointment_reminder_details
      SET
        status = $2,
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [id, status]
    );

    return res.rows[0];
  },

  async delete(id: string, client?: PoolClient): Promise<void> {
    const db = client ?? pool;

    await db.query(
      `
      DELETE FROM appointment_reminder_details
      WHERE id = $1
      `,
      [id]
    );
  },

  async deleteByScheduleId(
    scheduleId: number,
    client?: PoolClient
  ): Promise<void> {
    const db = client ?? pool;

    await db.query(
      `
      DELETE FROM appointment_reminder_details
      WHERE schedule_id = $1
      `,
      [scheduleId]
    );
  },
};
