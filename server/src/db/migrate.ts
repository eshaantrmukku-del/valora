/** Apply database migrations from ./drizzle. Usage: `npm run db:migrate` (dev) or `npm run db:migrate:prod`. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, getDb } from './client';

export async function runMigrations(folder?: string) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Works from source (server/src/db) and from the bundle (dist/server).
  const candidates = [
    folder,
    path.resolve(process.cwd(), 'drizzle'),
    path.resolve(here, '../../../drizzle'),
  ].filter((p): p is string => Boolean(p));
  const fs = await import('node:fs');
  const migrationsFolder = candidates.find((p) => fs.existsSync(path.join(p, 'meta', '_journal.json')));
  if (!migrationsFolder) throw new Error(`No migrations folder found (looked in ${candidates.join(', ')})`);
  await migrate(getDb(), { migrationsFolder });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runMigrations()
    .then(async () => {
      console.log('Migrations applied.');
      await closeDb();
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await closeDb();
      process.exit(1);
    });
}
