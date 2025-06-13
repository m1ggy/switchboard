import { StatisticsRepository } from '@/db/repositories/statistics';
import { TwilioClient } from '@/lib/twilio';
import { protectedProcedure, t } from '../trpc';

const twilioClient = new TwilioClient(
  process.env.TWILIO_ACCOUNT_SID as string,
  process.env.TWILIO_AUTH_TOKEN as string
);

export const statisticsRouter = t.router({
  getWeeklyCount: protectedProcedure.query(async ({ ctx }) => {
    return StatisticsRepository.getWeeklyCallCount(ctx.user.uid);
  }),
  getWeeklyCallDuration: protectedProcedure.query(async ({ ctx }) => {
    return StatisticsRepository.getWeeklyCallDuration(ctx.user.uid);
  }),
  getAvgCallDurationThisWeek: protectedProcedure.query(async ({ ctx }) => {
    return StatisticsRepository.getAvgCallDurationThisWeek(ctx.user.uid);
  }),
  getLongestCallThisWeek: protectedProcedure.query(async ({ ctx }) => {
    return StatisticsRepository.getLongestCallThisWeek(ctx.user.uid);
  }),
  getTopContactsByCallCount: protectedProcedure.query(async ({ ctx }) => {
    return StatisticsRepository.getTopContactsByCallCount(ctx.user.uid);
  }),
  getWeeklyChartData: protectedProcedure.query(async ({ ctx }) => {
    return StatisticsRepository.getWeeklyChartData(ctx.user.uid);
  }),
  getCompanyTableSummary: protectedProcedure.query(async ({ ctx }) => {
    return StatisticsRepository.getCompanyTableSummary(ctx.user.uid);
  }),
});
