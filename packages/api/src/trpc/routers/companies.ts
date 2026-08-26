import { UserCompaniesRepository } from '@/db/repositories/companies';
import { NumbersRepository } from '@/db/repositories/numbers';
import { TwilioClient } from '@/lib/twilio';
import type { Company, NumberEntry } from '@/types/db';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { paidProcedure, superAdminProcedure } from '../context';
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

  // Admin-only: provision an account for ANY user, on an already-purchased
  // number, with no payment required. Gated to a single allowed email
  // server-side (superAdminProcedure) — do not widen without deliberate ask.
  createAccountForUser: superAdminProcedure
    .input(
      z.object({
        companyName: z.string().min(1),
        userId: z.string().min(1), // target owner's Firebase uid
        number: z.string().min(1), // already purchased on this Twilio account
        label: z.string().optional(),
        wireWebhooks: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await NumbersRepository.findByNumber(input.number);
      if (existing) {
        throw new Error(`Number ${input.number} is already assigned to a company.`);
      }

      if (input.wireWebhooks) {
        await twilio.configureExistingNumber(input.number, {
          voiceUrl: `${process.env.SERVER_DOMAIN}/twilio/voice`,
          smsUrl: `${process.env.SERVER_DOMAIN}/twilio/sms`,
          friendlyName: input.companyName,
        });
      }

      const dbCompany = await UserCompaniesRepository.createCompany({
        companyName: input.companyName,
      });

      await UserCompaniesRepository.create({
        userId: input.userId,
        companyId: dbCompany.id,
      });

      const dbNumber = await NumbersRepository.create({
        id: randomUUID(),
        companyId: dbCompany.id,
        number: input.number,
        createdAt: new Date(),
        label: input.label || 'Main line',
      });

      return { ok: true, company: dbCompany, number: dbNumber };
    }),
});
