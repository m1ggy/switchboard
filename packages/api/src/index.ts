import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify from 'fastify';
import { createContext } from './trpc/context';
import { appRouter } from './trpc/index';

const fastify = Fastify();

fastify.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: { router: appRouter, createContext },
});

fastify.listen({ port: 3000 }, () => {
  console.log('API listening on http://localhost:3000/trpc');
});
