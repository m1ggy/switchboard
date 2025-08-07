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

        // purhcase the number
        await twilio.purchaseNumber(company.companyNumber, {
          voiceUrl: `${process.env.SERVER_DOMAIN}/twilio/voice`,
          smsUrl: `${process.env.SERVER_DOMAIN}/twilio/sms`,
        });
        await NumbersRepository.create({
          id: randomUUID() as string,
          companyId: dbCompany.id,
          createdAt: new Date(),
          number: company.companyNumber,
        });
      }
      await UsersRepository.update(ctx.user.uid, {
        onboarding_completed: true,
        onboarding_step: 6,
      });
    }),
});
