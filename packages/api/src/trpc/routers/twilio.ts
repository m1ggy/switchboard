import { ContactsRepository } from '@/db/repositories/contacts';
import { InboxesRepository } from '@/db/repositories/inboxes';
import { MessagesRepository } from '@/db/repositories/messages';
import { NumbersRepository } from '@/db/repositories/numbers';
import { activeCallStore, presenceStore } from '@/lib/store';
import { TwilioClient } from '@/lib/twilio';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';

dotenv.config();

if (process.env.NODE_ENV === 'development') {
  dotenv.config({
    path: path.resolve(__dirname, '../.env.development'),
    override: true,
  });
}
const tw = new TwilioClient(
  process.env.TWILIO_ACCOUNT_SID as string,
  process.env.TWILIO_AUTH_TOKEN as string
);

export const twilioRouter = router({
  token: protectedProcedure
    .input(z.object({ identity: z.string().optional() }))
    .query(({ input }) => {
      console.log({ input });

      const jwt = tw.generateVoiceToken({
        apiKeySid: process.env.TWILIO_API_KEY_SID as string,
        outgoingApplicationSid: process.env.TWILIO_TWIMIL_APP_SID as string,
        apiKeySecret: process.env.TWILIO_API_KEY_SECRET as string,
        identity: input.identity ?? 'client',
        ttl: 86400, // 24 hours
      });

      return jwt as string;
    }),
  presence: protectedProcedure
    .input(z.object({ identity: z.string() }))
    .mutation(async ({ input }) => {
      presenceStore.set(input.identity);

      const heldCall = activeCallStore
        .listActive()
        .find(
          (call) => call.agent === input.identity && call.status === 'held'
        );

      if (heldCall?.conferenceSid) {
        try {
          await tw.client
            .conferences(heldCall.conferenceSid)
            .participants(heldCall.sid)
            .fetch();

          const webhookUrl = `${process.env.SERVER_DOMAIN}/twilio/voice/bridge`;
          await tw.bridgeCallToClient(heldCall.sid, input.identity, webhookUrl);
          activeCallStore.updateStatus(heldCall.sid, 'bridged', input.identity);
          console.log(
            `🔗 Reconnected agent ${input.identity} to held call ${heldCall.sid}`
          );
        } catch (err: any) {
          if (err.status === 404) {
            console.warn(
              `❌ Cannot bridge: Call ${heldCall.sid} is no longer in conference`
            );
          } else {
            throw err;
          }
        }
      }

      return { ok: true };
    }),
  sendSMS: protectedProcedure
    .input(
      z.object({
        numberId: z.string(),
        contactId: z.string(),
        body: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const number = await NumbersRepository.findById(input.numberId);

        if (!number) throw new Error('No matching number was found');
        const contact = await ContactsRepository.findById(input.contactId);

        if (!contact) throw new Error('No matching contact was found');

        const twilz = new TwilioClient(
          process.env.TWILIO_ACCOUNT_SID as string,
          process.env.TWILIO_AUTH_TOKEN as string,
          number.number
        );

        const message = await twilz.sendSms(contact.number, input.body);

        const inbox = await InboxesRepository.findOrCreate({
          numberId: input.numberId,
          contactId: input.contactId,
        });

        const dbMessage = await MessagesRepository.create({
          id: crypto.randomUUID() as string,
          message: input.body,
          inboxId: inbox.id,
          numberId: input.numberId,
          contactId: input.contactId,
          direction: 'outbound',
          meta: {
            Direction: 'OUTGOING',
            MessageSid: message.sid,
            messageDetails: message.toJSON(),
          },
          status: 'sent',
        });

        await InboxesRepository.updateLastMessage(inbox.id, dbMessage.id);

        return await MessagesRepository.findById(dbMessage.id);
      } catch (error) {
        console.error(error);
        throw error;
      }
    }),
});
