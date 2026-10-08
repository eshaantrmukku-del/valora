/**
 * TEST FIXTURES — NOT REAL PROPERTIES.
 *
 * Enabled only with ENABLE_FIXTURE_PROVIDER=true outside production (config refuses it in production).
 * Used by automated integration and end-to-end tests so the full Discover pipeline can be exercised
 * without network access or provider credentials. Every record is visibly labelled as a fixture, uses the
 * fictional town "Testville" and the non-geographic postcode area ZZ99, and has no listing URL.
 */
import type { PropertyType } from '../../../shared/brief';
import type { FactOrigins, PropertyFacts, RentalEvidence, SoldEvidence } from '../../../shared/property';
import { config } from '../config';
import type { GeoPoint, ListingProvider, ListingQuery, ProviderInfo, ProviderListing } from './types';

export const FIXTURE_LABEL = 'Test fixture — not a real listing';

interface Fixture {
  id: string;
  address: string;
  postcode: string;
  type: PropertyType;
  beds: number;
  baths: number;
  price: number;
  sqm: number | null;
  tenure: PropertyFacts['tenure'];
  description: string;
}

const FIXTURES: Fixture[] = [
  {
    id: 'fx-001',
    address: '1 Fixture Lane, Testville',
    postcode: 'ZZ99 1AA',
    type: 'semi_detached',
    beds: 3,
    baths: 1,
    price: 285_000,
    sqm: 92,
    tenure: 'freehold',
    description:
      'TEST FIXTURE. Three bedroom semi-detached house in need of modernisation throughout, set on a generous plot with scope to extend to the rear (STPP). No onward chain.',
  },
  {
    id: 'fx-002',
    address: '14 Sample Road, Testville',
    postcode: 'ZZ99 1AB',
    type: 'detached',
    beds: 4,
    baths: 2,
    price: 465_000,
    sqm: 140,
    tenure: 'freehold',
    description:
      'TEST FIXTURE. Detached family home, recently refurbished throughout and offered in walk-in condition. Large rear garden and driveway parking.',
  },
  {
    id: 'fx-003',
    address: '7 Example Terrace, Testville',
    postcode: 'ZZ99 1AD',
    type: 'terraced',
    beds: 3,
    baths: 1,
    price: 189_000,
    sqm: 78,
    tenure: 'freehold',
    description: 'TEST FIXTURE. Mid-terrace house currently tenanted. Dated kitchen and bathroom. Rear yard.',
  },
  {
    id: 'fx-004',
    address: 'Flat 3, 22 Mock Court, Testville',
    postcode: 'ZZ99 2AA',
    type: 'flat',
    beds: 2,
    baths: 1,
    price: 145_000,
    sqm: 61,
    tenure: 'leasehold',
    description:
      'TEST FIXTURE. Second-floor two bedroom apartment with allocated parking. Service charge applies.',
  },
  {
    id: 'fx-005',
    address: '3 Placeholder Close, Testville',
    postcode: 'ZZ99 2AB',
    type: 'bungalow',
    beds: 3,
    baths: 1,
    price: 320_000,
    sqm: null,
    tenure: 'freehold',
    description:
      'TEST FIXTURE. Detached bungalow requiring full renovation, on a corner plot. Cash buyers only.',
  },
  {
    id: 'fx-006',
    address: '41 Dummy Street, Testville',
    postcode: 'ZZ99 3AA',
    type: 'semi_detached',
    beds: 3,
    baths: 1,
    price: 610_000,
    sqm: 120,
    tenure: 'freehold',
    description: 'TEST FIXTURE. Extended semi-detached house in excellent condition.',
  },
  {
    id: 'fx-007',
    address: '9 Specimen Way, Testville',
    postcode: 'ZZ99 3AB',
    type: 'end_of_terrace',
    beds: 3,
    baths: 1,
    price: 230_000,
    sqm: 85,
    tenure: 'freehold',
    description:
      'TEST FIXTURE. End of terrace house requiring updating, with a good sized garden and potential for a loft conversion.',
  },
  {
    id: 'fx-008',
    address: '2 Unknown Row, Testville',
    postcode: 'ZZ99 3AD',
    type: 'terraced',
    beds: 2,
    baths: 1,
    price: 159_000,
    sqm: null,
    tenure: null,
    description: '',
  },
];

export function fixturesEnabled(): boolean {
  const c = config();
  return c.ENABLE_FIXTURE_PROVIDER && !c.isProduction;
}

