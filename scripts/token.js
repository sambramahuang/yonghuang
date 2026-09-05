import { createPool } from '../backend/src/db.js';
import { signToken } from '../backend/src/auth/rbac.js';
const role = process.argv[2]?.toUpperCase();
if (!['REVIEWER','APPROVER'].includes(role)) throw new Error('Usage: npm run token -- reviewer|approver');
const pool = createPool();
try {
  const user = (await pool.query('SELECT id FROM users WHERE capability=$1 ORDER BY id LIMIT 1',[role])).rows[0];
  if (!user) throw new Error('Seeded account not found; run db:migrate first');
  console.log(signToken(user.id,process.env.AUTH_SECRET));
} finally { await pool.end(); }
