/**
 * PropertyData (https://propertydata.co.uk/api) — commercial UK property data API (paid plan, API key).
 *
 *  - /sourced-properties: currently listed properties on PropertyData's sourcing lists (e.g.
 *    unmodernised-properties, reduced-properties), filtered by postcode/district and radius.
 *  - /rents: asking-rent statistics around a postcode.
 *
 * Response mapping is written defensively against the documented examples and validated at runtime.
 * It has NOT been verified against a live key from this development environment (outbound access to
 * propertydata.co.uk was blocked) — run `npm run providers:check` with a key before relying on it.
 */
import { z } from 'zod';
import type { PropertyType } from '../../../shared/brief';
import type { FactOrigins, PropertyFacts, RentalEvidence } from '../../../shared/property';
import { config } from '../config';
import { fetchJson } from '../lib/http';
import { cached } from './cache';
import type { ListingProvider, ListingQuery, ProviderInfo, ProviderListing } from './types';
import { ProviderNotConfiguredError } from './types';

const num = z.union([z.number(), z.string()]).transform((v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(v.replace(/[£,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
});

export const SourcedPropertySchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    address: z.string().nullish(),
    postcode: z.string().nullish(),
    type: z.string().nullish(),
    bedrooms: num.nullish(),
    price: num.nullish(),
    sqf: num.nullish(),
    days_on_market: num.nullish(),
    sstc: z.union([z.boolean(), z.number(), z.string()]).nullish(),
    lat: num.nullish(),
    lng: num.nullish(),
    url: z.string().nullish(),
    portal: z.string().nullish(),
    description: z.string().nullish(),
    image: z.string().nullish(),
    images: z.array(z.string()).nullish(),
  })
  .passthrough();

const SourcedResponse = z.object({
  status: z.string(),
  message: z.string().optional(),
  properties: z.array(z.unknown()).optional(),
  data: z.unknown().optional(),
});

const RentsResponse = z.object({
  status: z.string(),
  message: z.string().optional(),
  data: z
    .object({
      long_let: z
        .object({
          points_analysed: num.nullish(),
          radius: z.union([z.string(), z.number()]).nullish(),
          unit: z.string().nullish(),
          average: num.nullish(),
          '70pc_range': z.array(num).nullish(),
        })
        .passthrough()
        .nullish(),
    })
    .passthrough()
    .nullish(),
});

const TYPE_MAP: [RegExp, PropertyType][] = [
  [/semi/i, 'semi_detached'],
  [/end[-_ ]?of[-_ ]?terrace|end[-_ ]terrace/i, 'end_of_terrace'],
  [/terrace/i, 'terraced'],
  [/bungalow/i, 'bungalow'],
  [/maisonette/i, 'maisonette'],
  [/flat|apartment|studio/i, 'flat'],
  [/detached/i, 'detached'],
  [/house/i, 'house_any'],
];

export function mapPropertyType(raw: string | null | undefined): PropertyType | null {
  if (!raw) return null;
  for (const [re, t] of TYPE_MAP) if (re.test(raw)) return t;
  return 'other';
}

/** Valora property types → PropertyData `standardised_type` filter values (best effort). */
const PD_TYPE: Partial<Record<PropertyType, string>> = {
  detached: 'detached_house',
  semi_detached: 'semi-detached_house',
  terraced: 'terraced_house',
  end_of_terrace: 'terraced_house',
  bungalow: 'bungalow',
  flat: 'flat',
  maisonette: 'flat',
};

export function propertyDataInfo(): ProviderInfo {
  const c = config();
  return {
    id: 'propertydata',
    name: 'PropertyData',
    kind: 'listings',
    configured: Boolean(c.PROPERTYDATA_API_KEY),
    openData: false,
    capabilities: { listingSearch: true, askingPrice: true, listingUrl: true, rentalEvidence: true },
    coverage:
      'England, Wales and Scotland. Listings are limited to PropertyData sourcing lists (e.g. unmodernised, reduced, repossessed).',
    limitations: [
      'Only properties on the configured sourcing lists are returned — not every property on the market.',
      'Listing descriptions and photos may not be included; Valora shows only fields the API returns.',
      'Rents are asking rents from current listings, not achieved rents.',
      'Each call consumes API credits on your PropertyData plan.',
    ],
    setup: c.PROPERTYDATA_API_KEY
      ? null
      : 'Create a PropertyData account with an API plan, copy your API key into PROPERTYDATA_API_KEY and restart the server.',
    docsUrl: 'https://propertydata.co.uk/api/documentation/sourced-properties',
    envVars: ['PROPERTYDATA_API_KEY', 'PROPERTYDATA_LISTS', 'PROPERTYDATA_BASE_URL'],
  };
}

function base(): { url: string; key: string } {
  const c = config();
  if (!c.PROPERTYDATA_API_KEY) throw new ProviderNotConfiguredError('PropertyData API key not configured');
  return { url: c.PROPERTYDATA_BASE_URL.replace(/\/$/, ''), key: c.PROPERTYDATA_API_KEY };
}

function assertSuccess(r: { status: string; message?: string }) {
  if (r.status !== 'success') throw new Error(`PropertyData error: ${r.message ?? r.status}`);
}

export function mapSourcedProperty(item: unknown, list: string, retrievedAt: string): ProviderListing | null {
  const parsed = SourcedPropertySchema.safeParse(item);
  if (!parsed.success) return null;
  const p = parsed.data;
  const origin = (label = 'PropertyData sourced listing') => ({
    source: 'listing' as const,
    label,
    url: p.url ?? null,
    retrievedAt,
  });
  const facts: Partial<PropertyFacts> = {
    address: p.address ?? null,
    postcode: p.postcode ? p.postcode.toUpperCase() : null,
    outcode: p.postcode ? p.postcode.toUpperCase().split(' ')[0]! : null,
    latitude: p.lat ?? null,
    longitude: p.lng ?? null,
    propertyType: mapPropertyType(p.type),
    bedrooms: p.bedrooms != null ? Math.round(p.bedrooms) : null,
    askingPrice: p.price != null ? Math.round(p.price) : null,
    floorAreaSqm: p.sqf != null && p.sqf > 0 ? Math.round(p.sqf * 0.092903 * 10) / 10 : null,
    daysOnMarket: p.days_on_market ?? null,
    listingStatus: p.sstc === true || p.sstc === 1 || p.sstc === '1' ? 'sold_stc' : 'for_sale',
    listingUrl: p.url && /^https:\/\//.test(p.url) ? p.url : null,
    description: p.description ?? null,
    images: [...(p.images ?? []), ...(p.image ? [p.image] : [])].filter((u) => /^https:\/\//.test(u)),
    providerTags: [list],
  };
  const factOrigins: FactOrigins = {};
  for (const [k, v] of Object.entries(facts)) {
    if (v != null && !(Array.isArray(v) && v.length === 0))
      (factOrigins as Record<string, unknown>)[k] = origin();
  }
  factOrigins.providerTags = {
    source: 'provider_classification',
    label: `PropertyData list: ${list}`,
    url: null,
    retrievedAt,
  };
  return {
    provider: 'propertydata',
    providerListingId: p.id,
    url: facts.listingUrl ?? null,
    facts,
    factOrigins,
    raw: item,
  };
}

export const propertyDataProvider: ListingProvider = {
  info: propertyDataInfo,
  async search(q: ListingQuery): Promise<ProviderListing[]> {
    const { url, key } = base();
    const lists = config()
      .PROPERTYDATA_LISTS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const location = q.centre.postcode ?? q.centre.outcode;
    const params = new URLSearchParams({
      key,
      list: lists.join(','),
      radius: String(Math.max(1, Math.round(q.radiusMiles))),
      results: String(Math.min(q.limit, 100)),
    });
    if (location) params.set('postcode', location);
    else params.set('location', `${q.centre.latitude},${q.centre.longitude}`);
    const types = [...new Set(q.propertyTypes.map((t) => PD_TYPE[t]).filter(Boolean))];
    if (types.length) params.set('standardised_type', types.join(','));
    const raw = SourcedResponse.parse(
      await fetchJson(`${url}/sourced-properties?${params}`, { timeoutMs: 25_000 }),
    );
    assertSuccess(raw);
    const items = raw.properties ?? (Array.isArray(raw.data) ? raw.data : []);
    const retrievedAt = new Date().toISOString();
    const out: ProviderListing[] = [];
    for (const item of items) {
      const list = (item as { list?: string })?.list ?? lists.join(',');
      const mapped = mapSourcedProperty(item, list, retrievedAt);
      if (mapped) out.push(mapped);
    }
    return out;
  },
};

export async function fetchRentalEvidence(params: {
  postcode: string;
  bedrooms: number | null;
  propertyType: PropertyType | null;
}): Promise<RentalEvidence | null> {
  if (!config().PROPERTYDATA_API_KEY) return null;
  const { url, key } = base();
  const q = new URLSearchParams({ key, postcode: params.postcode });
  if (params.bedrooms != null) q.set('bedrooms', String(Math.min(params.bedrooms, 5)));
  if (params.propertyType === 'flat' || params.propertyType === 'maisonette') q.set('type', 'flat');
  else if (params.propertyType) q.set('type', 'house');
  return cached(
    'propertydata',
    `rents:${params.postcode}|${params.bedrooms}|${q.get('type') ?? ''}`,
    7 * 86_400,
    async () => {
      const raw = RentsResponse.parse(await fetchJson(`${url}/rents?${q}`, { timeoutMs: 20_000 }));
      assertSuccess(raw);
      const ll = raw.data?.long_let;
      if (!ll || ll.average == null) return null;
      const weekly = !ll.unit || /week/i.test(ll.unit);
      const toMonthly = (v: number | null | undefined) =>
        v == null ? null : Math.round(weekly ? (v * 52) / 12 : v);
      const range = ll['70pc_range'] ?? null;
      return {
        source: 'PropertyData (asking rents)',
        sourceUrl: 'https://propertydata.co.uk/api/documentation/rents',
        retrievedAt: new Date().toISOString(),
        scope: `${params.postcode}${params.bedrooms != null ? `, ${params.bedrooms} bed` : ''}${ll.radius ? `, ${ll.radius} mile radius` : ''}`,
        bedrooms: params.bedrooms,
        monthlyAverage: toMonthly(ll.average),
        monthlyRangeLow: toMonthly(range?.[0] ?? null),
        monthlyRangeHigh: toMonthly(range?.[1] ?? null),
        sampleSize: ll.points_analysed ?? null,
        basis: 'asking_rents',
      } satisfies RentalEvidence;
    },
  );
}
