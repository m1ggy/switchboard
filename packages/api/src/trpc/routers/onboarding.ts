import { TwilioClient } from '@/lib/twilio';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

const twilio = new TwilioClient(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
  process.env.TWILIO_DEFAULT_FROM_NUMBER
);

export const onboardingRouter = t.router({
  searchAvailableNumbers: protectedProcedure
    .input(
      z.object({
        country: z.string().default('US'),
        areaCode: z.string().optional(),
        contains: z.string().optional(),
        smsEnabled: z.boolean().optional(),
        voiceEnabled: z.boolean().optional(),
        limit: z.number().min(1).max(20).optional(),
      })
    )
    .query(async ({ input }) => {
      const numbers = await twilio.searchAvailableNumbers(input.country, {
        areaCode: input.areaCode,
        contains: input.contains,
        smsEnabled: input.smsEnabled,
        voiceEnabled: input.voiceEnabled,
        limit: input.limit,
      });

      return numbers;
    }),
});
