/**
 * Energy Performance Certificates — domestic EPC register (England & Wales).
 * API docs: https://epc.opendatacommunities.org/docs/api/domestic  (free registration; email + API key, HTTP Basic auth)
 *
 * Note: DLUHC/MHCLG has announced a replacement service for EPC data. If the endpoint changes, update
 * EPC_BASE below. Not verified against a live key from the development environment.
 */
import { z } from 'zod';
import { config } from '../config';
import { fetchJson } from '../lib/http';
import { cached } from './cache';
import type { ProviderInfo } from './types';

const EPC_BASE = 'https://epc.opendatacommunities.org/api/v1/domestic/search';

const Row = z
  .object({
    address: z.string().optional(),
    address1: z.string().optional(),
    postcode: z.string().optional(),
    'current-energy-rating': z.string().optional(),
    'total-floor-area': z.union([z.string(), z.number()]).optional(),
    'property-type': z.string().optional(),
    'built-form': z.string().optional(),
    'lodgement-date': z.string().optional(),
    'lmk-key': z.string().optional(),
  })
  .passthrough();

export interface EpcRecord {
  address: string;
  postcode: string | null;
  rating: string | null;
  floorAreaSqm: number | null;
  lodgementDate: string | null;
  certificateKey: string | null;
}

export function epcInfo(): ProviderInfo {
  const c = config();
  const configured = Boolean(c.EPC_API_EMAIL && c.EPC_API_KEY);
  return {
    id: 'epc',
    name: 'EPC register (domestic)',
    kind: 'epc',
    configured,
    openData: false,
    capabilities: { epc: true },
    coverage: 'Domestic Energy Performance Certificates lodged in England and Wales.',
    limitations: [
      'Matched to a property by full postcode and address text; a match is not guaranteed and is shown as such.',
      'Floor areas come from the certificate assessment and may differ from agent figures.',
    ],
    setup: configured
      ? null
      : 'Register at epc.opendatacommunities.org (free), then set EPC_API_EMAIL and EPC_API_KEY.',
    docsUrl: 'https://epc.opendatacommunities.org/docs/api/domestic',
    envVars: ['EPC_API_EMAIL', 'EPC_API_KEY'],
  };
}

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pick the certificate whose address best matches the subject's first address line. */
export function matchEpc(records: EpcRecord[], address: string | null): EpcRecord | null {
  if (!address || !records.length) return null;
  const first = norm(address.split(',')[0] ?? address);
  const number = /^(?:flat \S+ )?(\d+[a-z]?)\b/.exec(first)?.[1];
  const candidates = records.filter((r) => {
    const a = norm(r.address);
    return number
      ? new RegExp(`\\b${number}\\b`).test(a) && a.includes(first.replace(/^\S+\s/, '').split(' ')[0] ?? '')
      : a.startsWith(first);
  });
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => (b.lodgementDate ?? '').localeCompare(a.lodgementDate ?? ''))[0]!;
}

export async function fetchEpcForPostcode(postcode: string): Promise<EpcRecord[] | null> {
  const c = config();
  if (!c.EPC_API_EMAIL || !c.EPC_API_KEY) return null;
  const auth = Buffer.from(`${c.EPC_API_EMAIL}:${c.EPC_API_KEY}`).toString('base64');
  return cached('epc', `pc:${postcode}`, 30 * 86_400, async () => {
    const res = await fetchJson<{ rows?: unknown[] }>(
      `${EPC_BASE}?postcode=${encodeURIComponent(postcode)}&size=100`,
      {
        headers: { Authorization: `Basic ${auth}` },
        timeoutMs: 15_000,
      },
    );
    return (res.rows ?? [])
      .map((r) => Row.safeParse(r))
      .filter((r) => r.success)
      .map(({ data: r }) => {
        const area = r!['total-floor-area'] != null ? parseFloat(String(r!['total-floor-area'])) : NaN;
        return {
          address: r!.address ?? r!.address1 ?? '',
          postcode: r!.postcode ?? null,
          rating: r!['current-energy-rating'] ?? null,
          floorAreaSqm: Number.isFinite(area) && area > 0 ? area : null,
          lodgementDate: r!['lodgement-date'] ?? null,
          certificateKey: r!['lmk-key'] ?? null,
        };
      });
  });
}
