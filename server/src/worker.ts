/** Standalone worker entry point (`npm run worker`). */
import pino from 'pino';
import { config } from './config';
import { closeDb } from './db/client';
import { startWorker } from './jobs/worker';

const log = pino({ level: config().LOG_LEVEL });
const worker = startWorker(log);

async function shutdown() {
  log.info('worker shutting down');
  await worker.stop();
  await closeDb();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
