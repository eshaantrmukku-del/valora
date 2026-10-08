import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/sessions';
import { getDb, schema } from '../db/client';
import { summarisePortfolio } from './portfolio';

/** Overview: every figure is derived from the user's persisted records. */
export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/api/dashboard', async (req) => {
    const me = requireUser(req);
    const db = getDb();
    const count = (
      table: typeof schema.savedProperties | typeof schema.investmentBriefs | typeof schema.analyses,
    ) =>
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(table)
        .where(eq(table.userId, me.id))
        .then((r) => r[0]?.n ?? 0);
    const [savedCount, briefCount, analysisCount] = await Promise.all([
      count(schema.savedProperties),
      count(schema.investmentBriefs),
      count(schema.analyses),
    ]);
    const briefs = await db
      .select()
      .from(schema.investmentBriefs)
      .where(eq(schema.investmentBriefs.userId, me.id))
      .orderBy(desc(schema.investmentBriefs.updatedAt))
      .limit(5);
    const analyses = await db
      .select()
      .from(schema.analyses)
      .where(eq(schema.analyses.userId, me.id))
      .orderBy(desc(schema.analyses.createdAt))
      .limit(5);
    const runs = await db
      .select()
      .from(schema.searchRuns)
      .where(eq(schema.searchRuns.userId, me.id))
      .orderBy(desc(schema.searchRuns.createdAt))
      .limit(5);
    const notes = await db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, me.id), isNull(schema.notifications.readAt)))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(5);
    const assets = await db
      .select()
      .from(schema.portfolioAssets)
      .where(eq(schema.portfolioAssets.userId, me.id));
    const txs = await db
      .select()
      .from(schema.portfolioTransactions)
      .where(eq(schema.portfolioTransactions.userId, me.id));
    const [newMatches] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.searchResults)
      .where(
        and(
          eq(schema.searchResults.userId, me.id),
          eq(schema.searchResults.isNew, true),
          isNull(schema.searchResults.dismissedAt),
          sql`${schema.searchResults.createdAt} > now() - interval '7 days'`,
        ),
      );
    return {
      counts: {
        saved: savedCount,
        briefs: briefCount,
        analyses: analysisCount,
        newMatches7d: newMatches?.n ?? 0,
      },
      briefs: briefs.map((b) => ({
        id: b.id,
        name: b.name,
        objective: b.criteria.objective,
        status: b.status,
        updatedAt: b.updatedAt.toISOString(),
      })),
      recentAnalyses: analyses.map((a) => ({
        id: a.id,
        propertyId: a.propertyId,
        address: a.factsSnapshot.address ?? a.factsSnapshot.postcode,
        briefName: a.briefName,
        matchScore: a.ranking.matchScore,
        createdAt: a.createdAt.toISOString(),
      })),
      recentSearches: runs.map((r) => ({
        id: r.id,
        briefName: r.briefName,
        status: r.status,
        resultCount: r.resultCount,
        createdAt: r.createdAt.toISOString(),
      })),
      alerts: notes.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        link: n.link,
        createdAt: n.createdAt.toISOString(),
      })),
      portfolio: assets.length ? summarisePortfolio(assets, txs) : null,
    };
  });
}
