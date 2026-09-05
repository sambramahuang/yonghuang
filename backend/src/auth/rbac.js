import { createHmac, timingSafeEqual } from 'node:crypto';
import { ensure, HttpError } from '../errors.js';

export function validateSecret(secret) {
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must contain at least 32 characters');
}
export function signToken(userId, secret, lifetimeSeconds = 28800) {
  validateSecret(secret);
  const payload = Buffer.from(JSON.stringify({ sub: String(userId), exp: Math.floor(Date.now() / 1000) + lifetimeSeconds })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function authenticate(pool, secret) {
  validateSecret(secret);
  return async (req, res, next) => {
    try {
      const token = req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/)?.[1];
      ensure(token, 401, 'A valid bearer token is required');
      const [payload, signature] = token.split('.');
      const expected = createHmac('sha256', secret).update(payload).digest();
      const actual = Buffer.from(signature, 'base64url');
      ensure(actual.length === expected.length && timingSafeEqual(actual, expected), 401, 'Invalid token');
      let claims;
      try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
      catch { throw new HttpError(401, 'Invalid token'); }
      ensure(/^\d+$/.test(claims.sub) && Number.isSafeInteger(claims.exp) && claims.exp > Date.now() / 1000, 401, 'Invalid or expired token');
      const { rows } = await pool.query('SELECT id,name,capability FROM users WHERE id=$1', [claims.sub]);
      ensure(rows[0], 401, 'Unknown user');
      req.user = rows[0];
      next();
    } catch (error) { next(error); }
  };
}
export function requireCapability(capability) {
  return (req, res, next) => {
    if (req.user?.capability === 'APPROVER' || req.user?.capability === capability) return next();
    next(new HttpError(403, `${capability} capability is required`));
  };
}
