import { UserCompaniesRepository } from '@/db/repositories/companies';
import { NumbersRepository } from '@/db/repositories/numbers';
import { UsersRepository } from '@/db/repositories/users';
import { auth } from '@/lib/firebase';
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

/**
 * Shared by the admin-only mutations below: wires (optionally) the number's
 * Twilio webhooks, then creates company + user_companies link + number row.
 */
async function provisionCompanyAndNumber({
  companyName,
  userId,
  number,
  label,
  wireWebhooks,
}: {
  companyName: string;
  userId: string;
  number: string;
  label?: string;
  wireWebhooks: boolean;
}) {
  const existing = await NumbersRepository.findByNumber(number);
  if (existing) {
    throw new Error(`Number ${number} is already assigned to a company.`);
  }

  if (wireWebhooks) {
    await twilio.configureExistingNumber(number, {
      voiceUrl: `${process.env.SERVER_DOMAIN}/twilio/voice`,
      smsUrl: `${process.env.SERVER_DOMAIN}/twilio/sms`,
      friendlyName: companyName,
    });
  }

  const dbCompany = await UserCompaniesRepository.createCompany({
    companyName,
  });

  await UserCompaniesRepository.create({ userId, companyId: dbCompany.id });

  const dbNumber = await NumbersRepository.create({
    id: randomUUID(),
    companyId: dbCompany.id,
    number,
    createdAt: new Date(),
    label: label || 'Main line',
  });

  return { company: dbCompany, number: dbNumber };
}

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

  // Admin-only: resolve a target user's email to their Firebase uid, so the
  // admin UI can take an email instead of a raw uid.
  lookupUserByEmail: superAdminProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ input }) => {
      try {
        const record = await auth.getUserByEmail(input.email);
        return {
          uid: record.uid,
          email: record.email ?? input.email,
          displayName: record.displayName ?? null,
        };
      } catch (err: any) {
        if (err?.code === 'auth/user-not-found') {
          throw new Error(`No account found for ${input.email}.`);
        }
        throw err;
      }
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
      const { company, number } = await provisionCompanyAndNumber(input);
      return { ok: true, company, number };
    }),

  // Admin-only: create a BRAND NEW account end-to-end — its own Firebase
  // login (own credentials), own company, own number. No password is set
  // here; a password-setup link is generated so the new user picks their
  // own password on first login. No payment required.
  createNewAccount: superAdminProcedure
    .input(
      z.object({
        email: z.string().email(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        companyName: z.string().min(1),
        number: z.string().min(1),
        label: z.string().optional(),
        wireWebhooks: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const existingDbUser = await UsersRepository.findByEmail(input.email);
      if (existingDbUser) {
        throw new Error(`${input.email} already has an account.`);
      }

      const existingNumber = await NumbersRepository.findByNumber(
        input.number
      );
      if (existingNumber) {
        throw new Error(
          `Number ${input.number} is already assigned to a company.`
        );
      }

      const firebaseUser = await auth.createUser({
        email: input.email,
        emailVerified: false,
        displayName: `${input.firstName} ${input.lastName}`.trim(),
      });

      try {
        await UsersRepository.create({
          id: randomUUID(),
          email: input.email,
          first_name: input.firstName,
          last_name: input.lastName,
          user_id: firebaseUser.uid,
          // Admin flow already provisions company + number below — nothing
          // left for the onboarding wizard to collect. Without this the new
          // user gets redirected to /onboarding on first login.
          onboarding_completed: true,
        });

        const { company, number } = await provisionCompanyAndNumber({
          companyName: input.companyName,
          userId: firebaseUser.uid,
          number: input.number,
          label: input.label,
          wireWebhooks: input.wireWebhooks,
        });

        const passwordSetupLink = await auth.generatePasswordResetLink(
          input.email
        );

        return {
          ok: true,
          uid: firebaseUser.uid,
          email: input.email,
          passwordSetupLink,
          company,
          number,
        };
      } catch (err) {
        // Best-effort cleanup so we don't leave an orphaned Firebase user
        // with no matching DB row.
        await auth.deleteUser(firebaseUser.uid).catch(() => {});
        throw err;
      }
    }),

  // Admin-only: regenerate a password-setup link for an account whose
  // original link was never captured (e.g. admin closed the dialog before
  // copying it). Old link is invalidated once a new one is issued.
  resendPasswordSetupLink: superAdminProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      try {
        await auth.getUserByEmail(input.email);
      } catch (err: any) {
        if (err?.code === 'auth/user-not-found') {
          throw new Error(`No account found for ${input.email}.`);
        }
        throw err;
      }

      const passwordSetupLink = await auth.generatePasswordResetLink(
        input.email
      );

      return { ok: true, email: input.email, passwordSetupLink };
    }),
});
