import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Extraction } from '../ai/documentExtraction';
import { requireUser } from '../auth/sessions';
import { getDb, schema } from '../db/client';
import { AppError } from '../lib/errors';
import { IdParam, parse } from '../lib/validate';
import { getOwnedDocument, storeDocument } from '../services/documents';
import { createPrivateProperty } from '../services/properties';
import type { FactOrigins, PropertyFacts } from '../../../shared/property';

export async function documentRoutes(app: FastifyInstance) {
  app.post('/api/documents', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const me = requireUser(req);
    const file = await req.file();
    if (!file) throw new AppError('bad_request', 'Choose a file to upload.');
    const buf = await file.toBuffer();
    if (file.file.truncated) throw new AppError('payload_too_large', 'File is too large.');
    if (!buf.length) throw new AppError('bad_request', 'The file is empty.');
    const doc = await storeDocument(me.id, file.filename, buf);
    return { document: { ...doc, createdAt: doc.createdAt.toISOString() } };
  });

  app.get('/api/documents', async (req) => {
    const me = requireUser(req);
    const rows = await getDb()
      .select({
        id: schema.documents.id,
        filename: schema.documents.filename,
        status: schema.documents.status,
        error: schema.documents.error,
        propertyId: schema.documents.propertyId,
        sizeBytes: schema.documents.sizeBytes,
        createdAt: schema.documents.createdAt,
      })
      .from(schema.documents)
      .where(eq(schema.documents.userId, me.id))
      .orderBy(desc(schema.documents.createdAt))
      .limit(50);
    return { documents: rows.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })) };
  });

  app.get('/api/documents/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const d = await getOwnedDocument(me.id, id);
    return {
      document: {
        id: d.id,
        filename: d.filename,
        status: d.status,
        error: d.error,
        propertyId: d.propertyId,
        extraction: d.extraction,
        createdAt: d.createdAt.toISOString(),
      },
    };
  });

  /** Create a private property from a processed document's verified extraction. */
  app.post('/api/documents/:id/property', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const d = await getOwnedDocument(me.id, id);
    if (d.status !== 'extracted' || !d.extraction)
      throw new AppError('bad_request', 'The document has not been processed yet.');
    if (d.propertyId) return { property: { id: d.propertyId } };
    const ex = d.extraction as { facts: Partial<PropertyFacts>; origins: FactOrigins; quotes: Extraction };
    const p = await createPrivateProperty(me.id, ex.facts, ex.origins, 'document');
    await getDb()
      .update(schema.documents)
      .set({ propertyId: p.id })
      .where(and(eq(schema.documents.id, id), eq(schema.documents.userId, me.id)));
    return { property: { id: p.id } };
  });

  app.delete('/api/documents/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getOwnedDocument(me.id, id);
    await getDb()
      .delete(schema.documents)
      .where(and(eq(schema.documents.id, id), eq(schema.documents.userId, me.id)));
    return { ok: true };
  });
}
