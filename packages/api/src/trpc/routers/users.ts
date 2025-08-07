import { UsersRepository } from '@/db/repositories/users';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { protectedProcedure, t } from '../trpc';

export const usersRouter = t.router({
  setStripeCustomerId: protectedProcedure
    .input(
      z.object({
        stripeCustomerId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await UsersRepository.update(ctx.user.uid, {
        stripe_customer_id: input.stripeCustomerId,
      });
      return user;
    }),
  setOnboardingStep: protectedProcedure
    .input(z.object({ step: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const user = await UsersRepository.update(ctx.user.uid, {
        onboarding_step: input.step,
      });

      return user;
    }),
  setOnboardingCompleted: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await UsersRepository.update(ctx.user.uid, {
      onboarding_completed: true,
    });

    return user;
  }),
  createUser: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        first_name: z.string(),
        last_name: z.string(),
        uid: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const existingUser = await UsersRepository.findByEmail(input.email);

      if (existingUser) throw new Error('Email already used');
      const user = await UsersRepository.create({
        id: randomUUID(),
        email: input.email,
        first_name: input.first_name,
        last_name: input.last_name,
        user_id: input.uid,
      });

      return user;
    }),
  getUser: protectedProcedure.query(async ({ ctx }) => {
    const user = await UsersRepository.findByFirebaseUid(ctx.user.uid);

    return user;
  }),
});
