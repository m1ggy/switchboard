import { ClientOrganizationsRepository } from '@/db/repositories/client_organizations';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

const PAGE_SIZE = 20;

export const clientOrganizationsRouter = t.router({
  getMyOrganization: protectedProcedure.query(async ({ ctx }) => {
    return ClientOrganizationsRepository.findByUserId(ctx.user.uid);
  }),

  getDashboardStats: protectedProcedure
    .input(z.object({ clientOrganizationId: z.string() }))
    .query(async ({ input }) => {
      return ClientOrganizationsRepository.getDashboardStats(
        input.clientOrganizationId
      );
    }),
  getContacts: protectedProcedure
    .input(
      z.object({
        clientOrganizationId: z.string(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(PAGE_SIZE),
      })
    )
    .query(async ({ input }) => {
      const { clientOrganizationId, page, pageSize } = input;
      const offset = (page - 1) * pageSize;

      const { data, total } = await ClientOrganizationsRepository.listContacts(
        clientOrganizationId,
        { limit: pageSize, offset }
      );

      return {
        data,
        page,
        pageSize,
        total,
        hasMore: offset + pageSize < total,
      };
    }),

  getLogs: protectedProcedure
    .input(
      z.object({
        clientOrganizationId: z.string(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(PAGE_SIZE),
      })
    )
    .query(async ({ input }) => {
      const { clientOrganizationId, page, pageSize } = input;
      const offset = (page - 1) * pageSize;

      const { data, total } = await ClientOrganizationsRepository.listLogs(
        clientOrganizationId,
        { limit: pageSize, offset }
      );

      return {
        data,
        page,
        pageSize,
        total,
        hasMore: offset + pageSize < total,
      };
    }),
});
