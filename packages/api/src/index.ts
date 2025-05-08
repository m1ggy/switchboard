import fastifyCors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify from 'fastify';
import client from './lib/pg';
import { appRouter } from './trpc';
import { createContext } from './trpc/context';

const fastify = Fastify();

fastify.register(fastifyCors, {
  origin: ['*'],
});
fastify.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: { router: appRouter, createContext },
});

fastify.listen({ port: 3000 }, () => {
  console.log('API listening on http://localhost:3000/trpc');
  client.connect().then(() => {
    console.log('Database pool active');
  });
});
