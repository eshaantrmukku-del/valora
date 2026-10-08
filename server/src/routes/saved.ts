import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth/sessions';
import { getDb, schema } from '../db/client';
import { notFound } from '../lib/errors';
import { IdParam, parse } from '../lib/validate';
import { getAccessibleProperty } from '../services/properties';
import { getOwnedBrief } from './briefs';

export async function savedRoutes(app: FastifyInstance) {
  app.get('/api/saved', async (req) => {
    const me = requireUser(req);
    const db = getDb();
    const rows = await db
      .select({ s: schema.savedProperties, p: schema.properties, briefName: schema.investmentBriefs.name })
      .from(schema.savedProperties)
      .innerJoin(schema.properties, eq(schema.properties.id, schema.savedProperties.propertyId))
      .leftJoin(schema.investmentBriefs, eq(schema.investmentBriefs.id, schema.savedProperties.briefId))
      .where(eq(schema.savedProperties.userId, me.id))
      .orderBy(desc(schema.savedProperties.createdAt));
    const latest = await db
      .selectDistinctOn([schema.analyses.propertyId], { propertyId: schema.analyses.propertyId, id: schema.analyses.id, ranking: schema.analyses.ranking, briefName: schema.analyses.briefName })
      .from(schema.analyses)
      .where(eq(schema.analyses.userId, me.id))
      .orderBy(schema.analyses.propertyId, desc(schema.analyses.createdAt));
    const byProp = new Map(latest.map((l) => [l.propertyId, l]));
    return {
      saved: rows.map(({ s, p, briefName }) => {
        const a = byProp.get(p.id);
        return {
          id: s.id,
          propertyId: p.id,
          note: s.note,
          briefId: s.briefId,
          briefName,
          createdAt: s.createdAt.toISOString(),
          facts: p.facts,
          isPrivate: p.ownerUserId != null,
          latestAnalysis: a ? { id: a.id, briefName: a.briefName, matchScore: a.ranking.matchScore, confidence: a.ranking.confidence } : null,
        };
      }),
    };
  });

  app.post('/api/saved', async (req) => {
    const me = requireUser(req);
    const body = parse(z.object({ propertyId: z.string().uuid(), briefId: z.string().uuid().nullable().optional(), note: z.string().max(2_000).nullable().optional() }), req.body);
    await getAccessibleProperty(me.id, body.propertyId);
    if (body.briefId) await getOwnedBrief(me.id, body.briefId);
    const [row] = await getDb()
      .insert(schema.savedProperties)
      .values({ userId: me.id, propertyId: body.propertyId, briefId: body.briefId ?? null, note: body.note ?? null })
      .onConflictDoUpdate({
        target: [schema.savedProperties.userId, schema.savedProperties.propertyId],
        set: { ...(body.briefId !== undefined ? { briefId: body.briefId } : {}), ...(body.note !== undefined ? { note: body.note } : {}) },
      })
      .returning();
    return { saved: { id: row!.id } };
  });

  app.patch('/api/saved/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const body = parse(z.object({ note: z.string().max(2_000).nullable().optional(), briefId: z.string().uuid().nullable().optional() }), req.body);
    if (body.briefId) await getOwnedBrief(me.id, body.briefId);
    const [row] = await getDb()
      .update(schema.savedProperties)
      .set(body)
      .where(and(eq(schema.savedProperties.id, id), eq(schema.savedProperties.userId, me.id)))
      .returning();
    if (!row) throw notFound('Saved property');
    return { ok: true };
  });

  /** Remove by saved-row id or by property id. */
  app.delete('/api/saved/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const db = getDb();
    const byRow = await db.delete(schema.savedProperties).where(and(eq(schema.savedProperties.id, id), eq(schema.savedProperties.userId, me.id))).returning();
    if (!byRow.length) {
      const byProp = await db.delete(schema.savedProperties).where(and(eq(schema.savedProperties.propertyId, id), eq(schema.savedProperties.userId, me.id))).returning();
      if (!byProp.length) throw notFound('Saved property');
    }
    return { ok: true };
  });
}
