import { UserCompaniesRepository } from '@/db/repositories/companies';
import { NumbersRepository } from '@/db/repositories/numbers';
import { TwilioClient } from '@/lib/twilio';
import type { Company, NumberEntry } from '@/types/db';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { paidProcedure } from '../context';
import { protectedProcedure, t } from '../trpc';

const twilio = new TwilioClient(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
  process.env.TWILIO_DEFAULT_FROM_NUMBER
);

export const companiesRouter = t.router({
  getUserCompanies: protectedProcedure.query(async (request) => {
    const companies = await UserCompaniesRepository.findCompaniesByUserId(
      request.ctx.user.uid
    );

    return companies as (Company & { numbers: NumberEntry[] })[];
  }),
  createCompany: paidProcedure
    .input(
      z.object({
        companyName: z.string(),
        number: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const dbCompany = await UserCompaniesRepository.createCompany({
        companyName: input.companyName,
      });
      await UserCompaniesRepository.create({
        userId: ctx.user.uid,
        companyId: dbCompany.id,
      });

      await twilio.purchaseNumber(input.number, {
        voiceUrl: `${process.env.SERVER_DOMAIN}/twilio/voice`,
        smsUrl: `${process.env.SERVER_DOMAIN}/twilio/sms`,
      });

      await NumbersRepository.create({
        id: randomUUID() as string,
        companyId: dbCompany.id,
        createdAt: new Date(),
        number: input.number,
      });
      return { ok: true };
    }),
});
