/**
 * Postgres-backed job queue. Jobs survive restarts; workers claim jobs with FOR UPDATE SKIP LOCKED so
 * several worker processes can run safely. Failed jobs retry with exponential backoff up to max_attempts.
 */
import { sql } from 'drizzle-orm';
import { getDb, schema } from '../db/client';

export type JobType = 'search.run' | 'analysis.narrative' | 'document.extract' | 'notification.email';

export async function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
  opts: { dedupeKey?: string; runAt?: Date; maxAttempts?: number } = {},
): Promise<number | null> {
  const rows = await getDb()
    .insert(schema.jobs)
    .values({
      type,
      payload,
      dedupeKey: opts.dedupeKey ?? null,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 3,
    })
    .onConflictDoNothing()
    .returning({ id: schema.jobs.id });
  return rows[0]?.id ?? null;
}

export interface ClaimedJob {
  id: number;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export async function claimNext(workerId: string): Promise<ClaimedJob | null> {
  const res = await getDb().execute(sql`
    update jobs set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1, updated_at = now()
    where id = (
      select id from jobs where status = 'queued' and run_at <= now()
      order by run_at, id
      for update skip locked
      limit 1
    )
    returning id, type, payload, attempts, max_attempts`);
  const row = res.rows[0] as
    | {
        id: string | number;
        type: JobType;
        payload: Record<string, unknown>;
        attempts: number;
        max_attempts: number;
      }
    | undefined;
  if (!row) return null;
  return {
    id: Number(row.id),
    type: row.type,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
}

export async function completeJob(id: number) {
  await getDb().execute(
    sql`update jobs set status = 'succeeded', locked_at = null, updated_at = now() where id = ${id}`,
  );
}

export async function failJob(job: ClaimedJob, error: string): Promise<'retrying' | 'failed'> {
  const final = job.attempts >= job.maxAttempts;
  const delaySeconds = Math.min(600, 15 * 2 ** (job.attempts - 1));
  await getDb().execute(sql`
    update jobs set
      status = ${final ? 'failed' : 'queued'},
      last_error = ${error.slice(0, 2000)},
      locked_at = null,
      run_at = now() + (${delaySeconds} || ' seconds')::interval,
      updated_at = now()
    where id = ${job.id}`);
  return final ? 'failed' : 'retrying';
}

/** Re-queue jobs whose worker died mid-run (locked for longer than the stale threshold). */
export async function requeueStaleJobs(staleMinutes = 15) {
  await getDb().execute(sql`
    update jobs set status = 'queued', locked_at = null, updated_at = now()
    where status = 'running' and locked_at < now() - (${staleMinutes} || ' minutes')::interval`);
}
