const PORTALS = {
  'rightmove.co.uk': { name: 'Rightmove', id: /\/properties\/(\d+)/i },
  'www.rightmove.co.uk': { name: 'Rightmove', id: /\/properties\/(\d+)/i },
  'zoopla.co.uk': { name: 'Zoopla', id: /\/details\/(\d+)/i },
  'www.zoopla.co.uk': { name: 'Zoopla', id: /\/details\/(\d+)/i },
  'onthemarket.com': { name: 'OnTheMarket', id: /\/details\/(\d+)/i },
  'www.onthemarket.com': { name: 'OnTheMarket', id: /\/details\/(\d+)/i },
};

const UK_CITIES = [
  'manchester', 'birmingham', 'leeds', 'sheffield', 'liverpool', 'bristol',
  'nottingham', 'newcastle', 'leicester', 'cardiff', 'edinburgh', 'glasgow', 'london',
];

const POSTCODE_RE = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i;
const OUTCODE_RE = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/i;

export function parseListingUrl(url) {
  let host = '';
  let pathname = '';
  try {
    const u = new URL(url.trim());
    host = u.hostname.replace(/^www\./, '');
    pathname = u.pathname;
  } catch {
    return { valid: false, portal: null, listingId: null, city: null, postcode: null };
  }

  const portalEntry = PORTALS[host] || PORTALS[`www.${host}`];
  const portal = portalEntry?.name || null;
  const listingId = portalEntry?.id.exec(pathname)?.[1] || null;

  const lower = `${pathname} ${url}`.toLowerCase();
  const city = UK_CITIES.find((c) => lower.includes(c));
  const postcode = url.match(POSTCODE_RE)?.[1]?.toUpperCase()
    || pathname.match(OUTCODE_RE)?.[1]?.toUpperCase()
    || null;

  const valid = Boolean(portal && listingId) || /rightmove|zoopla|onthemarket/i.test(host);

  return {
    valid,
    portal,
    listingId,
    city: city ? city.charAt(0).toUpperCase() + city.slice(1) : null,
    postcode,
    host,
  };
}

export function propertyIdFromUrl(url) {
  const parsed = parseListingUrl(url);
  if (parsed.listingId && parsed.portal) {
    const slug = parsed.portal.toLowerCase().replace(/\s/g, '');
    return `${slug}-${parsed.listingId}`;
  }
  const norm = url.trim().toLowerCase().split('?')[0];
  let h = 0;
  for (let i = 0; i < norm.length; i += 1) {
    h = ((h << 5) - h) + norm.charCodeAt(i);
    h |= 0;
  }
  return `url-${Math.abs(h)}`;
}
