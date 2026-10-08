/**
 * Market data module — real external datasets only.
 * - postcodes.io: geocoding + admin district (free, CORS enabled)
 * - HM Land Registry Price Paid Data: real sold transactions (free, CORS enabled)
 * Nothing here is invented; on failure fields are null and flagged unavailable.
 */

const LR_TYPE = {
  flat: 'flat-maisonette',
  studio: 'flat-maisonette',
  terraced: 'terraced',
  semi: 'semi-detached',
  detached: 'detached',
  bungalow: 'detached',
  // Generic "house" — do not force terraced; omit type filter for broader comps
  house: null,
};

async function fetchJson(url, timeoutMs = 9000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Geocode a UK postcode via postcodes.io. Returns null when unavailable. */
export async function lookupPostcode(postcode) {
  if (!postcode) return null;
  const clean = postcode.trim().toUpperCase();
  try {
    // Full postcode first, then outcode
    if (/^[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}$/.test(clean)) {
      const d = await fetchJson(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
      const r = d.result;
      return {
        postcode: r.postcode,
        outcode: r.outcode,
        district: r.admin_district,
        region: r.region,
        lat: r.latitude,
        lng: r.longitude,
        source: 'postcodes.io',
      };
    }
    const d = await fetchJson(`https://api.postcodes.io/outcodes/${encodeURIComponent(clean.split(' ')[0])}`);
    const r = d.result;
    return {
      postcode: null,
      outcode: r.outcode,
      district: Array.isArray(r.admin_district) ? r.admin_district[0] : r.admin_district,
      region: null,
      lat: r.latitude,
      lng: r.longitude,
      source: 'postcodes.io',
    };
  } catch {
    return null;
  }
}

function parseLrDate(raw) {
  // API returns e.g. "Thu, 28 May 2026" or ISO
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Real sold transactions from HM Land Registry Price Paid Data.
 * Filters by local-authority district and property type, newest first.
 */
export async function fetchSoldComparables({ district, outcode, propertyType, maxResults = 40 }) {
  if (!district) return { comparables: [], source: null, unavailable: true };

  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 2);
  const minDateStr = minDate.toISOString().slice(0, 10);

  const params = new URLSearchParams({
    'propertyAddress.district': district.toUpperCase(),
    'min-transactionDate': minDateStr,
    _pageSize: String(maxResults),
    _sort: '-transactionDate',
  });
  const lrType = LR_TYPE[propertyType];
  if (lrType) {
    params.set('propertyType', `http://landregistry.data.gov.uk/def/common/${lrType}`);
  }

  try {
    const data = await fetchJson(
      `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?${params}`,
      12000,
    );
    const items = data?.result?.items || [];
    const comparables = items
      .map((i) => {
        const addr = i.propertyAddress || {};
        const date = parseLrDate(i.transactionDate);
        return {
          price: i.pricePaid ?? null,
          date: date ? date.toISOString().slice(0, 10) : null,
          dateMs: date ? date.getTime() : 0,
          postcode: addr.postcode || null,
          outcode: addr.postcode ? addr.postcode.split(' ')[0] : null,
          street: addr.street || null,
          town: addr.town || null,
          propertyType: i.propertyType?.prefLabel?.[0]?._value
            || i.propertyType?._about?.split('/').pop()
            || null,
          estateType: i.estateType?.prefLabel?.[0]?._value || null,
          newBuild: Boolean(i.newBuild),
        };
      })
      .filter((c) => c.price && c.date);

    // Prefer same-outcode sales; they are geographically closest
    if (outcode) {
      comparables.sort((a, b) => {
        const ao = a.outcode === outcode ? 1 : 0;
        const bo = b.outcode === outcode ? 1 : 0;
        if (ao !== bo) return bo - ao;
        return b.dateMs - a.dateMs;
      });
    }

    return {
      comparables,
      source: 'HM Land Registry Price Paid Data',
      district,
      unavailable: comparables.length === 0,
    };
  } catch {
    return { comparables: [], source: null, unavailable: true };
  }
}

/**
 * Gather all external market data for an analysis.
 * Every field is either real or explicitly null/unavailable.
 */
export async function getMarketData({ postcode, propertyType }) {
  const geo = await lookupPostcode(postcode);
  const sold = await fetchSoldComparables({
    district: geo?.district || null,
    outcode: geo?.outcode || null,
    propertyType,
  });
  return { geo, sold };
}
