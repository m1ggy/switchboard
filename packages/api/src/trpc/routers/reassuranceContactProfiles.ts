// src/server/routers/reassuranceContactProfiles.ts
import { ContactsRepository } from '@/db/repositories/contacts';
import { ReassuranceContactProfilesRepository } from '@/db/repositories/reassurance_contact_profiles';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

// Minimal: you can expand these schemas later
const jsonRecord = z.record(z.any());

const upsertInput = z.object({
  contactId: z.string().uuid(),
  // optional fields (patch-like upsert)
  preferredName: z.string().min(1).optional().nullable(),
  locale: z.string().min(2).optional().nullable(),
  timezone: z.string().min(1).optional().nullable(),
  demographics: jsonRecord.optional().nullable(),
  medicalNotes: z.string().optional().nullable(),
  preferences: jsonRecord.optional().nullable(),
  goals: z.string().optional().nullable(),
  riskFlags: jsonRecord.optional().nullable(),
  lastState: jsonRecord.optional().nullable(),
});

export const reassuranceContactProfilesRouter = t.router({
  getByContactId: protectedProcedure
    .input(z.object({ contactId: z.string().uuid() }))
    .query(async ({ input }) => {
      const profile = await ReassuranceContactProfilesRepository.getByContactId(
        input.contactId
      );
      return profile;
    }),

  upsert: protectedProcedure.input(upsertInput).mutation(async ({ input }) => {
    // Optional: ensure contact exists (safety)
    const contact = await ContactsRepository.findById?.(input.contactId);
    // If you don't have findById, you can skip this, or add it.
    if (contact === null) {
      throw new Error('Contact not found');
    }

    const saved = await ReassuranceContactProfilesRepository.upsert({
      contact_id: input.contactId,
      preferred_name: input.preferredName ?? null,
      locale: input.locale ?? null,
      timezone: input.timezone ?? null,
      demographics: input.demographics ?? null,
      medical_notes: input.medicalNotes ?? null,
      preferences: input.preferences ?? null,
      goals: input.goals ?? null,
      risk_flags: input.riskFlags ?? null,
      last_state: input.lastState ?? null,
    });

    return saved;
  }),

  mergeLastState: protectedProcedure
    .input(z.object({ contactId: z.string().uuid(), patch: jsonRecord }))
    .mutation(async ({ input }) => {
      return await ReassuranceContactProfilesRepository.mergeLastState(
        input.contactId,
        input.patch
      );
    }),

  mergeRiskFlags: protectedProcedure
    .input(z.object({ contactId: z.string().uuid(), patch: jsonRecord }))
    .mutation(async ({ input }) => {
      return await ReassuranceContactProfilesRepository.mergeRiskFlags(
        input.contactId,
        input.patch
      );
    }),
});
