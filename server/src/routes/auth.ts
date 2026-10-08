import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, passwordProblems, randomToken, sha256, verifyPassword } from '../auth/password';
import { createSession, destroyAllSessions, destroySession, requireUser } from '../auth/sessions';
import { config } from '../config';
import { getDb, schema } from '../db/client';
import { audit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { parse } from '../lib/validate';
import { isEmailConfigured, sendEmail } from '../services/email';

const Email = z.string().trim().toLowerCase().email().max(254);
const Password = z.string().min(1).max(200);

// A fixed hash used to equalise timing when the account does not exist.
let dummyHash: Promise<string> | null = null;

export async function authRoutes(app: FastifyInstance) {
  const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/api/auth/register', authLimit, async (req, reply) => {
    const body = parse(
      z.object({ email: Email, password: Password, displayName: z.string().trim().max(80).optional() }),
      req.body,
    );
    const problem = passwordProblems(body.password);
    if (problem) throw new AppError('validation_failed', problem, [{ path: 'password', message: problem }]);
    const db = getDb();
    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${body.email}`);
    if (existing.length) throw new AppError('conflict', 'An account with this email already exists.');
    const [user] = await db
      .insert(schema.users)
      .values({
        email: body.email,
        passwordHash: await hashPassword(body.password),
        displayName: body.displayName || null,
      })
      .returning();
    await db.insert(schema.userPreferences).values({ userId: user!.id });
    await createSession(user!.id, reply, req.headers['user-agent']);
    await audit(user!.id, 'account.register');
    return { user: { id: user!.id, email: user!.email, displayName: user!.displayName } };
  });

  app.post('/api/auth/login', authLimit, async (req, reply) => {
    const body = parse(z.object({ email: Email, password: Password }), req.body);
    const [user] = await getDb()
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${body.email}`);
    if (!user) {
      dummyHash ??= hashPassword('timing-equaliser');
      await verifyPassword(body.password, await dummyHash);
      throw new AppError('unauthenticated', 'Email or password is incorrect.');
    }
    if (!(await verifyPassword(body.password, user.passwordHash))) {
      await audit(user.id, 'account.login_failed');
      throw new AppError('unauthenticated', 'Email or password is incorrect.');
    }
    await createSession(user.id, reply, req.headers['user-agent']);
    await audit(user.id, 'account.login');
    return { user: { id: user.id, email: user.email, displayName: user.displayName } };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => {
    if (!req.user) return { user: null };
    const [prefs] = await getDb()
      .select({ onboardingCompletedAt: schema.userPreferences.onboardingCompletedAt })
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, req.user.id));
    return { user: { ...req.user, onboardingCompleted: Boolean(prefs?.onboardingCompletedAt) } };
  });

  app.post('/api/auth/password-reset/request', authLimit, async (req) => {
    const { email } = parse(z.object({ email: Email }), req.body);
    const emailReady = isEmailConfigured();
    const [user] = await getDb()
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${email}`);
    if (user) {
      const token = randomToken();
      await getDb()
        .insert(schema.passwordResetTokens)
        .values({ tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 60 * 60_000) });
      const link = `${config().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
      if (emailReady) {
        try {
          await sendEmail({
            to: user.email,
            subject: 'Reset your Valora password',
            text: `Use this link within one hour to choose a new password:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
          });
        } catch (err) {
          req.log.error({ err: (err as Error).message }, 'password reset email failed');
        }
      } else if (!config().isProduction) {
        // Development only: surface the link in server logs so the flow can be exercised without email.
        req.log.warn({ link }, 'Email not configured — password reset link (development only)');
      }
      await audit(user.id, 'account.password_reset_requested');
    }
    // Same response whether or not the account exists (no account enumeration).
    return { ok: true, emailConfigured: emailReady };
  });

  app.post('/api/auth/password-reset/confirm', authLimit, async (req) => {
    const body = parse(z.object({ token: z.string().min(10).max(200), password: Password }), req.body);
    const problem = passwordProblems(body.password);
    if (problem) throw new AppError('validation_failed', problem, [{ path: 'password', message: problem }]);
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.passwordResetTokens)
      .where(
        and(
          eq(schema.passwordResetTokens.tokenHash, sha256(body.token)),
          gt(schema.passwordResetTokens.expiresAt, new Date()),
          isNull(schema.passwordResetTokens.usedAt),
        ),
      );
    if (!row) throw new AppError('bad_request', 'This reset link is invalid or has expired.');
    await db
      .update(schema.users)
      .set({ passwordHash: await hashPassword(body.password), updatedAt: new Date() })
      .where(eq(schema.users.id, row.userId));
    await db
      .update(schema.passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(schema.passwordResetTokens.tokenHash, row.tokenHash));
    await destroyAllSessions(row.userId);
    await audit(row.userId, 'account.password_reset');
    return { ok: true };
  });

  app.post('/api/auth/change-password', authLimit, async (req, reply) => {
    const me = requireUser(req);
    const body = parse(z.object({ currentPassword: Password, newPassword: Password }), req.body);
    const problem = passwordProblems(body.newPassword);
    if (problem)
      throw new AppError('validation_failed', problem, [{ path: 'newPassword', message: problem }]);
    const [user] = await getDb().select().from(schema.users).where(eq(schema.users.id, me.id));
    if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash)))
      throw new AppError('forbidden', 'Current password is incorrect.');
    await getDb()
      .update(schema.users)
      .set({ passwordHash: await hashPassword(body.newPassword), updatedAt: new Date() })
      .where(eq(schema.users.id, me.id));
    await destroyAllSessions(me.id);
    await createSession(me.id, reply, req.headers['user-agent']);
    await audit(me.id, 'account.password_changed');
    return { ok: true };
  });

  app.patch('/api/account', async (req) => {
    const me = requireUser(req);
    const body = parse(z.object({ displayName: z.string().trim().max(80).nullable() }), req.body);
    await getDb()
      .update(schema.users)
      .set({ displayName: body.displayName || null, updatedAt: new Date() })
      .where(eq(schema.users.id, me.id));
    return { ok: true };
  });

  /**
   * Account deletion: requires the password, then deletes the user row. All private records cascade
   * (briefs, saved properties, analyses, documents, portfolio, conversations, notifications, private properties).
   * Shared provider listing records contain no personal data and are retained.
   */
  app.delete('/api/account', authLimit, async (req, reply) => {
    const me = requireUser(req);
    const body = parse(z.object({ password: Password, confirm: z.literal('DELETE') }), req.body);
    const [user] = await getDb().select().from(schema.users).where(eq(schema.users.id, me.id));
    if (!user || !(await verifyPassword(body.password, user.passwordHash)))
      throw new AppError('forbidden', 'Password is incorrect.');
    await getDb().delete(schema.users).where(eq(schema.users.id, me.id));
    await audit(null, 'account.deleted', { type: 'user', id: me.id });
    reply.clearCookie('valora_session', { path: '/' });
    return { ok: true };
  });
}
