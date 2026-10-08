/**
 * Discover search pipeline (runs as a background job; progress is persisted on the search run).
 *
 *  validate brief → resolve locations → query configured live providers → validate & deduplicate listings
 *  → gather evidence → deterministic ranking → persist results with provenance → notify (monitor runs)
 *
 * A provider failure never produces fabricated results: it is recorded per provider and the run is marked
 * "partial" (some providers succeeded) or "failed" (none did).
 */
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { searchReadiness, type BriefCriteria } from '../../../shared/brief';
import type { PropertyFacts } from '../../../shared/property';
import type { RankingResult } from '../../../shared/ranking';
import { getDb, schema } from '../db/client';
import { rankProperty } from '../domain/ranking';
import { AppError } from '../lib/errors';
import { mapLimit } from '../lib/http';
import { fixtureGeocode } from '../providers/fixtures';
import { geocode } from '../providers/postcodes';
import { configuredListingProviders } from '../providers/registry';
import type { GeoPoint, ListingQuery, ProviderListing } from '../providers/types';
import { enqueue } from '../jobs/queue';
import { getPreferences } from '../routes/preferences';
import { latestEvidence, refreshPropertyEvidence } from './evidence';
import { financingFromPreferences } from './financing';
import { upsertProviderListing } from './properties';
import { recordMonitorMatches } from './monitoring';

type ProviderStatus = (typeof schema.searchRuns.$inferSelect)['providerStatus'][number];

const MAX_RESULTS = 50;
const MAX_CANDIDATES = 120;

export async function createSearchRun(params: {
  userId: string;
  briefId: string | null;
  briefName: string;
  criteria: BriefCriteria;
  trigger: 'manual' | 'monitor';
  idempotencyKey?: string | null;
}) {
  const db = getDb();
  if (params.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(schema.searchRuns)
      .where(and(eq(schema.searchRuns.userId, params.userId), eq(schema.searchRuns.idempotencyKey, params.idempotencyKey)));
    if (existing) return existing;
  }
  const blockers = searchReadiness(params.criteria);
  if (blockers.length) throw new AppError('validation_failed', blockers[0]!, blockers.map((m) => ({ path: 'criteria.location', message: m })));
  const [run] = await db
    .insert(schema.searchRuns)
    .values({
      userId: params.userId,
      briefId: params.briefId,
      briefName: params.briefName,
      criteriaSnapshot: params.criteria,
      trigger: params.trigger,
      idempotencyKey: params.idempotencyKey ?? null,
      stage: 'Queued',
    })
    .returning();
  await enqueue('search.run', { runId: run!.id }, { dedupeKey: `search:${run!.id}`, maxAttempts: 2 });
  return run!;
}

function defaultRadius(g: GeoPoint, criteria: BriefCriteria): number {
  if (criteria.location.radiusMiles) return criteria.location.radiusMiles;
  if (g.kind === 'postcode') return 1;
  if (g.kind === 'outcode') return 2;
  return 4;
}

