import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PropertyFactsSchema, type FactOrigins, type PropertyFacts } from '../../../shared/property';
import { aiAvailable, describeAiError } from '../ai/client';
import { extractFacts } from '../ai/documentExtraction';
import { requireUser } from '../auth/sessions';
import { getDb, schema } from '../db/client';
import { audit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { IdParam, parse } from '../lib/validate';
import { normalisePostcode } from '../providers/postcodes';
import { latestEvidence, refreshPropertyEvidence } from '../services/evidence';
import {
  createPrivateProperty,
  getAccessibleProperty,
  getOwnedProperty,
  listingsForProperty,
  mergeFacts,
} from '../services/properties';

const EditableFacts = PropertyFactsSchema.partial()
  .omit({ providerTags: true, listingStatus: true, daysOnMarket: true })
  .extend({
    askingPrice: z.number().int().min(1_000).max(100_000_000).nullable().optional(),
    bedrooms: z.number().int().min(0).max(30).nullable().optional(),
    bathrooms: z.number().int().min(0).max(30).nullable().optional(),
    floorAreaSqm: z.number().min(5).max(10_000).nullable().optional(),
    description: z.string().max(20_000).nullable().optional(),
    address: z.string().max(300).nullable().optional(),
    images: z.array(z.string().url().startsWith('https://')).max(20).optional(),
    listingUrl: z.string().url().startsWith('https://').nullable().optional(),
  });

function userOrigins(facts: Partial<PropertyFacts>): FactOrigins {
  const now = new Date().toISOString();
  const o: FactOrigins = {};
  for (const [k, v] of Object.entries(facts))
    if (v != null)
      (o as Record<string, unknown>)[k] = {
        source: 'user',
        label: 'Entered by you',
        url: null,
        retrievedAt: now,
      };
  return o;
}

function cleanFacts(f: z.infer<typeof EditableFacts>): Partial<PropertyFacts> {
  const out: Partial<PropertyFacts> = { ...f } as Partial<PropertyFacts>;
  if (f.postcode != null) {
    const pc = normalisePostcode(f.postcode);
    if (!pc)
      throw new AppError('validation_failed', 'Enter a full UK postcode, e.g. M20 2AB.', [
        { path: 'facts.postcode', message: 'Invalid postcode' },
      ]);
    out.postcode = pc;
    out.outcode = pc.split(' ')[0]!;
  }
  return out;
}

export async function propertyRoutes(app: FastifyInstance) {
  app.get('/api/properties/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const p = await getAccessibleProperty(me.id, id);
    const db = getDb();
    const [saved] = await db
      .select()
      .from(schema.savedProperties)
      .where(and(eq(schema.savedProperties.userId, me.id), eq(schema.savedProperties.propertyId, id)));
    const analyses = await db
      .select({
        id: schema.analyses.id,
        briefId: schema.analyses.briefId,
        briefName: schema.analyses.briefName,
        createdAt: schema.analyses.createdAt,
        ranking: schema.analyses.ranking,
        objective: schema.analyses.criteriaSnapshot,
      })
      .from(schema.analyses)
      .where(and(eq(schema.analyses.userId, me.id), eq(schema.analyses.propertyId, id)))
      .orderBy(desc(schema.analyses.createdAt));
    const listings = await listingsForProperty(id);
    return {
      property: {
        id: p.id,
        facts: p.facts,
        factOrigins: p.factOrigins,
        origin: p.origin,
        isPrivate: p.ownerUserId != null,
        updatedAt: p.updatedAt.toISOString(),
      },
      listings: listings.map((l) => ({
        id: l.id,
        provider: l.provider,
        url: l.url,
        status: l.status,
        askingPrice: l.askingPrice,
        firstSeenAt: l.firstSeenAt.toISOString(),
        lastCheckedAt: l.lastCheckedAt.toISOString(),
      })),
      evidence: await latestEvidence(id, 24 * 365),
      saved: saved ? { id: saved.id, note: saved.note, briefId: saved.briefId } : null,
      analyses: analyses.map((a) => ({
        id: a.id,
        briefId: a.briefId,
        briefName: a.briefName,
        objective: a.objective.objective,
        createdAt: a.createdAt.toISOString(),
        matchScore: a.ranking.matchScore,
        confidence: a.ranking.confidence,
      })),
    };
  });

  /** Manual entry. Creates a private property owned by the user. */
  app.post('/api/properties', async (req) => {
    const me = requireUser(req);
    const body = parse(z.object({ facts: EditableFacts }), req.body);
    const facts = cleanFacts(body.facts);
    if (!facts.postcode && !facts.address)
      throw new AppError('validation_failed', 'Add at least a postcode or an address.', [
        { path: 'facts.postcode', message: 'Required' },
      ]);
    const p = await createPrivateProperty(me.id, facts, userOrigins(facts), 'manual');
    await audit(me.id, 'property.create_manual', { type: 'property', id: p.id });
    return { property: { id: p.id } };
  });

  /** Pasted listing text → extracted facts (quote-verified) → private property. */
  app.post(
    '/api/properties/from-text',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const me = requireUser(req);
      const body = parse(
        z.object({
          text: z.string().trim().min(40).max(60_000),
          sourceUrl: z.string().url().startsWith('https://').nullable().optional(),
        }),
        req.body,
      );
      let result;
      try {
        result = await extractFacts(body.text, me.id, aiAvailable(), 'Listing text you pasted');
      } catch (err) {
        req.log.warn({ err: describeAiError(err) }, 'AI extraction failed; using pattern extraction');
        result = await extractFacts(body.text, me.id, false, 'Listing text you pasted');
      }
      if (body.sourceUrl) {
        result.facts.listingUrl = body.sourceUrl;
        result.origins.listingUrl = {
          source: 'user',
          label: 'Link you supplied',
          url: body.sourceUrl,
          retrievedAt: new Date().toISOString(),
        };
      }
      const p = await createPrivateProperty(me.id, result.facts, result.origins, 'listing_text');
      return {
        property: { id: p.id },
        extraction: {
          method: result.method,
          rejected: result.rejected,
          extracted: Object.keys(result.facts),
        },
      };
    },
  );

  /**
   * Listing URL. Valora does not fetch property portal pages (their terms prohibit automated access).
   * A URL is supported only when it matches a listing already retrieved from a configured provider.
   */
  app.post('/api/properties/from-url', async (req) => {
    requireUser(req);
    const { url } = parse(z.object({ url: z.string().trim().url().max(2_000) }), req.body);
    const [l] = await getDb().select().from(schema.listings).where(eq(schema.listings.url, url)).limit(1);
    if (l) return { property: { id: l.propertyId } };
    const host = new URL(url).hostname.replace(/^www\./, '');
    const portal = /rightmove|zoopla|onthemarket|primelocation/.test(host);
    throw new AppError(
      'unsupported',
      portal
        ? `Valora can’t read ${host} pages directly — the portal’s terms don’t allow automated access. Paste the listing text instead, upload the brochure, or enter the details manually.`
        : 'This link isn’t from a supported data provider. Paste the listing text, upload a brochure, or enter the details manually.',
      { host, alternatives: ['paste_text', 'upload_document', 'manual_entry'] },
    );
  });

  app.patch('/api/properties/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const p = await getOwnedProperty(me.id, id);
    const body = parse(z.object({ facts: EditableFacts }), req.body);
    const facts = cleanFacts(body.facts);
    await getDb()
      .update(schema.properties)
      .set({
        facts: mergeFacts(p.facts, facts),
        factOrigins: { ...p.factOrigins, ...userOrigins(facts) },
        updatedAt: new Date(),
      })
      .where(eq(schema.properties.id, id));
    return { ok: true };
  });

  app.delete('/api/properties/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getOwnedProperty(me.id, id);
    await getDb()
      .delete(schema.properties)
      .where(and(eq(schema.properties.id, id), eq(schema.properties.ownerUserId, me.id)));
    await audit(me.id, 'property.delete', { type: 'property', id });
    return { ok: true };
  });

  app.post(
    '/api/properties/:id/refresh-evidence',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const me = requireUser(req);
      const { id } = parse(IdParam, req.params);
      const p = await getAccessibleProperty(me.id, id);
      const enriched = await refreshPropertyEvidence(p.id, p.facts, p.factOrigins);
      return { evidence: enriched.evidence };
    },
  );

  app.post('/api/properties/:id/report', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getAccessibleProperty(me.id, id);
    const body = parse(
      z.object({ field: z.string().trim().min(1).max(60), message: z.string().trim().min(3).max(1_000) }),
      req.body,
    );
    await getDb()
      .insert(schema.dataReports)
      .values({ userId: me.id, propertyId: id, field: body.field, message: body.message });
    await audit(me.id, 'property.report_data', { type: 'property', id }, { field: body.field });
    return { ok: true };
  });
}
