import { CallNotesRepository } from '@/db/repositories/notes';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

export const notesRouter = t.router({
  getContactNotes: protectedProcedure
    .input(z.object({ contactId: z.string() }))
    .query(async ({ input }) => {
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
    .mutation(async ({ input }) => {
      try {
        return CallNotesRepository.create({
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
    .mutation(async ({ input }) => {
      return CallNotesRepository.edit(input.noteId, { note: input.note });
    }),
  deleteNote: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(async ({ input }) => {
      CallNotesRepository.delete(input.noteId);
    }),
});
