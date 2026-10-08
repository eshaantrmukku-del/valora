/**
 * Live property search — server helpers (used by Vite /api/search)
 * and client wrapper.
 *
 * Flow: location typeahead → Rightmove find URL → Jina HTML → __NEXT_DATA__ cards
 */

import { parseRightmoveSearchHtml } from './searchParser.js';
import { intentToSearchParams } from './parseIntent.js';

const TYPEAHEAD = 'https://los.rightmove.co.uk/typeahead';

async function fetchText(url, headers = {}, timeout = 45000) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchJson(url, headers = {}, timeout = 12000) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Resolve a place name to a Rightmove locationIdentifier (e.g. REGION^904). */
export async function resolveLocation(query) {
  if (!query) return null;
  try {
    const data = await fetchJson(
      `${TYPEAHEAD}?query=${encodeURIComponent(query)}`,
      {
        Referer: 'https://www.rightmove.co.uk/',
        Accept: 'application/json',
      },
    );
    const list = Array.isArray(data) ? data : (data.matches || data.results || []);
    const hit = list.find((x) => x.type === 'REGION' || x.type === 'OUTCODE' || x.type === 'POSTCODE')
      || list[0];
    if (!hit) return null;
    const type = hit.type || 'REGION';
    const id = hit.id ?? hit.locationId;
    if (id == null) return null;
    return {
      displayName: hit.displayName || query,
      locationIdentifier: `${type}^${id}`,
      type,
      id: String(id),
    };
  } catch {
    return null;
  }
}

/** Build a Rightmove search URL from resolved location + filters. */
export function buildRightmoveSearchUrl({ locationIdentifier, channel = 'sale', maxPrice, minPrice, minBedrooms, propertyTypes, keywords, index = 0 }) {
  const path = channel === 'rent'
    ? 'https://www.rightmove.co.uk/property-to-rent/find.html'
    : 'https://www.rightmove.co.uk/property-for-sale/find.html';

  const params = new URLSearchParams();
  params.set('locationIdentifier', locationIdentifier);
  params.set('includeSSTC', 'false');
  params.set('index', String(index));
  params.set('sortType', '6'); // newest listed
  if (maxPrice) params.set('maxPrice', String(maxPrice));
  if (minPrice) params.set('minPrice', String(minPrice));
  if (minBedrooms != null) params.set('minBedrooms', String(minBedrooms));
  if (propertyTypes) params.set('propertyTypes', propertyTypes);
  if (keywords) params.set('keywords', keywords);

  return `${path}?${params.toString()}`;
}

/** Fetch + parse a Rightmove search page via Jina HTML mode. */
export async function fetchRightmoveSearch(searchUrl) {
  const html = await fetchText(
    `https://r.jina.ai/${searchUrl}`,
    {
      'X-Respond-With': 'html',
      Accept: 'text/html',
    },
    50000,
  );
  return parseRightmoveSearchHtml(html);
}

/**
 * Full server-side search used by /api/search.
 * @param {object} filters from intentToSearchParams + location string
 */
export async function searchListingsServer(filters) {
  const locationQuery = filters.location;
  if (!locationQuery) {
    return { ok: false, error: 'A location is required (e.g. Manchester, Leeds, M1)', cards: [], resultCount: 0 };
  }

  const resolved = await resolveLocation(locationQuery);
  if (!resolved) {
    return { ok: false, error: `Could not resolve location “${locationQuery}”`, cards: [], resultCount: 0 };
  }

  const searchUrl = buildRightmoveSearchUrl({
    locationIdentifier: resolved.locationIdentifier,
    channel: filters.channel || 'sale',
    maxPrice: filters.maxPrice || undefined,
    minPrice: filters.minPrice || undefined,
    minBedrooms: filters.minBedrooms != null ? filters.minBedrooms : undefined,
    propertyTypes: filters.propertyTypes || undefined,
    keywords: filters.keywords || undefined,
    index: filters.index || 0,
  });

  try {
    const parsed = await fetchRightmoveSearch(searchUrl);
    if (parsed.error && !parsed.cards.length) {
      return {
        ok: false,
        error: parsed.error,
        cards: [],
        resultCount: 0,
        location: resolved,
        searchUrl,
      };
    }
    return {
      ok: true,
      cards: parsed.cards,
      resultCount: parsed.resultCount,
      location: resolved,
      searchUrl,
      source: 'Rightmove (via search)',
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'Search failed',
      cards: [],
      resultCount: 0,
      location: resolved,
      searchUrl,
    };
  }
}

/** Client: call Vite /api/search */
export async function searchLiveListings(intent) {
  const params = intentToSearchParams(intent);
  if (!params.location) {
    return { ok: false, error: 'Include a UK town, city, area or postcode (e.g. Little Chalfont, Manchester, HP7)', cards: [], resultCount: 0 };
  }

  const qs = new URLSearchParams();
  qs.set('location', params.location);
  qs.set('channel', params.channel);
  if (params.maxPrice) qs.set('maxPrice', String(params.maxPrice));
  if (params.minPrice) qs.set('minPrice', String(params.minPrice));
  if (params.minBedrooms != null) qs.set('minBedrooms', String(params.minBedrooms));
  if (params.propertyTypes) qs.set('propertyTypes', params.propertyTypes);
  if (params.keywords) qs.set('keywords', params.keywords);

  const res = await fetch(`/api/search?${qs}`, { signal: AbortSignal.timeout(60000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: data.error || `Search API ${res.status}`,
      cards: data.cards || [],
      resultCount: data.resultCount || 0,
    };
  }
  return data;
}
