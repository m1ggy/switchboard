import { PlansRepository } from '@/db/repositories/plan';
import { UsageRepository } from '@/db/repositories/usage';
import { UsersRepository } from '@/db/repositories/users';
import Stripe from 'stripe';
import { protectedProcedure, t } from '../trpc';

export const subscriptionRouter = t.router({
  subscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const stripe = new Stripe(process.env.STRIPE_API_KEY as string);

    const user = await UsersRepository.findByFirebaseUid(ctx.user.uid);

    if (!user) return null;

    const subscription = await stripe.subscriptions.list({
      customer: user.stripe_customer_id as string,
    });

    const userSub = subscription.data[0];

    return userSub.status;
  }),

  getUsageStatistics: protectedProcedure.query(async ({ ctx }) => {
    return await UsageRepository.getCurrentMonthTotalsByUser(ctx.user.uid);
  }),

  getPlanUsageLimits: protectedProcedure.query(async ({ ctx }) => {
    const userInfo = await UsersRepository.findByFirebaseUid(ctx.user.uid);
    const userPlan = await PlansRepository.findByPlanName(
      userInfo?.selected_plan as string
    );

    const usageLimits = (
      await PlansRepository.getUsageLimitsByPlanId(userPlan?.id as string)
    )?.map((plan) => ({
      ...plan,
      included_quantity: parseInt(plan.included_quantity.split('.')[0], 10),
    }));

    console.log('USER INFO: ', userInfo);
    console.log('CURRENT PLAN: ', userPlan);
    console.log('USAGE LIMIT: ', usageLimits);

    return usageLimits;
  }),
});
