import { config } from 'dotenv';
import { DecodedIdToken } from 'firebase-admin/auth';
import jwt from 'jsonwebtoken';

config();

const JITSI_APP_ID = process.env.JITSI_APP_ID;
const JITSI_APP_SECRET = process.env.JITSI_APP_SECRET;
const JITSI_DOMAIN = process.env.JITSI_DOMAIN;

export function createJitsiToken(user: DecodedIdToken, roomName = '*') {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    aud: 'jitsi',
    iss: JITSI_APP_ID,
    sub: JITSI_DOMAIN,
    room: roomName,
    exp: now + 60 * 60, // token valid for 1 hour
    context: {
      user: {
        id: user.uid,
        name: user.name || user.email || 'Guest',
        email: user.email,
        avatar: user.picture,
      },
      group: user.tenant || 'default',
    },
  };

  const token = jwt.sign(payload, JITSI_APP_SECRET as string, {
    algorithm: 'HS256',
  });

  return token;
}
