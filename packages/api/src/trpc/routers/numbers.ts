import { NumbersRepository } from '@/db/repositories/numbers';
import type { NumberEntry } from '@/types/db';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

export const numbersRouter = t.router({
  getCompanyNumbers: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async (request) => {
      const companyNumbers = await NumbersRepository.findByCompany(
        request.input.companyId
      );

      return companyNumbers as NumberEntry[];
    }),
});
