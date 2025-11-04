import { z } from 'zod';
import { NotificationsRepository } from '../../db/repositories/notifications';
import { PushSubscriptionsRepository } from '../../db/repositories/push_subscriptions';
import { sendPushToUser } from '../../lib/push/push';
import { protectedProcedure, t } from '../trpc';

const PAGE_SIZE = 20;

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export const notificationsRouter = t.router({
  // ===========================
  // Notifications (existing)
  // ===========================
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
      return { ok: true };
    }),

  getUnreadNotificationsCount: protectedProcedure.query(async ({ ctx }) => {
    return await NotificationsRepository.getUnreadCountByUser(ctx.user.uid);
  }),

  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await NotificationsRepository.markAllAsViewedByUser(
      ctx.user.uid,
      new Date()
    );
    return { ok: true };
  }),

  // ===========================
  // Web Push (new)
  // ===========================
  subscribePush: protectedProcedure
    .input(PushSubscriptionSchema)
    .mutation(async ({ ctx, input }) => {
      await PushSubscriptionsRepository.upsert(
        ctx.user.uid,
        {
          endpoint: input.endpoint,
          keys: input.keys,
          expirationTime: input.expirationTime ?? null,
        },
        (ctx.req?.headers['user-agent'] as string | undefined) ?? null
      );
      return { ok: true };
    }),

  unsubscribePush: protectedProcedure
    .input(z.object({ endpoint: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      await PushSubscriptionsRepository.deleteByEndpoint(
        ctx.user.uid,
        input.endpoint
      );
      return { ok: true };
    }),

  /**
   * Dev/QA helper: sends a test push to the current user’s stored subscriptions.
   * Consider gating this by role/ENV in production.
   */
  sendTestPush: protectedProcedure
    .input(
      z
        .object({
          title: z.string().default('Test notification'),
          body: z.string().optional(),
          url: z.string().optional(),
          tag: z.string().optional(),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      await sendPushToUser(ctx.user.uid, {
        title: input?.title ?? 'Test notification',
        body: input?.body ?? 'This is a test.',
        url: input?.url ?? '/dashboard',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: input?.tag ?? 'test',
      });
      return { ok: true };
    }),
});
