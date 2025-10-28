import { UserCompaniesRepository } from '@/db/repositories/companies';
import { NumbersRepository } from '@/db/repositories/numbers';
import { UsersRepository } from '@/db/repositories/users';
import { TwilioClient } from '@/lib/twilio';
import { randomUUID } from 'crypto';
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
        // single 3-digit area code (still supported)
        areaCode: z
          .string()
          .regex(/^\d{3}$/, { message: 'areaCode must be 3 digits' })
          .optional(),
        // NEW: array of 3-digit area codes
        prefixes: z.array(z.string().regex(/^\d{3}$/)).optional(),
        // NEW: 2-letter state/region filter (e.g., 'CA', 'NY')
        region: z.string().length(2).optional(),
        contains: z.string().optional(),
        smsEnabled: z.boolean().optional(),
        voiceEnabled: z.boolean().optional(),
        // limit remains per-call; when batching, we’ll dedupe afterwards
        limit: z.number().min(1).max(20).optional(),
      })
    )
    .query(async ({ input }) => {
      const {
        country,
        areaCode,
        prefixes,
        region,
        contains,
        smsEnabled,
        voiceEnabled,
        limit,
      } = input;

      // If multiple prefixes provided, fan out to Twilio and merge results.
      if (prefixes && prefixes.length > 0) {
        const batches = await Promise.all(
          prefixes.map((p) =>
            twilio.searchAvailableNumbers(country, {
              areaCode: p,
              region, // pass state (Twilio inRegion) if present
              contains,
              smsEnabled,
              voiceEnabled,
              limit,
            })
          )
        );

        // Flatten + de-dupe by phoneNumber
        const merged = batches.flat();
        const seen = new Set<string>();
        const deduped = merged.filter((n) => {
          if (!n?.phoneNumber) return false;
          const key = n.phoneNumber;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        return deduped;
      }

      // Single areaCode or generic search
      const numbers = await twilio.searchAvailableNumbers(country, {
        areaCode,
        region,
        contains,
        smsEnabled,
        voiceEnabled,
        limit,
      });

      return numbers;
    }),

  finishOnboarding: protectedProcedure
    .input(
      z.object({
        companies: z.array(
          z.object({
            companyName: z.string(),
            companyNumber: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { companies } = input;

      const seenNames = new Set<string>();
      const seenNumbers = new Set<string>();

      for (const company of companies) {
        if (seenNames.has(company.companyName)) {
          throw new Error(`Duplicate company name: ${company.companyName}`);
        }
        if (seenNumbers.has(company.companyNumber)) {
          throw new Error(`Duplicate company number: ${company.companyNumber}`);
        }
        seenNames.add(company.companyName);
        seenNumbers.add(company.companyNumber);
      }

      for (const company of companies) {
        const dbCompany = await UserCompaniesRepository.createCompany({
          companyName: company.companyName,
        });
        await UserCompaniesRepository.create({
          userId: ctx.user.uid,
          companyId: dbCompany.id,
        });

        // purchase the number
        await twilio.purchaseNumber(company.companyNumber, {
          voiceUrl: `${process.env.SERVER_DOMAIN}/twilio/voice`,
          smsUrl: `${process.env.SERVER_DOMAIN}/twilio/sms`,
        });
        await NumbersRepository.create({
          id: randomUUID() as string,
          companyId: dbCompany.id,
          createdAt: new Date(),
          number: company.companyNumber,
          label: 'Main',
        });
      }

      await UsersRepository.update(ctx.user.uid, {
        onboarding_completed: true,
        onboarding_step: 6,
        subscription_status: 'active',
      });
    }),
});
