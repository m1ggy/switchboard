import { ContactsRepository } from '@/db/repositories/contacts';
import { Contact } from '@/types/db';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

export const contactsRouter = t.router({
  createContact: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        number: z.string(),
        label: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const contact = await ContactsRepository.create({
        id: randomUUID(),
        company_id: input.companyId,
        number: input.number,
        label: input.label,
      });

      return contact as Contact;
    }),
  getCompanyContacts: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ input }) => {
      const contacts = await ContactsRepository.findByCompany(input.companyId);

      return contacts as Contact[];
    }),
});
