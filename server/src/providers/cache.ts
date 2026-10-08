import { and, eq, gt, lt } from 'drizzle-orm';
import { getDb, schema } from '../db/client';

/** Read-through cache for provider responses, stored in Postgres so it survives restarts and is shared by workers. */
export async function cached<T>(
  provider: string,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const db = getDb();
  const fullKey = `${provider}:${key}`;
  const [hit] = await db
    .select({ value: schema.providerCache.value })
    .from(schema.providerCache)
    .where(and(eq(schema.providerCache.key, fullKey), gt(schema.providerCache.expiresAt, new Date())));
  if (hit) return (hit.value as { v: T }).v;
  const value = await load();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await db
    .insert(schema.providerCache)
    .values({ key: fullKey, provider, value: { v: value }, expiresAt, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.providerCache.key,
      set: { value: { v: value }, expiresAt, fetchedAt: new Date() },
    });
  return value;
}

export async function purgeExpiredCache() {
  await getDb().delete(schema.providerCache).where(lt(schema.providerCache.expiresAt, new Date()));
}
