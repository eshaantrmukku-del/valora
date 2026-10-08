/**
 * Area report from real data only: postcodes.io geography, HM Land Registry sold prices, PropertyData asking
 * rents (if configured) and planning.data.gov.uk designations. No regional "benchmark" figures, no scores
 * invented from averages. Every section says when its source is unavailable.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PlanningConstraint, RentalEvidence, SoldEvidence } from '../../../shared/property';
import { requireUser } from '../auth/sessions';
import { config } from '../config';
import { median, quantile } from '../domain/comparables';
import { AppError } from '../lib/errors';
import { parse } from '../lib/validate';
import { fixtureGeocode, fixtureRentalEvidence, fixtureSoldEvidence } from '../providers/fixtures';
import { fetchSoldEvidence } from '../providers/landRegistry';
import { fetchPlanningConstraints } from '../providers/planningData';
import { geocode } from '../providers/postcodes';
import { fetchRentalEvidence } from '../providers/propertyData';

export function summariseSold(sold: SoldEvidence, outcode: string | null) {
  const comps = sold.comparables;
  const local = outcode ? comps.filter((c) => c.postcode?.toUpperCase().startsWith(`${outcode.toUpperCase()} `)) : [];
  const pool = local.length >= 10 ? local : comps;
  const byType = new Map<string, number[]>();
  for (const c of pool) {
    const k = c.propertyType ?? 'unknown';
    byType.set(k, [...(byType.get(k) ?? []), c.price]);
  }
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const iso = cutoff.toISOString().slice(0, 10);
  const recent = pool.filter((c) => c.date >= iso).map((c) => c.price);
  const prior = pool.filter((c) => c.date < iso).map((c) => c.price);
  const recentMedian = median(recent);
  const priorMedian = median(prior);
  return {
    scope: pool === local ? `${outcode} postcode district` : sold.scope,
    count: pool.length,
    median: median(pool.map((c) => c.price)),
    lowerQuartile: quantile(pool.map((c) => c.price), 0.25),
    upperQuartile: quantile(pool.map((c) => c.price), 0.75),
    byType: [...byType.entries()].map(([type, prices]) => ({ type, count: prices.length, median: median(prices) })).sort((a, b) => b.count - a.count),
    medianChange12m:
      recent.length >= 10 && prior.length >= 10 && recentMedian && priorMedian
        ? { recentMedian, priorMedian, changePct: Math.round(((recentMedian - priorMedian) / priorMedian) * 1000) / 10, recentCount: recent.length, priorCount: prior.length }
        : null,
    newestSale: pool.map((c) => c.date).sort().at(-1) ?? null,
    caveat: 'Median of recorded sales; the mix of property types and sizes changes between periods, so changes are not a house-price index.',
  };
}

export async function areaRoutes(app: FastifyInstance) {
  app.get('/api/area', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    requireUser(req);
    const { q } = parse(z.object({ q: z.string().trim().min(2).max(60) }), req.query);
    const unavailable: { source: string; reason: string }[] = [];
    const fixture = fixtureGeocode(q);
    let geo = fixture;
    if (!geo) {
      try {
        geo = await geocode(q);
      } catch (e) {
        throw new AppError('upstream_failed', `Location lookup failed: ${(e as Error).message}`);
      }
    }
    if (!geo) throw new AppError('not_found', `Couldn’t find “${q}”. Try a postcode district like M20 or a town name.`);

    let sold: SoldEvidence | null = null;
    let rental: RentalEvidence | null = null;
    let planning: PlanningConstraint[] | null = null;

    if (fixture) {
      sold = fixtureSoldEvidence();
      rental = fixtureRentalEvidence(null);
      planning = [];
    } else {
      await Promise.all([
        (async () => {
          if (!geo.district) return unavailable.push({ source: 'HM Land Registry', reason: 'Local authority unknown' });
          if (geo.country && !/england|wales/i.test(geo.country)) return unavailable.push({ source: 'HM Land Registry', reason: `Not available for ${geo.country}` });
          try {
            sold = await fetchSoldEvidence({ district: geo.district, propertyType: null });
          } catch (e) {
            unavailable.push({ source: 'HM Land Registry', reason: (e as Error).message });
          }
        })(),
        (async () => {
          if (!config().PROPERTYDATA_API_KEY) return unavailable.push({ source: 'Rental evidence', reason: 'No rental data provider configured' });
          const pc = geo.postcode ?? geo.outcode;
          if (!pc) return unavailable.push({ source: 'Rental evidence', reason: 'No postcode for this place' });
          try {
            rental = await fetchRentalEvidence({ postcode: pc, bedrooms: null, propertyType: null });
          } catch (e) {
            unavailable.push({ source: 'PropertyData rents', reason: (e as Error).message });
          }
        })(),
        (async () => {
          if (geo.country && !/england/i.test(geo.country)) return unavailable.push({ source: 'planning.data.gov.uk', reason: 'England only' });
          try {
            planning = await fetchPlanningConstraints(geo.latitude, geo.longitude);
          } catch (e) {
            unavailable.push({ source: 'planning.data.gov.uk', reason: (e as Error).message });
          }
        })(),
      ]);
    }

    const soldSummary = sold ? summariseSold(sold, geo.outcode) : null;
    const s = sold as SoldEvidence | null;
    return {
      query: q,
      place: { label: geo.label, postcode: geo.postcode, outcode: geo.outcode, district: geo.district, country: geo.country, kind: geo.kind, latitude: geo.latitude, longitude: geo.longitude },
      sold: soldSummary ? { ...soldSummary, source: s!.source, sourceUrl: s!.sourceUrl, retrievedAt: s!.retrievedAt } : null,
      rental,
      planning,
      planningNote: 'Designations are checked at the centre point of this place only; individual streets may differ.',
      unavailable,
      generatedAt: new Date().toISOString(),
    };
  });
}
