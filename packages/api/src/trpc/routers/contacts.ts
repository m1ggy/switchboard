import { ContactsRepository } from '@/db/repositories/contacts';
import { Contact } from '@/types/db';
import { randomUUID } from 'crypto';
import { z } from 'zod';
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

export const contactsRouter = t.router({
  createContact: protectedProcedure
    .input(createContactInput)
    .mutation(async ({ input }) => {
      return await upsertCompanyContact(input);
    }),

  createCompanyContact: protectedProcedure
    .input(createContactInput)
    .mutation(async ({ input }) => {
      return await upsertCompanyContact(input);
    }),

  getCompanyContacts: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ input }) => {
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
    .mutation(async ({ input }) => {
      const updatedContact = await ContactsRepository.update(input.contactId, {
        company_id: input.companyId,
        number: input.number,
        label: input.label,
      });

      return updatedContact;
    }),

  findContactById: protectedProcedure
    .input(z.object({ contactId: z.string() }))
    .query(async ({ input }) => {
      const contact = await ContactsRepository.findById(input.contactId);
      return contact;
    }),

  findContactByNumber: protectedProcedure
    .input(
      z.object({
        number: z.string(),
        companyId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      let contact: Contact | null = null;

      if (input.companyId) {
        contact = await ContactsRepository.findByNumber(
          input.number,
          input.companyId
        );
      } else {
        contact = await ContactsRepository.findByNumber(input.number);
      }

      return contact as Contact | null;
    }),
});
