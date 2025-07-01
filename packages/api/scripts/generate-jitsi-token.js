const jwt = require('jsonwebtoken');

// Configuration
const appId = 'calliya';
const appSecret = 'adobongatay'; // Replace with your actual secret
const domain = 'video.calliya.com';
const room =
  'c4dbdc0b-9679-4250-b717-0f6efec8d6b7-fa151b27-2fe9-4cad-be46-7f28d1673b67'; // or use specific room like 'myroom123'

// User context
const payload = {
  aud: 'jitsi',
  iss: appId,
  sub: domain,
  room: room,
  exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour expiry
  iat: Math.floor(Date.now() / 1000),
  context: {
    user: {
      id: 'user-1234',
      name: 'Test User',
      email: 'test@example.com',
    },
    group: 'default',
  },
};

// Generate token
const token = jwt.sign(payload, appSecret);

console.log('Generated JWT:\n');
console.log(token);
