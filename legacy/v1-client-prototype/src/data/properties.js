import { parseListingUrl, propertyIdFromUrl } from '../lib/parseListingUrl';
import { analyseProperty } from '../lib/propertyIntelligence';
import { parseIntent } from '../lib/discover/parseIntent';

export const properties = {};

export async function buildPropertyFromUrl(url, meta = null, options = {}) {
  const parsed = parseListingUrl(url);
  const id = propertyIdFromUrl(url);
  const brief = options.brief || null;
  // Prefer live parse of brief.query over stale stored filters
  const intent = brief?.query
    ? parseIntent(brief.query)
    : (brief?.filters || options.intent || null);
  const prefsFromBrief = intent
    ? {
        maxBudget: intent.maxPrice ?? undefined,
        targetYield: intent.minGrossYield ?? undefined,
      }
    : null;
  return analyseProperty({
    url,
    id,
    meta,
    parsed,
    strategyOverride: options.strategyOverride || intent?.strategy || null,
    prefs: prefsFromBrief,
    brief: brief
      ? { id: brief.id, name: brief.name, query: brief.query, intent }
      : options.briefMeta || null,
  });
}

/**
 * Manual entry: the user supplies the facts directly, so they are treated
 * as verified inputs (the user is the data source, not the AI).
 */
export async function buildPropertyManual(input) {
  const id = `manual-${Date.now().toString(36)}`;
  const meta = {
    fetched: true,
    source: 'manual entry',
    title: input.title || null,
    description: input.description || '',
    price: input.price || null,
    monthlyRent: input.monthlyRent || null,
    beds: input.beds ?? null,
    baths: input.baths ?? null,
    propertyType: input.propertyType || null,
    postcode: input.postcode || null,
    address: input.address || null,
    tenure: input.tenure || null,
    epc: input.epc || null,
    listingType: input.monthlyRent && !input.price ? 'rent' : 'sale',
  };
  const parsed = {
    valid: true,
    portal: 'Manual entry',
    listingId: null,
    city: null,
    postcode: input.postcode || null,
  };
  return analyseProperty({ url: null, id, meta, parsed });
}

export function generateFromUrl(url) {
  throw new Error('Listing metadata required — call buildPropertyFromUrl with fetched meta');
}

export function getProperty(id) {
  if (id && properties[id]) return properties[id];
  try {
    const stored = JSON.parse(localStorage.getItem(`valora_custom_${id}`) || 'null');
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveCustom(property) {
  localStorage.setItem(`valora_custom_${property.id}`, JSON.stringify(property));
  const recent = JSON.parse(localStorage.getItem('valora_recent') || '[]');
  const filtered = recent.filter((r) => r.id !== property.id);
  const existing = recent.find((r) => r.id === property.id);
  filtered.unshift({
    id: property.id,
    name: property.name,
    score: property.score,
    time: Date.now(),
    location: property.location,
    price: property.price,
    projectId: existing?.projectId,
  });
  localStorage.setItem('valora_recent', JSON.stringify(filtered.slice(0, 20)));
  window.dispatchEvent(new Event('valora-store-change'));
}

export function deleteProperty(id) {
  localStorage.removeItem(`valora_custom_${id}`);
  const recent = JSON.parse(localStorage.getItem('valora_recent') || '[]');
  localStorage.setItem('valora_recent', JSON.stringify(recent.filter((r) => r.id !== id)));
  window.dispatchEvent(new Event('valora-store-change'));
}

export function getAllStoredProperties() {
  const ids = new Set();
  try {
    JSON.parse(localStorage.getItem('valora_recent') || '[]').forEach((r) => ids.add(r.id));
    JSON.parse(localStorage.getItem('valora_portfolio') || '[]').forEach((p) => ids.add(p.id));
  } catch {
    /* ignore */
  }
  return [...ids].map((id) => getProperty(id)).filter(Boolean);
}
