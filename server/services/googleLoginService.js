'use strict';

const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const FLOW_TTL = 10 * 60 * 1000;
const CODE_TTL = 60 * 1000;
const MAX_ENTRIES = 10000;
const flows = new Map();
const codes = new Map();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const challenge = verifier => crypto.createHash('sha256').update(verifier).digest('base64url');
const random = () => crypto.randomBytes(32).toString('base64url');
const validCode = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const cookieName = 'rwx_google_state';
const cookieOptions = () => ({ httpOnly: true, secure: env.isProduction, sameSite: 'lax', path: `/api/${env.apiVersion}/auth/google`, maxAge: FLOW_TTL });

const prune = map => {
  const now = Date.now();
  for (const [key, entry] of map) if (entry.expires <= now) map.delete(key);
};
const put = (map, key, value) => {
  prune(map);
  if (map.size >= MAX_ENTRIES) throw new ApiError(503, 'Google sign-in temporarily unavailable.');
  map.set(key, value);
};
const readCookie = req => {
  const entries = (req.headers.cookie || '').split(';').map(part => part.trim());
  const values = entries.filter(part => part.startsWith(cookieName + '='));
  if (values.length !== 1) return null;
  return values[0].slice(cookieName.length + 1);
};

const begin = (req, res) => {
  const pkce = req.query.code_challenge;
  if (!validCode(pkce)) throw ApiError.badRequest('Start Google sign-in from the application.');
  const state = random();
  const browserNonce = random();
  put(flows, hash(state), { browserHash: hash(browserNonce), challenge: pkce, expires: Date.now() + FLOW_TTL });
  res.cookie(cookieName, browserNonce, cookieOptions());
  return state;
};

// Passport's custom state store avoids a server-session dependency while validating CSRF state.
const stateStore = {
  store(req, done) { done(new Error('Google sign-in must use the browser-bound start route.')); },
  verify(req, state, done) {
    prune(flows);
    const nonce = readCookie(req);
    const entry = validCode(state) ? flows.get(hash(state)) : null;
    if (!entry || !validCode(nonce) || !crypto.timingSafeEqual(Buffer.from(entry.browserHash), Buffer.from(hash(nonce)))) {
      return done(null, false, { message: 'Invalid or expired Google sign-in state.' });
    }
    flows.delete(hash(state));
    req.googleLoginFlow = { challenge: entry.challenge };
    return done(null, true);
  },
};

const issue = (req, res, user) => {
  if (!user || user.status !== 'active') throw ApiError.forbidden('Account is not active.');
  if (!validCode(req.googleLoginFlow?.challenge)) throw ApiError.unauthorized('Invalid Google sign-in flow.');
  const code = random();
  put(codes, hash(code), { userId: user.id, challenge: req.googleLoginFlow.challenge, expires: Date.now() + CODE_TTL });
  const clearOptions = cookieOptions();
  delete clearOptions.maxAge;
  res.clearCookie(cookieName, clearOptions);
  return code;
};

const consume = req => {
  // Cross-origin JSON exchange needs no third-party cookie; PKCE binds it to the initiating tab.
  if (req.headers.origin !== new URL(env.clientUrl).origin) throw ApiError.forbidden('Untrusted sign-in origin.');
  const { code, code_verifier: verifier } = req.body || {};
  if (!validCode(code) || typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    throw ApiError.unauthorized('Invalid or expired Google sign-in code.');
  }
  prune(codes);
  const entry = codes.get(hash(code));
  if (!entry || !crypto.timingSafeEqual(Buffer.from(entry.challenge), Buffer.from(challenge(verifier)))) {
    throw ApiError.unauthorized('Invalid or expired Google sign-in code.');
  }
  // Delete synchronously before any DB await: concurrent redemption cannot issue two token sets.
  codes.delete(hash(code));
  return entry.userId;
};

module.exports = { begin, stateStore, issue, consume };
