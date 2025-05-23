import { TwilioClient } from '@/lib/twilio';
import dotenv from 'dotenv';
import { z } from 'zod';
import { protectedProcedure, router } from '../trpc';

dotenv.config();

export const twilioRouter = router({
  token: protectedProcedure
    .input(z.object({ identity: z.string().optional() }))
    .query(({ input }) => {
      const tw = new TwilioClient(
        process.env.TWILIO_ACCOUNT_SID as string,
        process.env.TWILIO_AUTH_TOKEN as string
      );

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
});
