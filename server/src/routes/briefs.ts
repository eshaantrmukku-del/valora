import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BriefWriteSchema, InterpretRequestSchema } from '../../../shared/api';
import { normaliseCriteria, searchReadiness, type BriefCriteria } from '../../../shared/brief';
import { aiAvailable, describeAiError } from '../ai/client';
import { extractBriefWithAi } from '../ai/briefExtraction';
import { requireUser } from '../auth/sessions';
import { getDb, schema } from '../db/client';
import { interpretWithRules } from '../domain/briefRules';
import { audit } from '../lib/audit';
import { AppError, notFound } from '../lib/errors';
import { IdParam, parse } from '../lib/validate';
import { getPreferences } from './preferences';

type BriefRow = typeof schema.investmentBriefs.$inferSelect;

export function serialiseBrief(b: BriefRow, monitor?: typeof schema.monitors.$inferSelect | null) {
  return {
    id: b.id,
    name: b.name,
    originalRequest: b.originalRequest,
    criteria: b.criteria,
    status: b.status,
    interpreter: b.interpreter,
    interpreterModel: b.interpreterModel,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    monitor: monitor
      ? {
          active: monitor.active,
          frequencyHours: monitor.frequencyHours,
          lastRunAt: monitor.lastRunAt?.toISOString() ?? null,
          nextRunAt: monitor.nextRunAt.toISOString(),
          lastStatus: monitor.lastStatus,
          lastError: monitor.lastError,
        }
      : null,
  };
}

export async function getOwnedBrief(userId: string, id: string): Promise<BriefRow> {
  const [b] = await getDb()
    .select()
    .from(schema.investmentBriefs)
    .where(and(eq(schema.investmentBriefs.id, id), eq(schema.investmentBriefs.userId, userId)));
  if (!b) throw notFound('Investment brief');
  return b;
}

