import { ContactsRepository } from '@/db/repositories/contacts';
import pool from '@/lib/pg';
import { Contact } from '@/types/db';
import { TRPCError } from '@trpc/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { assertCompanyAccess, assertContactAccess } from '../authz';
import { protectedProcedure, t } from '../trpc';

const createContactInput = z.object({
  companyId: z.string(),
  number: z.string(),
  label: z.string(),
});

async function upsertCompanyContact(input: {
  companyId: string;
  number: string;
  label: string;
}) {
  const existing = await ContactsRepository.findByNumber(
    input.number,
    input.companyId
  );

  if (existing) {
    if (existing.number === existing.label && input.label !== existing.number) {
      return await ContactsRepository.update(existing.id, {
        label: input.label,
      });
    }

    return existing;
  }

  const contact = await ContactsRepository.create({
    id: randomUUID(),
    company_id: input.companyId,
    number: input.number,
    label: input.label,
  });

  return contact as Contact;
}

/** Returns the contact if the user can see it, otherwise null (not an error). */
async function findAccessibleContact(
  userId: string,
  contactId: string
): Promise<Contact | null> {
  try {
    return await assertContactAccess(userId, contactId);
  } catch (err) {
    if (err instanceof TRPCError && err.code === 'NOT_FOUND') return null;
    throw err;
  }
}

export const contactsRouter = t.router({
  createContact: protectedProcedure
    .input(createContactInput)
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user.uid, input.companyId);
      return await upsertCompanyContact(input);
    }),

  createCompanyContact: protectedProcedure
    .input(createContactInput)
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user.uid, input.companyId);
      return await upsertCompanyContact(input);
    }),

  getCompanyContacts: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user.uid, input.companyId);
      const contacts = await ContactsRepository.findByCompany(input.companyId);
      return contacts as Contact[];
    }),

  updateCompanyContact: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        number: z.string(),
        label: z.string(),
        contactId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Must own the contact AND the (possibly different) target company.
      await assertContactAccess(ctx.user.uid, input.contactId);
      await assertCompanyAccess(ctx.user.uid, input.companyId);

      const updatedContact = await ContactsRepository.update(input.contactId, {
        company_id: input.companyId,
        number: input.number,
        label: input.label,
      });

      return updatedContact;
    }),

  updateContactDetails: protectedProcedure
    .input(
      z.object({
        contactId: z.string(),
        email: z
          .union([z.string().trim().email().max(320), z.literal('')])
          .nullish(),
        alternate_number: z.string().max(32).nullish(),
        organization: z.string().max(200).nullish(),
        address: z.string().max(500).nullish(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { contactId, ...details } = input;
      await assertContactAccess(ctx.user.uid, contactId);

      const updated = await ContactsRepository.updateDetails(
        contactId,
        details
      );
      if (!updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Contact not found.',
        });
      }
      return updated;
    }),

  findContactById: protectedProcedure
    .input(z.object({ contactId: z.string() }))
    .query(async ({ input, ctx }) => {
      return findAccessibleContact(ctx.user.uid, input.contactId);
    }),

  findContactByNumber: protectedProcedure
    .input(
      z.object({
        number: z.string(),
        companyId: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (input.companyId) {
        await assertCompanyAccess(ctx.user.uid, input.companyId);
        const contact = await ContactsRepository.findByNumber(
          input.number,
          input.companyId
        );
        return contact as Contact | null;
      }

      // No company given: only search companies the user belongs to.
      const res = await pool.query<Contact>(
        `SELECT c.*
         FROM contacts c
         JOIN user_companies uc ON uc.company_id = c.company_id
         WHERE c.number = $1 AND uc.user_id = $2
         LIMIT 1`,
        [input.number, ctx.user.uid]
      );
      return (res.rows[0] ?? null) as Contact | null;
    }),
});
