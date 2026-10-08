/**
 * Comparisons: several properties evaluated with ONE brief and ONE set of financing assumptions, so the
 * figures are computed consistently. Each column also states its evidence confidence and missing data.
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { emptyCriteria } from '../../../shared/brief';
import { requireUser } from '../auth/sessions';
import { getDb, schema } from '../db/client';
import { rankProperty } from '../domain/ranking';
import { AppError, notFound } from '../lib/errors';
import { IdParam, parse } from '../lib/validate';
import { buildDeterministicReport, buildInputs } from '../services/analysis';
import { latestEvidence, refreshPropertyEvidence } from '../services/evidence';
import { financingFromPreferences } from '../services/financing';
import { getAccessibleProperty } from '../services/properties';
import { getOwnedBrief } from './briefs';
import { getPreferences } from './preferences';

async function getOwnedComparison(userId: string, id: string) {
  const [c] = await getDb()
    .select()
    .from(schema.comparisons)
    .where(and(eq(schema.comparisons.id, id), eq(schema.comparisons.userId, userId)));
  if (!c) throw notFound('Comparison');
  return c;
}

export async function comparisonRoutes(app: FastifyInstance) {
  app.get('/api/comparisons', async (req) => {
    const me = requireUser(req);
    const rows = await getDb()
      .select({
        c: schema.comparisons,
        count: sql<number>`(select count(*)::int from comparison_items ci where ci.comparison_id = ${schema.comparisons.id})`,
      })
      .from(schema.comparisons)
      .where(eq(schema.comparisons.userId, me.id))
      .orderBy(desc(schema.comparisons.updatedAt));
    return {
      comparisons: rows.map(({ c, count }) => ({
        id: c.id,
        name: c.name,
        briefId: c.briefId,
        itemCount: count,
        updatedAt: c.updatedAt.toISOString(),
      })),
    };
  });

  app.post('/api/comparisons', async (req) => {
    const me = requireUser(req);
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(120),
        briefId: z.string().uuid().nullable(),
        propertyIds: z.array(z.string().uuid()).max(6).default([]),
      }),
      req.body,
    );
    if (body.briefId) await getOwnedBrief(me.id, body.briefId);
    for (const pid of body.propertyIds) await getAccessibleProperty(me.id, pid);
    const db = getDb();
    const [c] = await db
      .insert(schema.comparisons)
      .values({ userId: me.id, name: body.name, briefId: body.briefId })
      .returning();
    if (body.propertyIds.length)
      await db
        .insert(schema.comparisonItems)
        .values(
          body.propertyIds.map((propertyId, position) => ({ comparisonId: c!.id, propertyId, position })),
        );
    return { comparison: { id: c!.id } };
  });

  app.patch('/api/comparisons/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getOwnedComparison(me.id, id);
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(120).optional(),
        briefId: z.string().uuid().nullable().optional(),
      }),
      req.body,
    );
    if (body.briefId) await getOwnedBrief(me.id, body.briefId);
    await getDb()
      .update(schema.comparisons)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.comparisons.id, id));
    return { ok: true };
  });

  app.post('/api/comparisons/:id/items', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getOwnedComparison(me.id, id);
    const { propertyId } = parse(z.object({ propertyId: z.string().uuid() }), req.body);
    await getAccessibleProperty(me.id, propertyId);
    const db = getDb();
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.comparisonItems)
      .where(eq(schema.comparisonItems.comparisonId, id));
    if (n >= 6) throw new AppError('validation_failed', 'A comparison can hold up to 6 properties.');
    await db
      .insert(schema.comparisonItems)
      .values({ comparisonId: id, propertyId, position: n })
      .onConflictDoNothing();
    await db.update(schema.comparisons).set({ updatedAt: new Date() }).where(eq(schema.comparisons.id, id));
    return { ok: true };
  });

  app.delete('/api/comparisons/:id/items/:propertyId', async (req) => {
    const me = requireUser(req);
    const { id, propertyId } = parse(
      z.object({ id: z.string().uuid(), propertyId: z.string().uuid() }),
      req.params,
    );
    await getOwnedComparison(me.id, id);
    await getDb()
      .delete(schema.comparisonItems)
      .where(
        and(eq(schema.comparisonItems.comparisonId, id), eq(schema.comparisonItems.propertyId, propertyId)),
      );
    return { ok: true };
  });

  app.delete('/api/comparisons/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getOwnedComparison(me.id, id);
    await getDb().delete(schema.comparisons).where(eq(schema.comparisons.id, id));
    return { ok: true };
  });

  /** Computed view: every property evaluated with the same brief and the same financing assumptions. */
  app.get('/api/comparisons/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const c = await getOwnedComparison(me.id, id);
    const db = getDb();
    const items = await db
      .select({ i: schema.comparisonItems, p: schema.properties })
      .from(schema.comparisonItems)
      .innerJoin(schema.properties, eq(schema.properties.id, schema.comparisonItems.propertyId))
      .where(eq(schema.comparisonItems.comparisonId, id))
      .orderBy(asc(schema.comparisonItems.position));
    const brief = c.briefId ? await getOwnedBrief(me.id, c.briefId).catch(() => null) : null;
    const criteria = brief?.criteria ?? emptyCriteria('general_screening');
    const financing = financingFromPreferences(await getPreferences(me.id));
    const columns = [];
    for (const { p } of items) {
      if (p.ownerUserId && p.ownerUserId !== me.id) continue;
      let evidence = await latestEvidence(p.id);
      let facts = p.facts;
      if (!evidence) {
        const e = await refreshPropertyEvidence(p.id, p.facts, p.factOrigins);
        evidence = e.evidence;
        facts = e.facts;
      }
      const { inputs, provenance, refurbBasis } = buildInputs(facts, evidence, criteria, financing);
      const ranking = rankProperty({ criteria, facts, evidence, financing: inputs });
      const report = buildDeterministicReport(criteria, facts, evidence, inputs, refurbBasis, ranking);
      columns.push({ propertyId: p.id, facts, evidence, inputs, provenance, ranking, report });
    }
    return {
      comparison: {
        id: c.id,
        name: c.name,
        briefId: c.briefId,
        briefName: brief?.name ?? null,
        objective: criteria.objective,
      },
      assumptions: { inputs: financing.inputs, provenance: financing.provenance },
      columns,
    };
  });
}
