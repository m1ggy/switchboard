import { CallNotesRepository } from '@/db/repositories/notes';
import { TRPCError } from '@trpc/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  assertContactAccess,
  assertNoteAccess,
  assertNumberAccess,
} from '../authz';
import { protectedProcedure, t } from '../trpc';

export const notesRouter = t.router({
  getContactNotes: protectedProcedure
    .input(z.object({ contactId: z.string() }))
    .query(async ({ input, ctx }) => {
      await assertContactAccess(ctx.user.uid, input.contactId);
      return CallNotesRepository.findByContact(input.contactId);
    }),
  createNote: protectedProcedure
    .input(
      z.object({
        call_sid: z.string().optional(),
        note: z.string(),
        contact_id: z.string(),
        number_id: z.string(),
        company_id: z.string(),
        room_id: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // The note's contact and number must both belong to the user, and to
      // the company the note is filed under.
      const contact = await assertContactAccess(ctx.user.uid, input.contact_id);
      const number = await assertNumberAccess(ctx.user.uid, input.number_id);
      if (
        contact.company_id !== input.company_id ||
        number.company_id !== input.company_id
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Contact and number must belong to the given company.',
        });
      }

      try {
        return await CallNotesRepository.create({
          id: randomUUID() as string,
          ...input,
        });
      } catch (error) {
        console.error('FAiled to create note: ', error);
      }
    }),
  editNote: protectedProcedure
    .input(
      z.object({
        note: z.string(),
        noteId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertNoteAccess(ctx.user.uid, input.noteId);
      return CallNotesRepository.edit(input.noteId, { note: input.note });
    }),
  deleteNote: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await assertNoteAccess(ctx.user.uid, input.noteId);
      await CallNotesRepository.delete(input.noteId);
    }),
});
