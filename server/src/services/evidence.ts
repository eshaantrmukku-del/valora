/**
 * Evidence gathering for a property: geography, sold comparables, rental evidence, planning designations
 * and EPC data. Every source is optional; failures are recorded in `unavailable` rather than hidden, and
 * nothing is invented to fill gaps.
 */
import { desc, eq } from 'drizzle-orm';
import {
  emptyEvidence,
  type EvidenceBundle,
  type FactOrigins,
  type PropertyFacts,
} from '../../../shared/property';
import { getDb, schema } from '../db/client';
import { fetchEpcForPostcode, matchEpc } from '../providers/epc';
import { fixtureRentalEvidence, fixtureSoldEvidence, fixturesEnabled } from '../providers/fixtures';
import { fetchSoldEvidence } from '../providers/landRegistry';
import { fetchPlanningConstraints } from '../providers/planningData';
import { geocode } from '../providers/postcodes';
import { fetchRentalEvidence } from '../providers/propertyData';
import { config } from '../config';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'unknown error');

export interface EnrichedProperty {
  facts: PropertyFacts;
  origins: FactOrigins;
  evidence: EvidenceBundle;
}

/** Fill missing geography (country, district, coordinates) from postcodes.io. Never overwrites existing values. */
export async function enrichGeography(
  facts: PropertyFacts,
  origins: FactOrigins,
  unavailable: EvidenceBundle['unavailable'],
) {
  const f = { ...facts };
  const o = { ...origins };
  const isFixture = fixturesEnabled() && f.outcode === 'ZZ99';
  if (isFixture) return { facts: f, origins: o };
  const query = f.postcode ?? f.outcode;
  if (!query) return { facts: f, origins: o };
  if (f.country && f.district && f.latitude != null) return { facts: f, origins: o };
  try {
    const g = await geocode(query);
    if (!g) {
      unavailable.push({ source: 'postcodes.io', reason: `Postcode ${query} was not recognised.` });
      return { facts: f, origins: o };
    }
    const origin = {
      source: 'official_dataset' as const,
      label: 'postcodes.io (ONS/OS open data)',
      url: 'https://postcodes.io',
      retrievedAt: new Date().toISOString(),
    };
    const set = <K extends keyof PropertyFacts>(k: K, v: PropertyFacts[K]) => {
      if (f[k] == null && v != null) {
        f[k] = v;
        o[k] = origin;
      }
    };
    set('country', g.country);
    set('district', g.district);
    set('outcode', g.outcode);
    set('latitude', g.latitude);
    set('longitude', g.longitude);
  } catch (e) {
    unavailable.push({ source: 'postcodes.io', reason: errMsg(e) });
  }
  return { facts: f, origins: o };
}

