import { UserCompaniesRepository } from '@/db/repositories/companies';
import { ShortenUrlRepository } from '@/db/repositories/shorten_urls';
import { z } from 'zod';
import { t } from '../trpc';

export const shortUrlRouter = t.router({
  getFullUrl: t.procedure
    .input(z.object({ shortUrlId: z.string() }))
    .query(async ({ input }) => {
      const url = await ShortenUrlRepository.findById(input.shortUrlId);

      if (url) {
        const company = await UserCompaniesRepository.findCompanyById(
          url.company_id
        );
        return { url: url.full_url, company: company?.name };
      } else return null;
    }),
});
