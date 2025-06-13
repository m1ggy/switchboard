import { NotificationsRepository } from '@/db/repositories/notifications';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

const PAGE_SIZE = 20;
export const notificationsRouter = t.router({
  getNotifications: protectedProcedure
    .input(z.object({ page: z.number().min(1).default(1) }).optional())
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const limit = PAGE_SIZE;
      const offset = (page - 1) * PAGE_SIZE;

      const { data, total } = await NotificationsRepository.findByUser(
        ctx.user.uid,
        { limit, offset }
      );

      return {
        data,
        page,
        pageSize: limit,
        total,
        hasMore: offset + limit < total,
      };
    }),

  readNotifications: protectedProcedure
    .input(z.object({ notificationIds: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      await NotificationsRepository.markManyAsViewed(
        input.notificationIds,
        new Date()
      );
    }),

  getUnreadNotificationsCount: protectedProcedure.query(async ({ ctx }) => {
    return await NotificationsRepository.getUnreadCountByUser(ctx.user.uid);
  }),

  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    return NotificationsRepository.markAllAsViewedByUser(
      ctx.user.uid,
      new Date()
    );
  }),
});
