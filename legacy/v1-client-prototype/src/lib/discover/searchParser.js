/**
 * Parse Rightmove search HTML (__NEXT_DATA__) into normalised listing cards.
 * Never invents prices — only maps portal JSON fields.
 */

const POSTCODE_RE = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i;
const OUTCODE_RE = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/;

function findProperties(obj, depth = 0) {
  if (!obj || depth > 8) return null;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const r = findProperties(v, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof obj === 'object') {
    if (Array.isArray(obj.properties) && obj.properties.length) {
      return { properties: obj.properties, resultCount: obj.resultCount ?? obj.properties.length };
    }
    for (const v of Object.values(obj)) {
      const r = findProperties(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

function mapPropertyType(subType = '') {
  const s = String(subType).toLowerCase();
  if (/studio/.test(s)) return 'studio';
  if (/flat|apartment|maisonette|penthouse/.test(s)) return 'flat';
  if (/terraced|terrace/.test(s)) return 'terraced';
  if (/semi/.test(s)) return 'semi';
  if (/detached/.test(s)) return 'detached';
  if (/bungalow/.test(s)) return 'bungalow';
  if (/house|end of terrace|mid terrace/.test(s)) return 'house';
  return 'house';
}

function extractPostcode(address = '') {
  const full = address.match(POSTCODE_RE);
  if (full) return full[1].toUpperCase().replace(/\s+/, ' ');
  const out = address.match(OUTCODE_RE);
  return out ? out[1].toUpperCase() : null;
}

export function normalizeSearchCard(raw, portal = 'Rightmove') {
  const id = String(raw.id ?? raw.listingId ?? '');
  if (!id) return null;

  const priceAmount = raw.price?.amount ?? raw.price ?? null;
  const price = typeof priceAmount === 'number' && priceAmount > 0 ? priceAmount : null;
  const beds = raw.bedrooms != null ? Number(raw.bedrooms) : null;
  const baths = raw.bathrooms != null ? Number(raw.bathrooms) : null;
  const address = raw.displayAddress || raw.address || null;
  const propertySubType = raw.propertySubType || raw.propertyTypeFullDescription || '';
  const propertyType = mapPropertyType(propertySubType);
  const path = raw.propertyUrl || `/properties/${id}`;
  const url = path.startsWith('http')
    ? path.split('#')[0]
    : `https://www.rightmove.co.uk${path.split('#')[0]}`;

  const images = raw.images || raw.propertyImages?.images || [];
  const imageUrls = images
    .map((img) => img?.srcUrl || img?.url || img?.mediaUrl || (typeof img === 'string' ? img : null))
    .filter(Boolean)
    .slice(0, 10);
  const image = imageUrls[0] || raw.image || null;
  const summary = raw.summary || raw.heading || '';
  const tenure = raw.tenure?.tenureType
    || (typeof raw.tenure === 'string' ? raw.tenure : null)
    || null;

  const firstVisible = raw.firstVisibleDate || raw.addedOrReduced || null;
  const listedAt = firstVisible ? Date.parse(firstVisible) || null : null;

  let floorArea = null;
  const sizeSqMeters = raw.displaySize
    || raw.size
    || raw.floorArea
    || raw.internalArea
    || null;
  if (typeof sizeSqMeters === 'number' && sizeSqMeters > 0) {
    floorArea = Math.round(sizeSqMeters);
  } else if (typeof sizeSqMeters === 'string') {
    const sqm = sizeSqMeters.match(/([\d,.]+)\s*m/i);
    const sqft = sizeSqMeters.match(/([\d,.]+)\s*(?:sq\.?\s*ft|ft)/i);
    if (sqm) floorArea = Math.round(parseFloat(sqm[1].replace(/,/g, '')));
    else if (sqft) floorArea = Math.round(parseFloat(sqft[1].replace(/,/g, '')) * 0.0929);
  }
  if (floorArea == null) {
    const blob = `${summary} ${propertySubType} ${raw.propertyTypeFullDescription || ''}`;
    const sqmMatch = blob.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*m|m²|sqm)\b/i);
    const sqftMatch = blob.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*(?:ft|feet)|ft²)\b/i);
    if (sqmMatch) floorArea = Math.round(parseFloat(sqmMatch[1].replace(/,/g, '')));
    else if (sqftMatch) floorArea = Math.round(parseFloat(sqftMatch[1].replace(/,/g, '')) * 0.0929);
  }

  return {
    id: `rightmove-${id}`,
    listingId: id,
    portal,
    url,
    title: raw.propertyTypeFullDescription
      || (beds != null ? `${beds} bedroom ${propertySubType || propertyType}` : propertySubType)
      || address
      || `Listing ${id}`,
    price,
    priceLabel: raw.price?.displayPrices?.[0]?.displayPrice
      || (price ? `£${price.toLocaleString()}` : null),
    beds,
    baths,
    propertyType,
    propertySubType,
    address,
    postcode: extractPostcode(address || ''),
    summary: summary.slice(0, 500),
    image,
    images: imageUrls,
    tenure: tenure === 'FREEHOLD' ? 'Freehold' : tenure === 'LEASEHOLD' ? 'Leasehold' : tenure,
    listedAt,
    addedOrReduced: raw.addedOrReduced || null,
    agent: raw.customer?.branchDisplayName || raw.formattedBranchName || null,
    floorArea,
  };
}

export function parseRightmoveSearchHtml(html) {
  if (!html || html.length < 500) {
    return { cards: [], resultCount: 0, error: 'Empty search response' };
  }

  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) {
    return { cards: [], resultCount: 0, error: 'Could not find Rightmove search data' };
  }

  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return { cards: [], resultCount: 0, error: 'Invalid Rightmove search JSON' };
  }

  const found = findProperties(data?.props?.pageProps || data);
  if (!found) {
    return { cards: [], resultCount: 0, error: 'No properties in search results' };
  }

  const cards = found.properties
    .map((p) => normalizeSearchCard(p))
    .filter((c) => c && c.price && c.beds != null);

  return {
    cards,
    resultCount: found.resultCount ?? cards.length,
    error: null,
  };
}
