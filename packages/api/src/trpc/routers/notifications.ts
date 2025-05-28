import { NotificationsRepository } from '@/db/repositories/notifications';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

export const notificationsRouter = t.router({
  getNotifications: protectedProcedure.query(async ({ ctx }) => {
    const notifications = await NotificationsRepository.findByUser(
      ctx.user.uid
    );

    return notifications;
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
});
