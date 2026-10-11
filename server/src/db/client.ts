import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;
let db: Db | null = null;

/** Hosted Postgres providers that require TLS (Supabase, Neon) get it automatically. */
export function needsTls(url: string, forced: boolean): boolean {
  if (forced) return true;
  try {
    return /\.(supabase\.(co|com)|pooler\.supabase\.com|neon\.tech)$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * node-postgres lets `sslmode` in the URL override the `ssl` option (and treats `require` as full verification,
 * which fails against providers' own CAs). When TLS is on, drop `sslmode` and use the explicit option instead.
 */
export function connectionStringFor(url: string, tls: boolean): string {
  if (!tls) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return url;
  }
}

export function getPool(): pg.Pool {
  if (!pool) {
    const c = config();
    const tls = needsTls(c.DATABASE_URL, c.DATABASE_SSL);
    pool = new pg.Pool({
      connectionString: connectionStringFor(c.DATABASE_URL, tls),
      ssl: tls ? { rejectUnauthorized: false } : undefined,
      max: c.DATABASE_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
  }
  return pool;
}

export function getDb(): Db {
  if (!db) db = drizzle(getPool(), { schema });
  return db;
}

export async function closeDb() {
  if (pool) await pool.end();
  pool = null;
  db = null;
}

export { schema };
