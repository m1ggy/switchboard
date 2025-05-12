import 'fastify';
import { auth } from 'firebase-admin';
import { Server } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }

  interface FastifyRequest {
    user: auth.DecodedIdToken;
  }
}
