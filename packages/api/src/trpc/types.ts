import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './routers/app';

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

export type GetUserCompaniesOutput =
  RouterOutput['companies']['getUserCompanies'][number];
