/**
 * postcodes.io — free, open geocoding for UK postcodes, outcodes and places (OS Open Names).
 * Docs: https://postcodes.io/docs   Licence: Open Government Licence (ONS/OS data).
 */
import { z } from 'zod';
import { config } from '../config';
import { fetchJson } from '../lib/http';
import { cached } from './cache';
import type { GeoPoint, ProviderInfo } from './types';

const BASE = 'https://api.postcodes.io';

const PostcodeResult = z.object({
  postcode: z.string(),
  outcode: z.string(),
  country: z.string().nullable(),
  admin_district: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});
const OutcodeResult = z.object({
  outcode: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  admin_district: z.array(z.string()).nullable().optional(),
  country: z.array(z.string()).nullable().optional(),
});
const PlaceResult = z.object({
  name_1: z.string(),
  local_type: z.string().nullable().optional(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  outcode: z.string().nullable().optional(),
  district_borough: z.string().nullable().optional(),
  county_unitary: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
});

export const FULL_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;
export const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

export function normalisePostcode(raw: string): string | null {
  const m = FULL_POSTCODE.exec(raw.trim());
  return m ? `${m[1]!.toUpperCase()} ${m[2]!.toUpperCase()}` : null;
}

export function postcodesInfo(): ProviderInfo {
  return {
    id: 'postcodes_io',
    name: 'postcodes.io',
    kind: 'geocoding',
    configured: config().ENABLE_POSTCODES_IO,
    openData: true,
    capabilities: { geocoding: true },
    coverage: 'All UK postcodes, outcodes and named places.',
    limitations: ['Place-name lookups return the best match only; ambiguous names (e.g. "Newport") may resolve to the wrong town.'],
    setup: null,
    docsUrl: 'https://postcodes.io/docs',
    envVars: ['ENABLE_POSTCODES_IO'],
  };
}

async function get<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  const res = await fetchJson<{ status: number; result: unknown }>(`${BASE}${path}`, { timeoutMs: 8_000 }).catch((err) => {
    if (String(err?.message).includes('HTTP 404')) return { status: 404, result: null };
    throw err;
  });
  if (res.status !== 200 || res.result == null) return null;
  return schema.parse(res.result);
}

export async function geocode(query: string): Promise<GeoPoint | null> {
  if (!config().ENABLE_POSTCODES_IO) return null;
  const q = query.trim();
  return cached('postcodes_io', `geo:${q.toLowerCase()}`, 30 * 86_400, async () => {
    const full = normalisePostcode(q);
    if (full) {
      const r = await get(`/postcodes/${encodeURIComponent(full)}`, PostcodeResult);
      if (!r || r.latitude == null || r.longitude == null) return null;
      return {
        label: r.postcode,
        postcode: r.postcode,
        outcode: r.outcode,
        latitude: r.latitude,
        longitude: r.longitude,
        country: r.country,
        district: r.admin_district,
        kind: 'postcode',
      } satisfies GeoPoint;
    }
    if (OUTCODE.test(q)) {
      const r = await get(`/outcodes/${encodeURIComponent(q.toUpperCase())}`, OutcodeResult);
      if (!r || r.latitude == null || r.longitude == null) return null;
      return {
        label: r.outcode,
        postcode: null,
        outcode: r.outcode,
        latitude: r.latitude,
        longitude: r.longitude,
        country: r.country?.[0] ?? null,
        district: r.admin_district?.[0] ?? null,
        kind: 'outcode',
      } satisfies GeoPoint;
    }
    const list = await fetchJson<{ status: number; result: unknown[] | null }>(`${BASE}/places?q=${encodeURIComponent(q)}&limit=10`, {
      timeoutMs: 8_000,
    });
    const places = z.array(PlaceResult).parse(list.result ?? []);
    // Prefer settlements over other place types, and exact name matches.
    const rank = (p: z.infer<typeof PlaceResult>) =>
      (p.name_1.toLowerCase() === q.toLowerCase() ? 0 : 10) + (/city|town|village|suburb|hamlet/i.test(p.local_type ?? '') ? 0 : 5);
    const best = [...places].sort((a, b) => rank(a) - rank(b))[0];
    if (!best || best.latitude == null || best.longitude == null) return null;
    return {
      label: best.name_1,
      postcode: null,
      outcode: best.outcode ?? null,
      latitude: best.latitude,
      longitude: best.longitude,
      country: best.country ?? null,
      district: best.district_borough ?? best.county_unitary ?? null,
      kind: 'place',
    } satisfies GeoPoint;
  });
}
