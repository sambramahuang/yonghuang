import { ensure } from '../errors.js';
import { verifyPassword } from './password.js';
import { signToken } from './rbac.js';

// In-memory throttle. Adequate for a single-process local demo; a real
// deployment would keep this in shared storage and rate-limit at the edge.
const attempts = new Map();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

function throttle(key) {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  record.count += 1;
  ensure(record.count <= MAX_ATTEMPTS, 429, 'Too many sign-in attempts; wait a minute and try again');
}

export function loginHandler(pool, secret) {
  return async (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};
      ensure(typeof username === 'string' && typeof password === 'string', 400, 'Username and password are required');
      throttle(req.ip ?? 'unknown');

      const { rows } = await pool.query(
        'SELECT id,name,capability,password_hash FROM users WHERE lower(username)=lower($1)',
        [username.trim()],
      );
      const user = rows[0];
      // Verify even when the user is unknown so a missing account and a wrong
      // password take the same time and return the same message.
      const ok = await verifyPassword(password, user?.password_hash ?? '');
      ensure(user && ok, 401, 'Incorrect username or password');

      res.json({
        token: signToken(user.id, secret),
        user: { id: String(user.id), name: user.name, capability: user.capability },
      });
    } catch (error) {
      next(error);
    }
  };
}
