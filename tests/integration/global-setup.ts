/** Integration tests run against a real Postgres database (valora_test), reset and migrated before the run. */
import pg from 'pg';

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://valora:valora@localhost:5432/valora_test';
  process.env.DATABASE_URL = url;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(
    'drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;',
  );
  await client.end();
  const { runMigrations } = await import('../../server/src/db/migrate');
  const { closeDb } = await import('../../server/src/db/client');
  await runMigrations();
  await closeDb();
}
