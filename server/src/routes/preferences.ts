import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PreferencesSchema, type Preferences } from '../../../shared/api';
import { requireUser } from '../auth/sessions';
import { getDb, schema } from '../db/client';
import { parse } from '../lib/validate';
import { AppError } from '../lib/errors';

export async function getPreferences(userId: string): Promise<Preferences> {
  const db = getDb();
  let [row] = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, userId));
  if (!row) [row] = await db.insert(schema.userPreferences).values({ userId }).returning();
  const r = row!;
  return {
    locations: r.locations,
    budgetMin: r.budgetMin,
    budgetMax: r.budgetMax,
    propertyTypes: r.propertyTypes as Preferences['propertyTypes'],
    objective: r.objective as Preferences['objective'],
    renovationAppetite: r.renovationAppetite as Preferences['renovationAppetite'],
    riskTolerance: r.riskTolerance as Preferences['riskTolerance'],
    buyerType: r.buyerType as Preferences['buyerType'],
    cashPurchase: r.cashPurchase,
    depositPct: r.depositPct,
    interestRatePct: r.interestRatePct,
    termYears: r.termYears,
    interestOnly: r.interestOnly,
    targetGrossYieldPct: r.targetGrossYieldPct,
    targetMonthlyCashFlow: r.targetMonthlyCashFlow,
    emailAlerts: r.emailAlerts,
  };
}

export async function preferencesRoutes(app: FastifyInstance) {
  app.get('/api/preferences', async (req) => {
    const me = requireUser(req);
    const [row] = await getDb()
      .select({ done: schema.userPreferences.onboardingCompletedAt })
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, me.id));
    return { preferences: await getPreferences(me.id), onboardingCompleted: Boolean(row?.done) };
  });

  app.put('/api/preferences', async (req) => {
    const me = requireUser(req);
    const body = parse(PreferencesSchema.extend({ completeOnboarding: z.boolean().optional() }), req.body);
    const { completeOnboarding, ...prefs } = body;
    if (prefs.budgetMin != null && prefs.budgetMax != null && prefs.budgetMin > prefs.budgetMax) {
      throw new AppError('validation_failed', 'Minimum budget exceeds maximum budget.', [
        { path: 'budgetMin', message: 'Minimum budget exceeds maximum budget' },
      ]);
    }
    await getPreferences(me.id);
    await getDb()
      .update(schema.userPreferences)
      .set({
        ...prefs,
        updatedAt: new Date(),
        ...(completeOnboarding ? { onboardingCompletedAt: new Date() } : {}),
      })
      .where(eq(schema.userPreferences.userId, me.id));
    return { preferences: await getPreferences(me.id) };
  });

  /** Skip onboarding without saving any preferences. */
  app.post('/api/preferences/skip-onboarding', async (req) => {
    const me = requireUser(req);
    await getPreferences(me.id);
    await getDb()
      .update(schema.userPreferences)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(schema.userPreferences.userId, me.id));
    return { ok: true };
  });
}
