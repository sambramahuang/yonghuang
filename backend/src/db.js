import pg from 'pg';

// Managed providers (Supabase, RDS) require TLS; local sockets must stay plaintext.
// `sslmode` in the connection string decides, so the same code serves both.
export function poolSsl(connectionString) {
  const mode = new URL(connectionString).searchParams.get('sslmode');
  if (!mode || mode === 'disable') return false;
  // `require` asks for encryption without a local CA bundle to verify against.
  // `verify-ca`/`verify-full` keep verification on and need PGSSLROOTCERT.
  return mode === 'require' ? { rejectUnauthorized: false } : true;
}

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const ssl = poolSsl(connectionString);
  // pg parses `sslmode` itself and its interpretation is changing in pg v9, so
  // drop the parameter and let the resolved `ssl` option be the only authority.
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  return new pg.Pool({ connectionString: url.href, ssl, max: 10 });
}

export async function transaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
