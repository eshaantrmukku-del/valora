import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BriefCriteriaSchema, normaliseCriteria } from '../../../shared/brief';
import { requireUser } from '../auth/sessions';
import { getDb, schema } from '../db/client';
import { AppError, notFound } from '../lib/errors';
import { IdParam, parse } from '../lib/validate';
import { createSearchRun } from '../services/discover';
import { getOwnedBrief } from './briefs';

export function serialiseRun(r: typeof schema.searchRuns.$inferSelect) {
  return {
    id: r.id,
    briefId: r.briefId,
    briefName: r.briefName,
    criteria: r.criteriaSnapshot,
    trigger: r.trigger,
    status: r.status,
    stage: r.stage,
    providerStatus: r.providerStatus,
    error: r.error,
    candidateCount: r.candidateCount,
    resultCount: r.resultCount,
    createdAt: r.createdAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}

export async function discoverRoutes(app: FastifyInstance) {
  /** Start a search from a saved brief, or from an unsaved draft brief. Long-running: returns a run id to poll. */
  app.post(
    '/api/search-runs',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const me = requireUser(req);
      const body = parse(
        z.object({
          briefId: z.string().uuid().nullable(),
          criteria: BriefCriteriaSchema.nullable(),
          name: z.string().trim().max(120).nullable(),
          idempotencyKey: z.string().min(8).max(100).nullable(),
        }),
        req.body,
      );
      let criteria;
      let name: string;
      if (body.briefId) {
        const b = await getOwnedBrief(me.id, body.briefId);
        criteria = b.criteria;
        name = b.name;
      } else if (body.criteria) {
        criteria = normaliseCriteria(body.criteria);
        name = body.name || 'Unsaved search';
      } else {
        throw new AppError('bad_request', 'Provide a briefId or criteria.');
      }
      const run = await createSearchRun({
        userId: me.id,
        briefId: body.briefId,
        briefName: name,
        criteria,
        trigger: 'manual',
        idempotencyKey: body.idempotencyKey,
      });
      return { run: serialiseRun(run) };
    },
  );

  app.get('/api/search-runs', async (req) => {
    const me = requireUser(req);
    const q = parse(z.object({ briefId: z.string().uuid().optional() }), req.query);
    const where = q.briefId
      ? and(eq(schema.searchRuns.userId, me.id), eq(schema.searchRuns.briefId, q.briefId))
      : eq(schema.searchRuns.userId, me.id);
    const runs = await getDb()
      .select()
      .from(schema.searchRuns)
      .where(where)
      .orderBy(desc(schema.searchRuns.createdAt))
      .limit(20);
    return { runs: runs.map(serialiseRun) };
  });

  app.get('/api/search-runs/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const db = getDb();
    const [run] = await db
      .select()
      .from(schema.searchRuns)
      .where(and(eq(schema.searchRuns.id, id), eq(schema.searchRuns.userId, me.id)));
    if (!run) throw notFound('Search');
    const results = await db
      .select({ r: schema.searchResults, l: schema.listings })
      .from(schema.searchResults)
      .leftJoin(schema.listings, eq(schema.listings.id, schema.searchResults.listingId))
      .where(and(eq(schema.searchResults.searchRunId, id), isNull(schema.searchResults.dismissedAt)))
      .orderBy(schema.searchResults.rank);
    const propertyIds = results.map((x) => x.r.propertyId);
    const saved = propertyIds.length
      ? await db
          .select({ propertyId: schema.savedProperties.propertyId })
          .from(schema.savedProperties)
          .where(
            and(
              eq(schema.savedProperties.userId, me.id),
              inArray(schema.savedProperties.propertyId, propertyIds),
            ),
          )
      : [];
    const savedSet = new Set(saved.map((s) => s.propertyId));
    return {
      run: serialiseRun(run),
      results: results.map(({ r, l }) => ({
        id: r.id,
        propertyId: r.propertyId,
        rank: r.rank,
        matchScore: r.matchScore,
        confidence: r.confidence,
        ranking: r.ranking,
        facts: r.factsSnapshot,
        isNew: r.isNew,
        saved: savedSet.has(r.propertyId),
        listing: l
          ? {
              provider: l.provider,
              url: l.url,
              lastCheckedAt: l.lastCheckedAt.toISOString(),
              status: l.status,
            }
          : null,
      })),
    };
  });

  /** Dismiss a result: hides it from this run and excludes the property from future searches. */
  app.post('/api/search-results/:id/dismiss', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const db = getDb();
    const [r] = await db
      .select()
      .from(schema.searchResults)
      .where(and(eq(schema.searchResults.id, id), eq(schema.searchResults.userId, me.id)));
    if (!r) throw notFound('Result');
    await db
      .update(schema.searchResults)
      .set({ dismissedAt: new Date() })
      .where(eq(schema.searchResults.id, id));
    await db
      .insert(schema.dismissedProperties)
      .values({ userId: me.id, propertyId: r.propertyId })
      .onConflictDoNothing();
    return { ok: true };
  });

  app.get('/api/dismissed', async (req) => {
    const me = requireUser(req);
    const rows = await getDb()
      .select({
        propertyId: schema.dismissedProperties.propertyId,
        createdAt: schema.dismissedProperties.createdAt,
        facts: schema.properties.facts,
      })
      .from(schema.dismissedProperties)
      .innerJoin(schema.properties, eq(schema.properties.id, schema.dismissedProperties.propertyId))
      .where(eq(schema.dismissedProperties.userId, me.id));
    return {
      dismissed: rows.map((r) => ({
        propertyId: r.propertyId,
        address: r.facts.address,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

  app.delete('/api/dismissed/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getDb()
      .delete(schema.dismissedProperties)
      .where(
        and(eq(schema.dismissedProperties.userId, me.id), eq(schema.dismissedProperties.propertyId, id)),
      );
    return { ok: true };
  });
}
