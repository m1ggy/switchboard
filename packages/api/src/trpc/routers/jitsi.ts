import { UserCompaniesRepository } from '@/db/repositories/companies';
import { ShortenUrlRepository } from '@/db/repositories/shorten_urls';
import { createJitsiToken } from '@/lib/jitsi';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';
import { createCaller } from './app';

export const jitsiRouter = t.router({
  token: protectedProcedure
    .input(z.object({ roomName: z.string() }))
    .query(async ({ ctx, input }) => {
      return createJitsiToken(ctx.user, input.roomName);
    }),

  getClientCallURL: protectedProcedure
    .input(
      z.object({
        contactId: z.string(),
        companyId: z.string(),
        numberId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const roomName = `${input.numberId}-${input.contactId}`;

      const jwt = createJitsiToken(ctx.user, roomName);
      const company = await UserCompaniesRepository.findCompanyById(
        input.companyId
      );

      const url = `${process.env.WEB_DOMAIN}/call/${roomName}?jwt=${jwt}&companyName=${company?.name}`;

      const shortenUrl = await ShortenUrlRepository.findOrCreate({
        full_url: url,
        created_by: ctx.user.uid,
        company_id: input.companyId,
      });

      // send SMS (if available)
      // TODO: instead of using the first number available, check which has SMS capability before proceeding
      const body = `
Hi! Join your video call now: ${`${process.env.WEB_DOMAIN}/s/${shortenUrl.id}`}
⏳ Link expires in 30 mins. Reply if you need help.
      `;

      const caller = createCaller(ctx);
      await caller.twilio
        .sendSMS({ contactId: input.contactId, numberId: input.numberId, body })
        .catch();

      return { url };
    }),
});
