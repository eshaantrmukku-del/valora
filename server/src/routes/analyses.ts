import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AnalyseRequestSchema, RecalculateSchema } from '../../../shared/api';
import type { ProvenanceMap } from '../../../shared/finance/deal';
import { requireUser } from '../auth/sessions';
import { getDb, schema } from '../db/client';
import { audit } from '../lib/audit';
import { IdParam, parse } from '../lib/validate';
import {
  createAnalysis,
  getOwnedAnalysis,
  recalculateAnalysis,
  requestNarrative,
} from '../services/analysis';

export function serialiseAnalysis(a: typeof schema.analyses.$inferSelect) {
  return {
    id: a.id,
    propertyId: a.propertyId,
    briefId: a.briefId,
    briefName: a.briefName,
    criteria: a.criteriaSnapshot,
    facts: a.factsSnapshot,
    factOrigins: a.factOriginsSnapshot,
    evidence: a.evidenceSnapshot,
    inputs: a.inputs,
    inputProvenance: a.inputProvenance,
    ranking: a.ranking,
    report: a.report,
    narrativeStatus: a.narrativeStatus,
    narrativeError: a.narrativeError,
    model: a.model,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export async function analysisRoutes(app: FastifyInstance) {
  app.post('/api/analyses', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const me = requireUser(req);
    const body = parse(AnalyseRequestSchema, req.body);
    const a = await createAnalysis(me.id, body.propertyId, body.briefId, body.inputs ?? {});
    await audit(me.id, 'analysis.create', { type: 'analysis', id: a.id });
    return { analysis: serialiseAnalysis(a) };
  });

  app.get('/api/analyses', async (req) => {
    const me = requireUser(req);
    const q = parse(
      z.object({
        propertyId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      req.query,
    );
    const where = q.propertyId
      ? and(eq(schema.analyses.userId, me.id), eq(schema.analyses.propertyId, q.propertyId))
      : eq(schema.analyses.userId, me.id);
    const rows = await getDb()
      .select({ a: schema.analyses })
      .from(schema.analyses)
      .where(where)
      .orderBy(desc(schema.analyses.createdAt))
      .limit(q.limit);
    return {
      analyses: rows.map(({ a }) => ({
        id: a.id,
        propertyId: a.propertyId,
        briefId: a.briefId,
        briefName: a.briefName,
        objective: a.criteriaSnapshot.objective,
        address: a.factsSnapshot.address,
        postcode: a.factsSnapshot.postcode,
        askingPrice: a.factsSnapshot.askingPrice,
        matchScore: a.ranking.matchScore,
        confidence: a.ranking.confidence,
        narrativeStatus: a.narrativeStatus,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  });

  app.get('/api/analyses/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    return { analysis: serialiseAnalysis(await getOwnedAnalysis(me.id, id)) };
  });

  /** Recalculate with edited, explicit assumptions. Deterministic; the narrative is marked stale. */
  app.put('/api/analyses/:id/inputs', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const body = parse(RecalculateSchema, req.body);
    const a = await recalculateAnalysis(me.id, id, body.inputs, (body.provenance ?? {}) as ProvenanceMap);
    return { analysis: serialiseAnalysis(a) };
  });

  app.post(
    '/api/analyses/:id/narrative',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const me = requireUser(req);
      const { id } = parse(IdParam, req.params);
      return { analysis: serialiseAnalysis(await requestNarrative(me.id, id)) };
    },
  );

  app.delete('/api/analyses/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getOwnedAnalysis(me.id, id);
    await getDb()
      .delete(schema.analyses)
      .where(and(eq(schema.analyses.id, id), eq(schema.analyses.userId, me.id)));
    return { ok: true };
  });
}