function safeNormalise(c: BriefCriteria) {
  try {
    return normaliseCriteria(c);
  } catch (e) {
    if (e instanceof z.ZodError)
      throw new AppError(
        'validation_failed',
        e.issues[0]?.message ?? 'Invalid brief',
        e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    throw e;
  }
}

export async function briefRoutes(app: FastifyInstance) {
  /** Interpret a natural-language goal into a draft brief (not saved). */
  app.post(
    '/api/briefs/interpret',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const me = requireUser(req);
      const { request } = parse(InterpretRequestSchema, req.body);
      let aiError: string | null = null;
      if (aiAvailable()) {
        try {
          const prefs = await getPreferences(me.id);
          const r = await extractBriefWithAi(request, prefs, me.id);
          return {
            name: r.name,
            criteria: r.criteria,
            interpreter: 'ai',
            model: r.model,
            readiness: searchReadiness(r.criteria),
            notice: null,
          };
        } catch (err) {
          aiError = describeAiError(err);
          req.log.warn({ err: aiError }, 'AI brief extraction failed; falling back to rules');
        }
      }
      const r = interpretWithRules(request);
      return {
        name: r.name,
        criteria: r.criteria,
        interpreter: 'rules',
        model: null,
        readiness: searchReadiness(r.criteria),
        notice: aiError
          ? `AI interpretation failed (${aiError}). Valora used its rule-based parser instead — please review every field.`
          : 'AI interpretation is not configured, so Valora used its rule-based parser. Please review every field.',
      };
    },
  );

  app.get('/api/briefs', async (req) => {
    const me = requireUser(req);
    const db = getDb();
    const rows = await db
      .select({ b: schema.investmentBriefs, m: schema.monitors })
      .from(schema.investmentBriefs)
      .leftJoin(schema.monitors, eq(schema.monitors.briefId, schema.investmentBriefs.id))
      .where(eq(schema.investmentBriefs.userId, me.id))
      .orderBy(desc(schema.investmentBriefs.updatedAt));
    return { briefs: rows.map((r) => serialiseBrief(r.b, r.m)) };
  });

  app.get('/api/briefs/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const b = await getOwnedBrief(me.id, id);
    const [m] = await getDb().select().from(schema.monitors).where(eq(schema.monitors.briefId, id));
    return { brief: serialiseBrief(b, m ?? null) };
  });

  app.post('/api/briefs', async (req) => {
    const me = requireUser(req);
    const body = parse(BriefWriteSchema, req.body);
    const criteria = safeNormalise(body.criteria);
    const [b] = await getDb()
      .insert(schema.investmentBriefs)
      .values({
        userId: me.id,
        name: body.name,
        originalRequest: body.originalRequest,
        criteria,
        schemaVersion: criteria.schemaVersion,
        interpreter: body.interpreter,
        status: body.status ?? 'active',
      })
      .returning();
    await audit(me.id, 'brief.create', { type: 'brief', id: b!.id });
    return { brief: serialiseBrief(b!, null) };
  });

  app.put('/api/briefs/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getOwnedBrief(me.id, id);
    const body = parse(BriefWriteSchema, req.body);
    const criteria = safeNormalise(body.criteria);
    const [b] = await getDb()
      .update(schema.investmentBriefs)
      .set({
        name: body.name,
        originalRequest: body.originalRequest,
        criteria,
        schemaVersion: criteria.schemaVersion,
        status: body.status ?? 'active',
        updatedAt: new Date(),
      })
      .where(and(eq(schema.investmentBriefs.id, id), eq(schema.investmentBriefs.userId, me.id)))
      .returning();
    return { brief: serialiseBrief(b!, null) };
  });

  app.patch('/api/briefs/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getOwnedBrief(me.id, id);
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(120).optional(),
        status: z.enum(['active', 'inactive']).optional(),
      }),
      req.body,
    );
    const [b] = await getDb()
      .update(schema.investmentBriefs)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.investmentBriefs.id, id), eq(schema.investmentBriefs.userId, me.id)))
      .returning();
    if (body.status === 'inactive')
      await getDb().update(schema.monitors).set({ active: false }).where(eq(schema.monitors.briefId, id));
    return { brief: serialiseBrief(b!, null) };
  });

  app.post('/api/briefs/:id/duplicate', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const src = await getOwnedBrief(me.id, id);
    const [b] = await getDb()
      .insert(schema.investmentBriefs)
      .values({
        userId: me.id,
        name: `${src.name} (copy)`.slice(0, 120),
        originalRequest: src.originalRequest,
        criteria: src.criteria,
        schemaVersion: src.schemaVersion,
        interpreter: src.interpreter,
        status: 'inactive',
      })
      .returning();
    return { brief: serialiseBrief(b!, null) };
  });

  app.delete('/api/briefs/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getOwnedBrief(me.id, id);
    await getDb()
      .delete(schema.investmentBriefs)
      .where(and(eq(schema.investmentBriefs.id, id), eq(schema.investmentBriefs.userId, me.id)));
    await audit(me.id, 'brief.delete', { type: 'brief', id });
    return { ok: true };
  });

  /** Configure scheduled monitoring for a brief. */
  app.put('/api/briefs/:id/monitor', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const brief = await getOwnedBrief(me.id, id);
    const body = parse(
      z.object({
        active: z.boolean(),
        frequencyHours: z.union([z.literal(6), z.literal(12), z.literal(24), z.literal(72), z.literal(168)]),
      }),
      req.body,
    );
    if (body.active && searchReadiness(brief.criteria).length)
      throw new AppError('validation_failed', searchReadiness(brief.criteria)[0]!);
    const db = getDb();
    const [existing] = await db.select().from(schema.monitors).where(eq(schema.monitors.briefId, id));
    let m;
    if (existing) {
      [m] = await db
        .update(schema.monitors)
        .set({
          active: body.active,
          frequencyHours: body.frequencyHours,
          updatedAt: new Date(),
          ...(body.active && !existing.active ? { nextRunAt: new Date() } : {}),
        })
        .where(eq(schema.monitors.id, existing.id))
        .returning();
    } else {
      [m] = await db
        .insert(schema.monitors)
        .values({
          userId: me.id,
          briefId: id,
          active: body.active,
          frequencyHours: body.frequencyHours,
          nextRunAt: new Date(),
        })
        .returning();
    }
    await audit(me.id, body.active ? 'monitor.enable' : 'monitor.pause', { type: 'brief', id });
    return { brief: serialiseBrief(brief, m!) };
  });
}
