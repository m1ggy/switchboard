import pool from '@/lib/pg';
import { CallNote, Contact } from '@/types/db';
import { TRPCError } from '@trpc/server';

/**
 * Tenant-scoping guards for tRPC procedures.
 *
 * Membership is defined by `user_companies` (user_id = Firebase uid).
 * Lookups that fail membership throw NOT_FOUND rather than FORBIDDEN so that
 * callers can't probe for the existence of other companies' records.
 */

export async function assertCompanyAccess(
  userId: string,
  companyId: string
): Promise<void> {
  const res = await pool.query(
    `SELECT 1 FROM user_companies
     WHERE user_id = $1 AND company_id = $2
     LIMIT 1`,
    [userId, companyId]
  );

  if (res.rowCount === 0) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have access to this company.',
    });
  }
}

export async function assertContactAccess(
  userId: string,
  contactId: string
): Promise<Contact> {
  const res = await pool.query<Contact>(
    `SELECT c.*
     FROM contacts c
     JOIN user_companies uc ON uc.company_id = c.company_id
     WHERE c.id = $1 AND uc.user_id = $2
     LIMIT 1`,
    [contactId, userId]
  );

  const contact = res.rows[0];
  if (!contact) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found.' });
  }
  return contact;
}

export async function assertNumberAccess(
  userId: string,
  numberId: string
): Promise<{ id: string; company_id: string }> {
  const res = await pool.query<{ id: string; company_id: string }>(
    `SELECT n.id, n.company_id
     FROM numbers n
     JOIN user_companies uc ON uc.company_id = n.company_id
     WHERE n.id = $1 AND uc.user_id = $2
     LIMIT 1`,
    [numberId, userId]
  );

  const number = res.rows[0];
  if (!number) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Number not found.' });
  }
  return number;
}

export async function assertNoteAccess(
  userId: string,
  noteId: string
): Promise<CallNote> {
  const res = await pool.query<CallNote>(
    `SELECT n.*
     FROM call_notes n
     JOIN user_companies uc ON uc.company_id = n.company_id
     WHERE n.id = $1 AND uc.user_id = $2
     LIMIT 1`,
    [noteId, userId]
  );

  const note = res.rows[0];
  if (!note) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Note not found.' });
  }
  return note;
}

export async function assertInboxAccess(
  userId: string,
  inboxId: string
): Promise<{ id: string; number_id: string; contact_id: string }> {
  const res = await pool.query<{
    id: string;
    number_id: string;
    contact_id: string;
  }>(
    `SELECT i.id, i.number_id, i.contact_id
     FROM inboxes i
     JOIN numbers n ON n.id = i.number_id
     JOIN user_companies uc ON uc.company_id = n.company_id
     WHERE i.id = $1 AND uc.user_id = $2
     LIMIT 1`,
    [inboxId, userId]
  );

  const inbox = res.rows[0];
  if (!inbox) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Inbox not found.' });
  }
  return inbox;
}
