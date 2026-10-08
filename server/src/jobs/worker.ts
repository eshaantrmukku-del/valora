/**
 * Background worker: processes queued jobs and runs the scheduler (due monitors, housekeeping).
 * Runs inside the API process when RUN_WORKER=true, or standalone via `npm run worker`.
 */
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import { randomUUID } from 'node:crypto';
import { purgeExpiredSessions } from '../auth/sessions';
import { config } from '../config';
import { getDb, schema } from '../db/client';
import { purgeExpiredCache } from '../providers/cache';
import { executeSearchRun, markRunFailed } from '../services/discover';
import { scheduleDueMonitors } from '../services/monitoring';
import { deliverEmail } from '../services/notifications';
import { generateAnalysisNarrative, markNarrativeFailed } from '../services/analysis';
import { processDocument, markDocumentFailed } from '../services/documents';
import { claimNext, completeJob, failJob, requeueStaleJobs, type ClaimedJob } from './queue';

async function handle(job: ClaimedJob) {
  const p = job.payload as Record<string, string>;
  switch (job.type) {
    case 'search.run':
      await executeSearchRun(p.runId!);
      await syncMonitorStatus(p.runId!);
      return;
    case 'analysis.narrative':
      await generateAnalysisNarrative(p.analysisId!);
      return;
    case 'document.extract':
      await processDocument(p.documentId!);
      return;
    case 'notification.email':
      await deliverEmail(p.deliveryId!);
      return;
  }
}

async function onFinalFailure(job: ClaimedJob, message: string) {
  const p = job.payload as Record<string, string>;
  if (job.type === 'search.run') {
    await markRunFailed(p.runId!, `Search failed: ${message}`);
    await syncMonitorStatus(p.runId!);
  }
  if (job.type === 'analysis.narrative') await markNarrativeFailed(p.analysisId!, message);
  if (job.type === 'document.extract') await markDocumentFailed(p.documentId!, message);
}

/** Reflect a monitor-triggered run's failure on the monitor record (success is recorded by the pipeline). */
async function syncMonitorStatus(runId: string) {
  const db = getDb();
  const [run] = await db.select().from(schema.searchRuns).where(eq(schema.searchRuns.id, runId));
  if (!run || run.trigger !== 'monitor' || !run.briefId || run.status !== 'failed') return;
  await db.update(schema.monitors).set({ lastStatus: 'failed', lastError: run.error }).where(eq(schema.monitors.briefId, run.briefId));
}

export interface WorkerHandle {
  stop(): Promise<void>;
  /** Process jobs until the queue is empty (tests). */
  drain(): Promise<number>;
}

export function startWorker(log: Pick<Logger, 'info' | 'error' | 'warn'>, opts: { loop?: boolean } = {}): WorkerHandle {
  const id = `worker-${randomUUID().slice(0, 8)}`;
  let stopped = false;
  let lastSchedule = 0;
  let lastHousekeeping = 0;
  let running: Promise<void> | null = null;

  async function processOne(): Promise<boolean> {
    const job = await claimNext(id);
    if (!job) return false;
    try {
      await handle(job);
      await completeJob(job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const outcome = await failJob(job, message);
      log.error({ jobId: job.id, type: job.type, attempt: job.attempts, outcome, err: message }, 'job failed');
      if (outcome === 'failed') await onFinalFailure(job, message);
    }
    return true;
  }

  async function tick() {
    const now = Date.now();
    if (now - lastSchedule > 60_000) {
      lastSchedule = now;
      try {
        const n = await scheduleDueMonitors();
        if (n) log.info({ scheduled: n }, 'monitors scheduled');
        await requeueStaleJobs();
      } catch (err) {
        log.error({ err: (err as Error).message }, 'scheduler failed');
      }
    }
    if (now - lastHousekeeping > 3_600_000) {
      lastHousekeeping = now;
      await Promise.allSettled([purgeExpiredSessions(), purgeExpiredCache()]);
    }
    while (!stopped && (await processOne())) {
      /* keep draining */
    }
  }

  async function loop() {
    while (!stopped) {
      try {
        await tick();
      } catch (err) {
        log.error({ err: (err as Error).message }, 'worker tick failed');
      }
      await new Promise((r) => setTimeout(r, config().WORKER_POLL_MS));
    }
  }

  if (opts.loop !== false) {
    running = loop();
    log.info({ worker: id }, 'worker started');
  }

  return {
    async stop() {
      stopped = true;
      await running;
    },
    async drain() {
      let n = 0;
      while (await processOne()) n++;
      return n;
    },
  };
}
