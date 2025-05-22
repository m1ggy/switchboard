import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify from 'fastify';
import fastifySocketIO from 'fastify-socket.io';

import fastifyCors from '@fastify/cors';
import formBody from '@fastify/formbody';
import twilioRoutes from './http/routes/twilio';
import { auth } from './lib/firebase';
import { appRouter } from './trpc';
import { createContext } from './trpc/context';
const app = Fastify();
app.register(formBody);
app.register(fastifyCors, {
  origin: ['http://localhost:5173', 'https://stagingspace.org'],
});
app.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: { router: appRouter, createContext },
});

app.register(fastifySocketIO, { path: '/ws', cors: { origin: '*' } });

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
