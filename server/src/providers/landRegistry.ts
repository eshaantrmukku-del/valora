/**
 * HM Land Registry Price Paid Data — official sold prices for England and Wales (open data, OGL v3).
 * Linked-data API docs: https://landregistry.data.gov.uk/app/doc/ppd
 * Contains HM Land Registry data © Crown copyright and database right. Licensed under the OGL v3.0.
 */
import { z } from 'zod';
import type { PropertyType } from '../../../shared/brief';
import type { SoldEvidence } from '../../../shared/property';
import { config } from '../config';
import { fetchJson } from '../lib/http';
import { cached } from './cache';
import type { ProviderInfo } from './types';

const LR_TYPE: Partial<Record<PropertyType, string>> = {
  detached: 'detached',
  bungalow: 'detached',
  semi_detached: 'semi-detached',
  terraced: 'terraced',
  end_of_terrace: 'terraced',
  flat: 'flat-maisonette',
  maisonette: 'flat-maisonette',
};

const Label = z.array(z.object({ _value: z.string() })).optional();
const Item = z.object({
  pricePaid: z.number().optional(),
  transactionDate: z.string().optional(),
  newBuild: z.boolean().optional(),
  propertyType: z.object({ prefLabel: Label, _about: z.string().optional() }).optional(),
  estateType: z.object({ prefLabel: Label }).optional(),
  propertyAddress: z
    .object({
      paon: z.string().optional(),
      saon: z.string().optional(),
      street: z.string().optional(),
      town: z.string().optional(),
      postcode: z.string().optional(),
    })
    .optional(),
});
const Response = z.object({ result: z.object({ items: z.array(z.unknown()) }) });

export function landRegistryInfo(): ProviderInfo {
  return {
    id: 'land_registry',
    name: 'HM Land Registry Price Paid Data',
    kind: 'sold',
    configured: config().ENABLE_LAND_REGISTRY,
    openData: true,
    capabilities: { soldEvidence: true },
    coverage: 'Residential sales in England and Wales registered since 1995 (typically 2–8 weeks behind).',
    limitations: [
      'No floor area, bedroom count or condition — prices are only a rough guide to value.',
      'Scotland and Northern Ireland are not covered.',
      'Queried by local authority district; the most recent 200 sales are sampled and same-postcode-district sales preferred.',
    ],
    setup: null,
    docsUrl: 'https://landregistry.data.gov.uk/app/doc/ppd',
    envVars: ['ENABLE_LAND_REGISTRY'],
  };
}

function toIsoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function fetchSoldEvidence(params: {
  district: string;
  propertyType: PropertyType | null;
  monthsBack?: number;
}): Promise<SoldEvidence | null> {
  if (!config().ENABLE_LAND_REGISTRY) return null;
  const months = params.monthsBack ?? 24;
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const minDate = since.toISOString().slice(0, 10);
  const lrType = params.propertyType ? LR_TYPE[params.propertyType] : undefined;
  const q = new URLSearchParams({
    'propertyAddress.district': params.district.toUpperCase(),
    'min-transactionDate': minDate,
    _pageSize: '200',
    _sort: '-transactionDate',
  });
  if (lrType) q.set('propertyType', `http://landregistry.data.gov.uk/def/common/${lrType}`);
  const url = `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?${q}`;
  return cached('land_registry', `${params.district}|${lrType ?? 'any'}|${minDate.slice(0, 7)}`, 7 * 86_400, async () => {
    const raw = Response.parse(await fetchJson(url, { timeoutMs: 20_000 }));
    const comparables = raw.result.items
      .map((it) => Item.safeParse(it))
      .filter((r) => r.success)
      .map((r) => r.data!)
      .map((i) => {
        const a = i.propertyAddress ?? {};
        return {
          price: i.pricePaid ?? 0,
          date: toIsoDate(i.transactionDate) ?? '',
          postcode: a.postcode ?? null,
          address: [a.saon, a.paon, a.street, a.town].filter(Boolean).join(', ') || null,
          propertyType: i.propertyType?.prefLabel?.[0]?._value ?? i.propertyType?._about?.split('/').pop() ?? null,
          newBuild: Boolean(i.newBuild),
          tenure: i.estateType?.prefLabel?.[0]?._value ?? null,
        };
      })
      .filter((c) => c.price > 0 && c.date);
    return {
      source: 'HM Land Registry Price Paid Data',
      sourceUrl: url,
      retrievedAt: new Date().toISOString(),
      scope: `${params.district}${lrType ? `, ${lrType}` : ''}, sales since ${minDate}`,
      comparables,
    } satisfies SoldEvidence;
  });
}
