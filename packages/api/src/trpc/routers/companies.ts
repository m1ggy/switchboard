import { UserCompaniesRepository } from '@/db/repositories/companies';
import type { Company } from '@/types/db';
import { protectedProcedure, t } from '../trpc';

export const companiesRouter = t.router({
  getUserCompanies: protectedProcedure.query(async (request) => {
    const companies = await UserCompaniesRepository.findCompaniesByUserId(
      request.ctx.user.uid
    );

    return companies as Company[];
  }),
});
