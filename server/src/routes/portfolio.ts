/**
 * Portfolio: owned properties with user-recorded figures. Summaries are computed from persisted records on
 * every request. Valuations always carry their source and date; an asking price is never used as a valuation.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth/sessions';
import { getDb, schema } from '../db/client';
import { audit } from '../lib/audit';
import { AppError, notFound } from '../lib/errors';
import { IdParam, parse } from '../lib/validate';
import { getAccessibleProperty } from '../services/properties';

const money = z.number().min(0).max(100_000_000).nullable();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .nullable();

const AssetSchema = z.object({
  propertyId: z.string().uuid().nullable().optional(),
  label: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).nullable(),
  postcode: z.string().trim().max(10).nullable(),
  purchasePrice: money,
  purchaseDate: isoDate,
  ownershipPct: z.number().min(0.01).max(100),
  mortgageBalance: money,
  interestRatePct: z.number().min(0).max(25).nullable(),
  interestOnly: z.boolean(),
  monthlyMortgagePayment: money,
  monthlyRent: money,
  monthlyOperatingCosts: money,
  currentValuation: money,
  valuationSource: z
    .enum(['purchase_price', 'surveyor', 'agent_estimate', 'automated_estimate', 'own_estimate'])
    .nullable(),
  valuationDate: isoDate,
  notes: z.string().max(5_000).nullable(),
});

const TxSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['income', 'operating_expense', 'capital_expenditure', 'mortgage_payment', 'other']),
  amount: z.number().min(0).max(10_000_000),
  description: z.string().max(500).nullable(),
});

type Asset = typeof schema.portfolioAssets.$inferSelect;

export function summarisePortfolio(
  assets: Asset[],
  txs: (typeof schema.portfolioTransactions.$inferSelect)[],
) {
  const share = (a: Asset) => a.ownershipPct / 100;
  let valuation = 0;
  let valuedCount = 0;
  let debt = 0;
  let cost = 0;
  let monthlyRent = 0;
  let monthlyCosts = 0;
  let monthlyMortgage = 0;
  const missing: string[] = [];
  for (const a of assets) {
    if (a.currentValuation != null) {
      valuation += a.currentValuation * share(a);
      valuedCount++;
    } else missing.push(`${a.label}: no current valuation`);
    debt += (a.mortgageBalance ?? 0) * share(a);
    if (a.purchasePrice != null) cost += a.purchasePrice * share(a);
    monthlyRent += (a.monthlyRent ?? 0) * share(a);
    monthlyCosts += (a.monthlyOperatingCosts ?? 0) * share(a);
    if (a.monthlyMortgagePayment != null) monthlyMortgage += a.monthlyMortgagePayment * share(a);
    else if (a.mortgageBalance && a.interestRatePct != null && a.interestOnly)
      monthlyMortgage += ((a.mortgageBalance * a.interestRatePct) / 100 / 12) * share(a);
    else if (a.mortgageBalance) missing.push(`${a.label}: mortgage payment unknown`);
  }
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const recent = txs.filter((t) => t.date >= yearAgo);
  const sum = (type: string) => recent.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  const round = (x: number) => Math.round(x * 100) / 100;
  return {
    assetCount: assets.length,
    totalValuation: valuedCount ? round(valuation) : null,
    valuationCoverage: `${valuedCount} of ${assets.length} valued`,
    totalDebt: round(debt),
    equity: valuedCount === assets.length && assets.length ? round(valuation - debt) : null,
    loanToValuePct: valuedCount === assets.length && valuation > 0 ? round((debt / valuation) * 100) : null,
    totalPurchaseCost: round(cost),
    monthlyRent: round(monthlyRent),
    monthlyOperatingCosts: round(monthlyCosts),
    monthlyMortgage: round(monthlyMortgage),
    monthlyNetCashFlow: round(monthlyRent - monthlyCosts - monthlyMortgage),
    last12Months: {
      income: round(sum('income')),
      operatingExpenses: round(sum('operating_expense')),
      capitalExpenditure: round(sum('capital_expenditure')),
      mortgagePayments: round(sum('mortgage_payment')),
    },
    missing,
    note: 'Totals reflect your ownership share. Valuations are as recorded by you with their stated source; they are not appraisals.',
  };
}

async function getOwnedAsset(userId: string, id: string) {
  const [a] = await getDb()
    .select()
    .from(schema.portfolioAssets)
    .where(and(eq(schema.portfolioAssets.id, id), eq(schema.portfolioAssets.userId, userId)));
  if (!a) throw notFound('Portfolio property');
  return a;
}

export async function portfolioRoutes(app: FastifyInstance) {
  app.get('/api/portfolio', async (req) => {
    const me = requireUser(req);
    const db = getDb();
    const assets = await db
      .select()
      .from(schema.portfolioAssets)
      .where(eq(schema.portfolioAssets.userId, me.id))
      .orderBy(desc(schema.portfolioAssets.createdAt));
    const txs = await db
      .select()
      .from(schema.portfolioTransactions)
      .where(eq(schema.portfolioTransactions.userId, me.id))
      .orderBy(desc(schema.portfolioTransactions.date));
    return {
      summary: summarisePortfolio(assets, txs),
      assets: assets.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        transactions: txs
          .filter((t) => t.assetId === a.id)
          .map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })),
      })),
    };
  });

  app.post('/api/portfolio', async (req) => {
    const me = requireUser(req);
    const body = parse(AssetSchema, req.body);
    if (body.propertyId) await getAccessibleProperty(me.id, body.propertyId);
    if (body.currentValuation != null && (!body.valuationSource || !body.valuationDate))
      throw new AppError('validation_failed', 'Add the source and date of the valuation.', [
        { path: 'valuationSource', message: 'Required with a valuation' },
      ]);
    const [a] = await getDb()
      .insert(schema.portfolioAssets)
      .values({ ...body, propertyId: body.propertyId ?? null, userId: me.id })
      .returning();
    await audit(me.id, 'portfolio.create', { type: 'portfolio_asset', id: a!.id });
    return { asset: { id: a!.id } };
  });

  app.put('/api/portfolio/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getOwnedAsset(me.id, id);
    const body = parse(AssetSchema, req.body);
    if (body.propertyId) await getAccessibleProperty(me.id, body.propertyId);
    if (body.currentValuation != null && (!body.valuationSource || !body.valuationDate))
      throw new AppError('validation_failed', 'Add the source and date of the valuation.', [
        { path: 'valuationSource', message: 'Required with a valuation' },
      ]);
    await getDb()
      .update(schema.portfolioAssets)
      .set({ ...body, propertyId: body.propertyId ?? null, updatedAt: new Date() })
      .where(eq(schema.portfolioAssets.id, id));
    return { ok: true };
  });

  app.delete('/api/portfolio/:id', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getOwnedAsset(me.id, id);
    await getDb().delete(schema.portfolioAssets).where(eq(schema.portfolioAssets.id, id));
    await audit(me.id, 'portfolio.delete', { type: 'portfolio_asset', id });
    return { ok: true };
  });

  app.post('/api/portfolio/:id/transactions', async (req) => {
    const me = requireUser(req);
    const { id } = parse(IdParam, req.params);
    await getOwnedAsset(me.id, id);
    const body = parse(TxSchema, req.body);
    const [t] = await getDb()
      .insert(schema.portfolioTransactions)
      .values({ ...body, assetId: id, userId: me.id })
      .returning();
    return { transaction: { id: t!.id } };
  });

  app.delete('/api/portfolio/:id/transactions/:txId', async (req) => {
    const me = requireUser(req);
    const { id, txId } = parse(z.object({ id: z.string().uuid(), txId: z.string().uuid() }), req.params);
    await getOwnedAsset(me.id, id);
    await getDb()
      .delete(schema.portfolioTransactions)
      .where(
        and(
          eq(schema.portfolioTransactions.id, txId),
          eq(schema.portfolioTransactions.assetId, id),
          eq(schema.portfolioTransactions.userId, me.id),
        ),
      );
    return { ok: true };
  });
}
