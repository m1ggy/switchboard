import { activeCallStore, presenceStore } from '@/lib/store';
import { TwilioClient } from '@/lib/twilio';
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

      if (heldCall) {
        const webhookUrl = `${process.env.SERVER_DOMAIN}/twilio/voice/bridge`;
        await tw.bridgeCallToClient(heldCall.sid, input.identity, webhookUrl);
        activeCallStore.updateStatus(heldCall.sid, 'bridged', input.identity);
        console.log(
          `🔗 Reconnected agent ${input.identity} to held call ${heldCall.sid}`
        );
      }

      return { ok: true };
    }),
});
