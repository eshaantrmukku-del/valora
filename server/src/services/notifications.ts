import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db/client';
import { enqueue } from '../jobs/queue';
import { getPreferences } from '../routes/preferences';
import { isEmailConfigured, sendEmail } from './email';
import { config } from '../config';

/** Create an in-app notification (idempotent per dedupe key) and queue email delivery if the user opted in. */
export async function notify(
  userId: string,
  n: { type: string; title: string; body: string; link?: string | null; dedupeKey: string },
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .insert(schema.notifications)
    .values({
      userId,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link ?? null,
      dedupeKey: n.dedupeKey,
    })
    .onConflictDoNothing()
    .returning({ id: schema.notifications.id });
  if (!row) return null;
  const prefs = await getPreferences(userId);
  if (prefs.emailAlerts) {
    if (isEmailConfigured()) {
      const [d] = await db
        .insert(schema.notificationDeliveries)
        .values({ notificationId: row.id, channel: 'email', status: 'pending' })
        .returning();
      await enqueue(
        'notification.email',
        { deliveryId: d!.id },
        { dedupeKey: `email:${d!.id}`, maxAttempts: 4 },
      );
    } else {
      await db.insert(schema.notificationDeliveries).values({
        notificationId: row.id,
        channel: 'email',
        status: 'not_configured',
        lastError: 'Email provider not configured',
      });
    }
  }
  return row.id;
}

export async function deliverEmail(deliveryId: string) {
  const db = getDb();
  const [d] = await db
    .select({ delivery: schema.notificationDeliveries, n: schema.notifications, email: schema.users.email })
    .from(schema.notificationDeliveries)
    .innerJoin(
      schema.notifications,
      eq(schema.notifications.id, schema.notificationDeliveries.notificationId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.notifications.userId))
    .where(eq(schema.notificationDeliveries.id, deliveryId));
  if (!d || d.delivery.status === 'sent') return;
  try {
    await sendEmail({
      to: d.email,
      subject: `Valora: ${d.n.title}`,
      text: `${d.n.body}\n\n${d.n.link ? `${config().APP_URL}${d.n.link}` : config().APP_URL}\n\nYou can turn off email alerts in Valora settings.`,
    });
    await db
      .update(schema.notificationDeliveries)
      .set({ status: 'sent', sentAt: new Date(), attempts: d.delivery.attempts + 1 })
      .where(eq(schema.notificationDeliveries.id, deliveryId));
  } catch (e) {
    await db
      .update(schema.notificationDeliveries)
      .set({
        status: 'failed',
        attempts: d.delivery.attempts + 1,
        lastError: (e as Error).message.slice(0, 500),
      })
      .where(eq(schema.notificationDeliveries.id, deliveryId));
    throw e;
  }
}
