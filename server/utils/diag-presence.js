'use strict';

/**
 * Quick presence diagnostic.
 *   node utils/diag-presence.js
 *
 * Logs in two known accounts, opens a socket each, then has user A disconnect
 * and verifies user B receives a `presence:update` event with online=false.
 */

const { io } = require('socket.io-client');
const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

const API = 'http://localhost:5000/api/v1';
const SOCK = 'http://localhost:5000';

const login = async (email, password) => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`Login ${email} failed: ${json.message || r.status}`);
  return { token: json.data.accessToken, userId: json.data.user.id, name: json.data.user.name };
};

const connect = (token, label) => new Promise((resolve, reject) => {
  const s = io(SOCK, { auth: { token }, transports: ['websocket'] });
  s.on('connect', () => {
    console.log(`[${label}] socket connected: ${s.id}`);
    resolve(s);
  });
  s.on('connect_error', (err) => reject(new Error(`[${label}] connect error: ${err.message}`)));
});

(async () => {
  try {
    const A = await login('demo@example.com', 'Test@1234');
    const B = await login('admin@rewearx.com', 'Admin@123456');
    console.log(`A=user#${A.userId} (${A.name})  B=user#${B.userId} (${B.name})`);

    const sA = await connect(A.token, 'A');
    const sB = await connect(B.token, 'B');

    sB.on('presence:update', (p) => console.log('[B] presence:update <-', p));
    sA.on('presence:update', (p) => console.log('[A] presence:update <-', p));

    // Ask B for current presence of A
    await new Promise((resolve) => {
      sB.emit('presence:get', { userIds: [A.userId] }, (resp) => {
        console.log('[B] presence:get ->', JSON.stringify(resp));
        resolve();
      });
    });

    console.log('\n>>> Disconnecting A in 1s ...');
    await new Promise((r) => setTimeout(r, 1000));
    sA.disconnect();

    await new Promise((r) => setTimeout(r, 1500));

    console.log('\n>>> Reconnecting A ...');
    const sA2 = await connect(A.token, 'A2');

    await new Promise((r) => setTimeout(r, 1500));

    sA2.disconnect();
    sB.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
  }
})();