export function validateListing(l: ProviderListing): string | null {
  if (!l.providerListingId) return 'missing provider listing id';
  if (l.url && !/^https:\/\//.test(l.url)) return 'listing URL is not https';
  if (l.facts.askingPrice != null && (l.facts.askingPrice < 1_000 || l.facts.askingPrice > 100_000_000)) return 'implausible asking price';
  if (l.facts.bedrooms != null && (l.facts.bedrooms < 0 || l.facts.bedrooms > 30)) return 'implausible bedroom count';
  return null;
}

async function setStage(runId: string, stage: string, extra: Partial<typeof schema.searchRuns.$inferInsert> = {}) {
  await getDb().update(schema.searchRuns).set({ stage, ...extra }).where(eq(schema.searchRuns.id, runId));
}

export async function executeSearchRun(runId: string): Promise<void> {
  const db = getDb();
  const [run] = await db.select().from(schema.searchRuns).where(eq(schema.searchRuns.id, runId));
  if (!run) return;
  if (run.status === 'completed' || run.status === 'partial') return; // idempotent re-delivery
  const criteria = run.criteriaSnapshot;
  const statuses: ProviderStatus[] = [];
  await setStage(runId, 'Resolving locations', { status: 'running', startedAt: new Date(), error: null });

  const providers = configuredListingProviders();
  if (!providers.length) {
    await db
      .update(schema.searchRuns)
      .set({
        status: 'failed',
        stage: 'No live listing provider configured',
        error: 'No authorised live listing provider is configured. Add a PropertyData API key (see Settings → Integrations) to search live listings.',
        providerStatus: [{ provider: 'PropertyData', status: 'not_configured', message: 'PROPERTYDATA_API_KEY not set', count: 0 }],
        finishedAt: new Date(),
      })
      .where(eq(schema.searchRuns.id, runId));
    return;
  }

  // 1. Resolve locations
  const centres: GeoPoint[] = [];
  for (const place of [...criteria.location.postcodes, ...criteria.location.areas]) {
    try {
      const g = fixtureGeocode(place) ?? (await geocode(place));
      if (g) centres.push(g);
      else statuses.push({ provider: 'Location lookup', status: 'failed', message: `Could not find “${place}”.`, count: 0 });
    } catch (e) {
      statuses.push({ provider: 'Location lookup', status: 'failed', message: `“${place}”: ${(e as Error).message}`, count: 0 });
    }
  }
  if (!centres.length) {
    await db
      .update(schema.searchRuns)
      .set({ status: 'failed', stage: 'Location not found', error: 'None of the brief’s locations could be resolved. Check the spelling or use a postcode.', providerStatus: statuses, finishedAt: new Date() })
      .where(eq(schema.searchRuns.id, runId));
    return;
  }

  // 2. Query providers (bounded concurrency)
  await setStage(runId, 'Searching live listings', { providerStatus: statuses });
  const jobs = providers.flatMap((p) => centres.map((c) => ({ p, c })));
  const candidates: ProviderListing[] = [];
  const perProvider = new Map<string, { name: string; ok: number; failed: string[]; count: number }>();
  await mapLimit(jobs, 3, async ({ p, c }) => {
    const info = p.info();
    const agg = perProvider.get(info.id) ?? { name: info.name, ok: 0, failed: [], count: 0 };
    perProvider.set(info.id, agg);
    const q: ListingQuery = {
      centre: c,
      radiusMiles: defaultRadius(c, criteria),
      minPrice: criteria.budget.minimum,
      maxPrice: criteria.budget.maximum,
      minBedrooms: criteria.bedrooms.minimum,
      maxBedrooms: criteria.bedrooms.maximum,
      propertyTypes: criteria.propertyTypes,
      objective: criteria.objective,
      limit: 60,
    };
    try {
      const found = await p.search(q);
      agg.ok++;
      for (const l of found) {
        const problem = validateListing(l);
        if (problem) continue;
        candidates.push(l);
        agg.count++;
      }
    } catch (e) {
      agg.failed.push(`${c.label}: ${(e as Error).message}`);
    }
  });
  for (const [, a] of perProvider) {
    statuses.push({
      provider: a.name,
      status: a.ok > 0 ? 'ok' : 'failed',
      message: a.failed.length ? `Errors: ${a.failed.join('; ')}` : `${a.count} listing(s) retrieved`,
      count: a.count,
    });
  }
  const anyProviderOk = [...perProvider.values()].some((a) => a.ok > 0);
  const anyProviderFailed = [...perProvider.values()].some((a) => a.failed.length > 0);
  if (!anyProviderOk) {
    await db
      .update(schema.searchRuns)
      .set({ status: 'failed', stage: 'Providers unavailable', error: 'All listing providers failed. No results were produced. Try again later.', providerStatus: statuses, finishedAt: new Date() })
      .where(eq(schema.searchRuns.id, runId));
    return;
  }

  // 3. Persist and deduplicate
  await setStage(runId, 'Checking listing details', { providerStatus: statuses, candidateCount: candidates.length });
  const byProperty = new Map<string, { listingId: string }>();
  for (const l of candidates.slice(0, MAX_CANDIDATES)) {
    const { propertyId, listingId } = await upsertProviderListing(l);
    if (!byProperty.has(propertyId)) byProperty.set(propertyId, { listingId });
  }
  const dismissed = await db
    .select({ propertyId: schema.dismissedProperties.propertyId })
    .from(schema.dismissedProperties)
    .where(eq(schema.dismissedProperties.userId, run.userId));
  for (const d of dismissed) byProperty.delete(d.propertyId);

  // 4. Evidence + ranking
  await setStage(runId, `Gathering evidence for ${byProperty.size} properties`);
  const prefs = await getPreferences(run.userId);
  const financing = financingFromPreferences(prefs).inputs;
  const ids = [...byProperty.keys()];
  const props = ids.length ? await db.select().from(schema.properties).where(inArray(schema.properties.id, ids)) : [];
  const ranked = await mapLimit(props, 4, async (p) => {
    let evidence = await latestEvidence(p.id);
    let facts: PropertyFacts = p.facts;
    if (!evidence) {
      const enriched = await refreshPropertyEvidence(p.id, p.facts, p.factOrigins);
      evidence = enriched.evidence;
      facts = enriched.facts;
    }
    const ranking = rankProperty({ criteria, facts, evidence, financing });
    return { propertyId: p.id, listingId: byProperty.get(p.id)!.listingId, facts, ranking };
  });

  const eligible = ranked
    .filter((r) => r.ranking.eligible)
    .sort((a, b) => b.ranking.matchScore - a.ranking.matchScore || b.ranking.confidence - a.ranking.confidence)
    .slice(0, MAX_RESULTS);

  // 5. Persist results; mark which ones are new relative to earlier runs of the same brief
  await setStage(runId, 'Saving results');
  let previouslySeen = new Set<string>();
  if (run.briefId) {
    const prev = await db
      .select({ propertyId: schema.searchResults.propertyId })
      .from(schema.searchResults)
      .innerJoin(schema.searchRuns, eq(schema.searchRuns.id, schema.searchResults.searchRunId))
      .where(and(eq(schema.searchRuns.briefId, run.briefId), eq(schema.searchRuns.userId, run.userId), ne(schema.searchRuns.id, runId)));
    previouslySeen = new Set(prev.map((p) => p.propertyId));
  }
  if (eligible.length) {
    await db
      .insert(schema.searchResults)
      .values(
        eligible.map((r, i) => ({
          searchRunId: runId,
          userId: run.userId,
          propertyId: r.propertyId,
          listingId: r.listingId,
          rank: i + 1,
          matchScore: r.ranking.matchScore,
          confidence: r.ranking.confidence,
          ranking: r.ranking as RankingResult,
          factsSnapshot: r.facts,
          isNew: !previouslySeen.has(r.propertyId),
        })),
      )
      .onConflictDoNothing();
  }

  const status = anyProviderFailed || statuses.some((s) => s.status === 'failed') ? 'partial' : 'completed';
  await db
    .update(schema.searchRuns)
    .set({
      status,
      stage: status === 'completed' ? 'Complete' : 'Complete with some sources unavailable',
      resultCount: eligible.length,
      providerStatus: statuses,
      finishedAt: new Date(),
    })
    .where(eq(schema.searchRuns.id, runId));

  if (run.trigger === 'monitor' && run.briefId) {
    await recordMonitorMatches(run.userId, run.briefId, run.briefName, eligible.map((r) => ({ propertyId: r.propertyId, facts: r.facts, matchScore: r.ranking.matchScore })));
  }
}

export async function markRunFailed(runId: string, message: string) {
  await getDb()
    .update(schema.searchRuns)
    .set({ status: 'failed', stage: 'Failed', error: message, finishedAt: new Date() })
    .where(eq(schema.searchRuns.id, runId));
}

export async function latestRunForBrief(userId: string, briefId: string) {
  const [run] = await getDb()
    .select()
    .from(schema.searchRuns)
    .where(and(eq(schema.searchRuns.userId, userId), eq(schema.searchRuns.briefId, briefId)))
    .orderBy(desc(schema.searchRuns.createdAt))
    .limit(1);
  return run ?? null;
}
