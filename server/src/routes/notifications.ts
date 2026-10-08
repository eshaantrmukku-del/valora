import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/sessions';
import { getDb, schema } from '../db/client';
import { IdParam, parse } from '../lib/validate';

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/api/notifications', async (req) => {
    const me = requireUser(req);
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, me.id))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(50);
    const [{ unread } = { unread: 0 }] = await db
      .select({ unread: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, me.id), isNull(schema.notifications.readAt)));
    return {
      unread,
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  });

  app.post('/api/notifications/:id/read', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getDb()
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, me.id)));
    return { ok: true };
  });

  app.post('/api/notifications/read-all', async (req) => {
    const me = requireUser(req);
    await getDb()
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(eq(schema.notifications.userId, me.id), isNull(schema.notifications.readAt)));
    return { ok: true };
  });
}
