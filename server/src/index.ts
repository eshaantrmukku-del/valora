import { buildApp } from './app';
import { config } from './config';
import { closeDb } from './db/client';
import { runMigrations } from './db/migrate';
import { startWorker, type WorkerHandle } from './jobs/worker';

async function main() {
  const c = config();
  const app = await buildApp();
  if (c.MIGRATE_ON_START) {
    await runMigrations();
    app.log.info('migrations applied');
  }
  let worker: WorkerHandle | null = null;
  if (c.RUN_WORKER) worker = startWorker(app.log);
  await app.listen({ port: c.PORT, host: c.HOST });

  const shutdown = async () => {
    app.log.info('shutting down');
    await app.close();
    await worker?.stop();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
