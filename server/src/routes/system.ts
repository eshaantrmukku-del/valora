import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/sessions';
import { getDb } from '../db/client';
import { aiInfo, allProviderInfo } from '../providers/registry';
import { isEmailConfigured } from '../services/email';
import { config } from '../config';

export async function systemRoutes(app: FastifyInstance) {
  app.get('/api/health', async (_req, reply) => {
    try {
      await getDb().execute(sql`select 1`);
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });

  /** What is configured. Reports presence only — never secret values. */
  app.get('/api/integrations', async (req) => {
    requireUser(req);
    return {
      providers: allProviderInfo(),
      ai: aiInfo(),
      email: {
        configured: isEmailConfigured(),
        setup: isEmailConfigured()
          ? null
          : 'Set RESEND_API_KEY and EMAIL_FROM (a verified sender domain) to enable email alerts and password-reset emails.',
      },
      monitoring: {
        schedulerRunning: config().RUN_WORKER,
        note: config().RUN_WORKER
          ? 'Background worker runs in the web process.'
          : 'Run `npm run worker` as a separate process for searches and monitoring.',
      },
      environment: config().NODE_ENV,
    };
  });
}
