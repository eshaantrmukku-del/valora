/**
 * planning.data.gov.uk — MHCLG's open planning and housing data platform (OGL).
 * Used to find planning designations at a property's location: conservation areas, listed buildings,
 * Article 4 directions, tree preservation zones, green belt and flood risk zones.
 * Docs: https://www.planning.data.gov.uk/docs
 *
 * Coverage varies by local planning authority and is England-only. Absence of a record does NOT mean
 * there is no designation — Valora says so explicitly.
 */
import { z } from 'zod';
import type { PlanningConstraint } from '../../../shared/property';
import { config } from '../config';
import { fetchJson } from '../lib/http';
import { cached } from './cache';
import type { ProviderInfo } from './types';

const DATASETS = [
  'conservation-area',
  'listed-building-outline',
  'article-4-direction-area',
  'tree-preservation-zone',
  'green-belt',
  'flood-risk-zone',
];

const Entity = z
  .object({
    dataset: z.string(),
    name: z.string().nullish(),
    reference: z.string().nullish(),
    entity: z.union([z.number(), z.string()]).nullish(),
  })
  .passthrough();

export function planningDataInfo(): ProviderInfo {
  return {
    id: 'planning_data',
    name: 'planning.data.gov.uk',
    kind: 'planning',
    configured: config().ENABLE_PLANNING_DATA,
    openData: true,
    capabilities: { planning: true },
    coverage: 'England. Designations published by participating local planning authorities.',
    limitations: [
      'Not every authority publishes every dataset, so a missing designation is not proof that none exists.',
      'Planning application history is not included — check the local authority planning portal.',
    ],
    setup: null,
    docsUrl: 'https://www.planning.data.gov.uk/docs',
    envVars: ['ENABLE_PLANNING_DATA'],
  };
}

export async function fetchPlanningConstraints(lat: number, lng: number): Promise<PlanningConstraint[] | null> {
  if (!config().ENABLE_PLANNING_DATA) return null;
  const q = new URLSearchParams({ latitude: lat.toFixed(6), longitude: lng.toFixed(6), limit: '100' });
  for (const d of DATASETS) q.append('dataset', d);
  const url = `https://www.planning.data.gov.uk/entity.json?${q}`;
  return cached('planning_data', `${lat.toFixed(5)},${lng.toFixed(5)}`, 30 * 86_400, async () => {
    const res = await fetchJson<{ entities?: unknown[] }>(url, { timeoutMs: 15_000 });
    const retrievedAt = new Date().toISOString();
    return (res.entities ?? [])
      .map((e) => Entity.safeParse(e))
      .filter((r) => r.success)
      .map(({ data: e }) => ({
        dataset: e!.dataset,
        name: e!.name || e!.reference || e!.dataset,
        reference: e!.reference ?? null,
        source: 'planning.data.gov.uk',
        sourceUrl: e!.entity != null ? `https://www.planning.data.gov.uk/entity/${e!.entity}` : url,
        retrievedAt,
      }));
  });
}
