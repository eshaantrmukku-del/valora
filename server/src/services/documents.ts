/**
 * Uploaded documents (property brochures). Only PDF and plain text are accepted; type is checked by magic
 * bytes, not by the client's declared MIME type. Content is stored in the database (bounded size), never
 * executed, and text is extracted with a PDF parser that does not run embedded scripts.
 */
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { aiAvailable, describeAiError } from '../ai/client';
import { extractFacts } from '../ai/documentExtraction';
import { getDb, schema } from '../db/client';
import { enqueue } from '../jobs/queue';
import { AppError, notFound } from '../lib/errors';

export function sniffType(buf: Buffer): 'application/pdf' | 'text/plain' | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  // Plain text: valid UTF-8 with no NUL bytes in the first 8 KB.
  const head = buf.subarray(0, 8192);
  if (head.includes(0)) return null;
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(head);
  if (decoded.includes('�')) return null;
  return 'text/plain';
}

export async function storeDocument(userId: string, filename: string, buf: Buffer) {
  const mime = sniffType(buf);
  if (!mime) throw new AppError('unsupported', 'Only PDF and plain-text files are supported.');
  const safeName = filename.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'document';
  const [row] = await getDb()
    .insert(schema.documents)
    .values({ userId, filename: safeName, mimeType: mime, sizeBytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), content: buf, status: 'processing' })
    .returning({ id: schema.documents.id, filename: schema.documents.filename, status: schema.documents.status, createdAt: schema.documents.createdAt });
  await enqueue('document.extract', { documentId: row!.id }, { dedupeKey: `doc:${row!.id}`, maxAttempts: 2 });
  return row!;
}

async function pdfText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  if (pdf.numPages > 60) throw new AppError('unsupported', 'PDFs longer than 60 pages are not supported.');
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export async function processDocument(documentId: string) {
  const db = getDb();
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId));
  if (!doc || doc.status === 'extracted') return;
  try {
    const text = doc.mimeType === 'application/pdf' ? await pdfText(doc.content) : doc.content.toString('utf8');
    const clean = text.replace(/\u0000/g, '').trim();
    if (clean.length < 40) throw new AppError('unsupported', 'No readable text was found. Scanned (image-only) PDFs are not supported yet.');
    const result = await extractFacts(clean, doc.userId, aiAvailable(), `Uploaded document “${doc.filename}”`);
    await db
      .update(schema.documents)
      .set({ extractedText: clean.slice(0, 200_000), extraction: result, status: 'extracted', error: null })
      .where(eq(schema.documents.id, documentId));
  } catch (err) {
    await markDocumentFailed(documentId, describeAiError(err));
  }
}

export async function markDocumentFailed(documentId: string, message: string) {
  await getDb().update(schema.documents).set({ status: 'failed', error: message.slice(0, 500) }).where(eq(schema.documents.id, documentId));
}

export async function getOwnedDocument(userId: string, id: string) {
  const [doc] = await getDb()
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, id), eq(schema.documents.userId, userId)));
  if (!doc) throw notFound('Document');
  return doc;
}
