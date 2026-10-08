import { getDb, schema } from '../db/client';

/** Record an important operation. Never include secrets or unnecessary personal data in `meta`. */
export async function audit(
  userId: string | null,
  action: string,
  entity?: { type: string; id: string },
  meta?: Record<string, unknown>,
) {
  await getDb()
    .insert(schema.auditLog)
    .values({ userId, action, entityType: entity?.type ?? null, entityId: entity?.id ?? null, meta: meta ?? null });
}
