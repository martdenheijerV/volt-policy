import postgres from "postgres";

/**
 * Single Postgres connection pool, EU-only stack.
 * Configured via DATABASE_URL — points at self-hosted Postgres on Hetzner.
 *
 * Per-request user context is set via set_user_context() inside a
 * transaction, so RLS policies can read current_setting('app.user_id', true).
 */

let _sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _sql = postgres(url, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    transform: {
      undefined: null,
    },
  });
  return _sql;
}

/**
 * Run a callback inside a transaction with the user_id set as a session
 * variable so RLS policies can authorize.
 */
export async function withUser<T>(
  userId: string | null,
  callback: (sql: postgres.TransactionSql<Record<string, unknown>>) => Promise<T>
): Promise<T> {
  const sql = getSql();
  return (await sql.begin(async (tx) => {
    if (userId) {
      await tx.unsafe(`set local app.user_id = '${userId.replace(/'/g, "")}'`);
      await tx.unsafe(`set local app.role = 'authenticated'`);
    } else {
      await tx.unsafe(`set local app.role = 'anon'`);
    }
    return await callback(tx);
  })) as T;
}
