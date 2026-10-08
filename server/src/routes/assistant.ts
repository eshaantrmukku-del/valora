import { and, asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { runAssistantTurn } from '../ai/assistant';
import { aiAvailable } from '../ai/client';
import { requireUser } from '../auth/sessions';
import { getDb, schema } from '../db/client';
import { AppError, notFound } from '../lib/errors';
import { IdParam, parse } from '../lib/validate';

export async function assistantRoutes(app: FastifyInstance) {
  app.get('/api/assistant/conversations', async (req) => {
    const me = requireUser(req);
    const rows = await getDb().select().from(schema.aiConversations).where(eq(schema.aiConversations.userId, me.id)).orderBy(desc(schema.aiConversations.updatedAt)).limit(50);
    return { available: aiAvailable(), conversations: rows.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() })) };
  });

  app.get('/api/assistant/conversations/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    const db = getDb();
    const [c] = await db.select().from(schema.aiConversations).where(and(eq(schema.aiConversations.id, id), eq(schema.aiConversations.userId, me.id)));
    if (!c) throw notFound('Conversation');
    const msgs = await db.select().from(schema.aiMessages).where(eq(schema.aiMessages.conversationId, id)).orderBy(asc(schema.aiMessages.id));
    return { conversation: { id: c.id, title: c.title }, messages: msgs.map((m) => ({ id: m.id, role: m.role, text: m.content.text, toolsUsed: m.content.toolsUsed ?? [], createdAt: m.createdAt.toISOString() })) };
  });

  app.delete('/api/assistant/conversations/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getDb().delete(schema.aiConversations).where(and(eq(schema.aiConversations.id, id), eq(schema.aiConversations.userId, me.id)));
    return { ok: true };
  });

  app.post('/api/assistant/messages', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (req) => {
    const me = requireUser(req);
    if (!aiAvailable()) throw new AppError('not_configured', 'The assistant needs an AI provider. Ask your administrator to set ANTHROPIC_API_KEY.');
    const body = parse(
      z.object({
        conversationId: z.string().uuid().nullable(),
        message: z.string().trim().min(1).max(4_000),
        context: z.object({ propertyId: z.string().uuid().optional(), analysisId: z.string().uuid().optional(), briefId: z.string().uuid().optional() }).optional(),
      }),
      req.body,
    );
    const db = getDb();
    let conversationId = body.conversationId;
    let history: Anthropic.Beta.BetaMessageParam[] = [];
    if (conversationId) {
      const [c] = await db.select().from(schema.aiConversations).where(and(eq(schema.aiConversations.id, conversationId), eq(schema.aiConversations.userId, me.id)));
      if (!c) throw notFound('Conversation');
      const msgs = await db.select().from(schema.aiMessages).where(eq(schema.aiMessages.conversationId, conversationId)).orderBy(asc(schema.aiMessages.id));
      history = msgs.flatMap((m) => (m.apiContent as Anthropic.Beta.BetaMessageParam[] | null) ?? []);
    }
    const ctx = body.context && Object.keys(body.context).length ? `The user is currently viewing: ${JSON.stringify(body.context)}` : null;
    const result = await runAssistantTurn(me.id, history, body.message, ctx);
    if (!conversationId) {
      const [c] = await db.insert(schema.aiConversations).values({ userId: me.id, title: body.message.slice(0, 80) }).returning();
      conversationId = c!.id;
    }
    await db.insert(schema.aiMessages).values([
      { conversationId, role: 'user', content: { text: body.message, context: body.context ?? null }, apiContent: [] },
      { conversationId, role: 'assistant', content: { text: result.text, toolsUsed: result.toolsUsed }, apiContent: result.apiMessages },
    ]);
    await db.update(schema.aiConversations).set({ updatedAt: new Date() }).where(eq(schema.aiConversations.id, conversationId));
    return { conversationId, reply: { text: result.text, toolsUsed: result.toolsUsed } };
  });
}
