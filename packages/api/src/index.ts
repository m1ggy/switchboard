import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify from 'fastify';
import fastifySocketIO from 'fastify-socket.io';

import fastifyCors from '@fastify/cors';
import formBody from '@fastify/formbody';
import twilioRoutes from './http/routes/twilio';
import { auth } from './lib/firebase';
import { appRouter } from './trpc';
import { createContext } from './trpc/context';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

console.info('Starting Switchboard Server');

if (process.env.NODE_ENV === 'development') {
  dotenv.config({
    path: path.resolve(__dirname, '../.env.development'),
    override: true,
  });

  console.info('Using DEVELOPMENT vars');
}

if (!process.env.SERVER_DOMAIN)
  throw new Error('SERVER DOMAIN not set! exiting');
const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    },
  },
});

app.register(fastifySocketIO, {
  path: '/ws',
  cors: {
    origin: ['http://localhost:5173', process.env.WEB_DOMAIN as string],
  },
});

app.register(fastifyCors, {
  origin: ['http://localhost:5173', process.env.WEB_DOMAIN as string],
});
app.register(formBody);
app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: { router: appRouter, createContext, allowBatching: false },
});

app.get('/', (_, reply) => {
  return reply
    .status(200)
    .type('text/html')
    .send(`<html><body><p>Switchboard API v1</p></body></html>`);
});

app.get('/health', () => {
  return { message: 'OK' };
});

app.register(twilioRoutes, { prefix: '/twilio' });

app.listen({ port: 3000 }, () => {
  console.log('API listening on http://localhost:3000');
  app.io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split('Bearer ')[1];

      if (!token) {
        return next(new Error('No token provided'));
      }

      const decoded = await auth.verifyIdToken(token);
      socket.data.user = decoded;

      next();
    } catch (err) {
      console.error('Socket auth error:', err);
      return next(new Error('Authentication failed'));
    }
  });

  app.io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('ping', (msg) => {
      console.log('Received ping:', msg);
      socket.emit('pong', `pong: ${msg}`);
    });
  });
});