export function fixtureInfo(): ProviderInfo {
  return {
    id: 'fixtures',
    name: 'Test fixtures (not real listings)',
    kind: 'test',
    configured: fixturesEnabled(),
    openData: true,
    capabilities: { listingSearch: true, askingPrice: true },
    coverage: 'Fictional town "Testville" (postcode area ZZ99) only.',
    limitations: ['Synthetic data for automated tests. Never enabled in production.'],
    setup: null,
    docsUrl: 'docs/PROVIDERS.md',
    envVars: ['ENABLE_FIXTURE_PROVIDER'],
  };
}

export function fixtureGeocode(query: string): GeoPoint | null {
  if (!fixturesEnabled()) return null;
  if (!/^(testville|zz99(\s*\d[a-z]{2})?)$/i.test(query.trim())) return null;
  return {
    label: 'Testville',
    postcode: null,
    outcode: 'ZZ99',
    latitude: 0,
    longitude: 0,
    country: 'England',
    district: 'Testville',
    kind: 'place',
  };
}

export const fixtureProvider: ListingProvider = {
  info: fixtureInfo,
  async search(q: ListingQuery): Promise<ProviderListing[]> {
    if (q.centre.outcode !== 'ZZ99') return [];
    const retrievedAt = new Date().toISOString();
    return FIXTURES.filter(
      (f) =>
        (q.maxPrice == null || f.price <= q.maxPrice * 1.0) && (q.minPrice == null || f.price >= q.minPrice),
    )
      .slice(0, q.limit)
      .map((f) => {
        const facts: Partial<PropertyFacts> = {
          address: f.address,
          postcode: f.postcode,
          outcode: 'ZZ99',
          country: 'England',
          district: 'Testville',
          propertyType: f.type,
          bedrooms: f.beds,
          bathrooms: f.baths,
          floorAreaSqm: f.sqm,
          askingPrice: f.price,
          tenure: f.tenure,
          description: f.description || null,
          listingStatus: 'for_sale',
          listingUrl: null,
          providerTags: ['test-fixture'],
        };
        const origin = { source: 'listing' as const, label: FIXTURE_LABEL, url: null, retrievedAt };
        const factOrigins: FactOrigins = {};
        for (const [k, v] of Object.entries(facts))
          if (v != null) (factOrigins as Record<string, unknown>)[k] = origin;
        return {
          provider: 'fixtures',
          providerListingId: f.id,
          url: null,
          facts,
          factOrigins,
          raw: { fixture: true, ...f },
        };
      });
  },
};

export function fixtureSoldEvidence(): SoldEvidence {
  const comps = [
    ['ZZ99 1AF', 'semi-detached', 315_000],
    ['ZZ99 1AG', 'semi-detached', 335_000],
    ['ZZ99 1AH', 'semi-detached', 298_000],
    ['ZZ99 2AF', 'semi-detached', 352_000],
    ['ZZ99 2AG', 'semi-detached', 341_000],
    ['ZZ99 3AF', 'terraced', 214_000],
    ['ZZ99 3AG', 'terraced', 226_000],
    ['ZZ99 3AH', 'terraced', 205_000],
    ['ZZ99 3AJ', 'terraced', 231_000],
    ['ZZ99 1AJ', 'detached', 495_000],
    ['ZZ99 1AL', 'detached', 520_000],
    ['ZZ99 1AN', 'detached', 470_000],
    ['ZZ99 2AH', 'flat-maisonette', 152_000],
    ['ZZ99 2AJ', 'flat-maisonette', 139_000],
    ['ZZ99 2AL', 'flat-maisonette', 148_000],
  ] as const;
  return {
    source: 'Test fixture sold prices (not real data)',
    sourceUrl: null,
    retrievedAt: new Date().toISOString(),
    scope: 'Testville fixtures',
    comparables: comps.map(([postcode, propertyType, price], i) => ({
      price,
      date: `2026-0${(i % 8) + 1}-10`,
      postcode,
      address: null,
      propertyType,
      newBuild: false,
      tenure: 'freehold',
    })),
  };
}

export function fixtureRentalEvidence(bedrooms: number | null): RentalEvidence {
  const byBeds: Record<number, number> = { 1: 750, 2: 950, 3: 1_250, 4: 1_650 };
  const avg = byBeds[Math.min(Math.max(bedrooms ?? 3, 1), 4)]!;
  return {
    source: 'Test fixture rents (not real data)',
    sourceUrl: null,
    retrievedAt: new Date().toISOString(),
    scope: `Testville, ${bedrooms ?? 'any'} bed`,
    bedrooms,
    monthlyAverage: avg,
    monthlyRangeLow: Math.round(avg * 0.9),
    monthlyRangeHigh: Math.round(avg * 1.1),
    sampleSize: 12,
    basis: 'asking_rents',
  };
}