export async function gatherEvidence(facts: PropertyFacts, origins: FactOrigins): Promise<EnrichedProperty> {
  const evidence = emptyEvidence();
  const geo = await enrichGeography(facts, origins, evidence.unavailable);
  const f = geo.facts;
  const o = geo.origins;
  const isFixture = fixturesEnabled() && f.outcode === 'ZZ99';

  const tasks: Promise<void>[] = [];

  // Sold comparables
  tasks.push(
    (async () => {
      if (isFixture) {
        evidence.sold = fixtureSoldEvidence();
        return;
      }
      if (!config().ENABLE_LAND_REGISTRY) {
        evidence.unavailable.push({ source: 'HM Land Registry', reason: 'Disabled in configuration.' });
        return;
      }
      if (f.country && !/england|wales/i.test(f.country)) {
        evidence.unavailable.push({
          source: 'HM Land Registry',
          reason: `Price Paid Data does not cover ${f.country}.`,
        });
        return;
      }
      if (!f.district) {
        evidence.unavailable.push({
          source: 'HM Land Registry',
          reason: 'Local authority unknown (needs a valid postcode).',
        });
        return;
      }
      try {
        evidence.sold = await fetchSoldEvidence({ district: f.district, propertyType: f.propertyType });
      } catch (e) {
        evidence.unavailable.push({ source: 'HM Land Registry', reason: errMsg(e) });
      }
    })(),
  );

  // Rental evidence
  tasks.push(
    (async () => {
      if (isFixture) {
        evidence.rental = fixtureRentalEvidence(f.bedrooms);
        return;
      }
      if (!config().PROPERTYDATA_API_KEY) {
        evidence.unavailable.push({
          source: 'Rental evidence',
          reason: 'No rental data provider configured (PropertyData API key).',
        });
        return;
      }
      const pc = f.postcode ?? f.outcode;
      if (!pc) {
        evidence.unavailable.push({ source: 'Rental evidence', reason: 'Postcode unknown.' });
        return;
      }
      try {
        evidence.rental = await fetchRentalEvidence({
          postcode: pc,
          bedrooms: f.bedrooms,
          propertyType: f.propertyType,
        });
        if (!evidence.rental)
          evidence.unavailable.push({
            source: 'PropertyData rents',
            reason: 'No rental data returned for this area.',
          });
      } catch (e) {
        evidence.unavailable.push({ source: 'PropertyData rents', reason: errMsg(e) });
      }
    })(),
  );

  // Planning designations
  tasks.push(
    (async () => {
      if (isFixture) {
        evidence.planningConstraints = [];
        return;
      }
      if (f.latitude == null || f.longitude == null) {
        evidence.unavailable.push({
          source: 'planning.data.gov.uk',
          reason: 'Location coordinates unknown.',
        });
        return;
      }
      if (f.country && !/england/i.test(f.country)) {
        evidence.unavailable.push({ source: 'planning.data.gov.uk', reason: 'Covers England only.' });
        return;
      }
      try {
        evidence.planningConstraints = await fetchPlanningConstraints(f.latitude, f.longitude);
      } catch (e) {
        evidence.unavailable.push({ source: 'planning.data.gov.uk', reason: errMsg(e) });
      }
    })(),
  );

  // EPC (only fills gaps: rating and floor area)
  tasks.push(
    (async () => {
      if (isFixture || !f.postcode || (f.epcRating && f.floorAreaSqm != null)) return;
      if (!config().EPC_API_KEY) return;
      try {
        const records = await fetchEpcForPostcode(f.postcode);
        const match = records ? matchEpc(records, f.address) : null;
        if (!match) return;
        const origin = {
          source: 'official_dataset' as const,
          label: `EPC certificate (${match.lodgementDate ?? 'date unknown'}) matched by address`,
          url: 'https://epc.opendatacommunities.org',
          retrievedAt: new Date().toISOString(),
        };
        if (!f.epcRating && match.rating) {
          f.epcRating = match.rating;
          o.epcRating = origin;
        }
        if (f.floorAreaSqm == null && match.floorAreaSqm != null) {
          f.floorAreaSqm = match.floorAreaSqm;
          o.floorAreaSqm = origin;
        }
      } catch (e) {
        evidence.unavailable.push({ source: 'EPC register', reason: errMsg(e) });
      }
    })(),
  );

  await Promise.all(tasks);
  return { facts: f, origins: o, evidence };
}

/** Gather evidence for a stored property, persist it, and update geography facts on the record. */
export async function refreshPropertyEvidence(
  propertyId: string,
  facts: PropertyFacts,
  origins: FactOrigins,
): Promise<EnrichedProperty> {
  const enriched = await gatherEvidence(facts, origins);
  const db = getDb();
  await db.insert(schema.propertyEvidence).values({ propertyId, bundle: enriched.evidence });
  await db
    .update(schema.properties)
    .set({ facts: enriched.facts, factOrigins: enriched.origins, updatedAt: new Date() })
    .where(eq(schema.properties.id, propertyId));
  return enriched;
}

export async function latestEvidence(
  propertyId: string,
  maxAgeHours = 24 * 7,
): Promise<EvidenceBundle | null> {
  const [row] = await getDb()
    .select()
    .from(schema.propertyEvidence)
    .where(eq(schema.propertyEvidence.propertyId, propertyId))
    .orderBy(desc(schema.propertyEvidence.retrievedAt))
    .limit(1);
  if (!row) return null;
  if (Date.now() - row.retrievedAt.getTime() > maxAgeHours * 3_600_000) return null;
  return row.bundle;
}
