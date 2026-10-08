/**
 * Server-side sessions. The browser holds an opaque random token in an httpOnly cookie; the database stores
 * only its SHA-256 hash, so a database leak does not expose usable session tokens.
 */
import { and, eq, gt, lt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';
import { getDb, schema } from '../db/client';
import { AppError } from '../lib/errors';
import { randomToken, sha256 } from './password';

export const SESSION_COOKIE = 'valora_session';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
}

export async function createSession(userId: string, reply: FastifyReply, userAgent?: string) {
  const token = randomToken();
  const ttlDays = config().SESSION_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
  await getDb()
    .insert(schema.sessions)
    .values({ tokenHash: sha256(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) ?? null });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config().isProduction,
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[SESSION_COOKIE];
  if (token)
    await getDb()
      .delete(schema.sessions)
      .where(eq(schema.sessions.tokenHash, sha256(token)));
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function destroyAllSessions(userId: string) {
  await getDb().delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

export async function resolveSession(request: FastifyRequest): Promise<SessionUser | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token || token.length > 200) return null;
  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
      lastSeenAt: schema.sessions.lastSeenAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > 15 * 60_000) {
    await db
      .update(schema.sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(schema.sessions.tokenHash, sha256(token)));
  }
  return { id: row.id, email: row.email, displayName: row.displayName };
}

export async function purgeExpiredSessions() {
  await getDb().delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
}

export function requireUser(request: FastifyRequest): SessionUser {
  if (!request.user) throw new AppError('unauthenticated', 'Please sign in to continue.');
  return request.user;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}
