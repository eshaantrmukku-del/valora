function decode(s) {
  return s
    ?.replace(/&amp;/g, '&')
    .replace(/&#163;/g, '£')
    .replace(/&pound;/g, '£')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function metaTag(html, prop) {
  const re1 = new RegExp(`property=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`content=["']([^"']+)["'][^>]*property=["']${prop}["']`, 'i');
  const re3 = new RegExp(`name=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i');
  const re4 = new RegExp(`content=["']([^"']+)["'][^>]*name=["']${prop}["']`, 'i');
  return decode(html.match(re1)?.[1] || html.match(re2)?.[1] || html.match(re3)?.[1] || html.match(re4)?.[1]);
}

function parseMoney(raw) {
  if (!raw) return null;
  const n = parseInt(String(raw).replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function cleanTitle(title) {
  if (!title) return null;
  return decode(title)
    .replace(/^Check out this\s+/i, '')
    .replace(/\s+on Rightmove$/i, '')
    .replace(/\s+[-|].*Rightmove.*$/i, '')
    .replace(/\s+[-|].*Zoopla.*$/i, '')
    .replace(/\s+[-|].*OnTheMarket.*$/i, '')
    .trim();
}

/** Parse portal OG titles/descriptions into structured fields. */
export function parseListingText(title, description, url = '') {
  const t = decode(title) || '';
  const d = decode(description) || '';
  const text = `${t}\n${d}\n${url}`;

  const listingType = /\bfor rent\b|\bto rent\b|\bpcm\b|\bpw\b/i.test(text)
    ? 'rent'
    : /\bfor sale\b/i.test(text)
      ? 'sale'
      : null;

  let beds = null;
  const bedsMatch = text.match(/(\d+)\s*bed(?:room)?s?\b/i);
  if (bedsMatch) beds = parseInt(bedsMatch[1], 10);
  else if (/\bstudio\b/i.test(text)) beds = 0;

  let baths = null;
  const bathsMatch = text.match(/(\d+)\s*bath(?:room)?s?\b/i);
  if (bathsMatch) baths = parseInt(bathsMatch[1], 10);

  let floorArea = null;
  const sqftMatch = text.match(/([\d,]+)\s*sq\.?\s*(?:ft|feet)\b/i);
  const sqmMatch = text.match(/([\d,.]+)\s*(?:sq\.?\s*m|sqm|m²|square met)/i);
  if (sqmMatch) floorArea = Math.round(parseFloat(sqmMatch[1].replace(/,/g, '')));
  else if (sqftMatch) floorArea = Math.round(parseMoney(sqftMatch[1]) * 0.0929);

  const serviceChargeMatch = text.match(/service charge[:\s]*£\s*([\d,]+)/i);
  const serviceCharge = serviceChargeMatch ? parseMoney(serviceChargeMatch[1]) : null;
  const groundRentMatch = text.match(/ground rent[:\s]*£\s*([\d,]+)/i);
  const groundRent = groundRentMatch ? parseMoney(groundRentMatch[1]) : null;
  const councilTaxMatch = text.match(/council tax(?:\s*band)?[:\s]*([A-H])\b/i);
  const councilTaxBand = councilTaxMatch?.[1]?.toUpperCase() || null;

  let propertyType = null;
  const typeMatch = text.match(/\b(studio|apartment|flat|maisonette|penthouse|terraced|semi[- ]?detached|detached|bungalow|house|cottage)\b/i);
  if (typeMatch) {
    const raw = typeMatch[1].toLowerCase();
    if (raw.includes('semi')) propertyType = 'semi';
    else if (raw === 'apartment' || raw === 'maisonette' || raw === 'penthouse') propertyType = 'flat';
    else propertyType = raw;
  }

  let price = null;
  let monthlyRent = null;
  let priceLabel = null;

  const rentMatch = text.match(/£\s*([\d,]+)\s*(pcm|pw)\b/i)
    || d.match(/for\s+£\s*([\d,]+)\s*(pcm|pw)\b/i);
  if (rentMatch) {
    const amount = parseMoney(rentMatch[1]);
    const unit = rentMatch[2].toLowerCase();
    if (amount) {
      monthlyRent = unit === 'pw' ? Math.round((amount * 52) / 12) : amount;
      priceLabel = `£${amount.toLocaleString()} ${unit}`;
    }
  }

  const saleMatch = text.match(/for\s+£\s*([\d,]+)\b(?!\s*(?:pcm|pw))/i)
    || text.match(/£\s*([\d,]+)(?!\s*(?:pcm|pw))/);
  if (saleMatch && listingType !== 'rent') {
    const amount = parseMoney(saleMatch[1]);
    if (amount && amount >= 20000 && amount < 50_000_000) {
      price = amount;
      priceLabel = `£${amount.toLocaleString()}`;
    }
  }

  // Prefer rent figure when clearly a rental
  if (listingType === 'rent' && monthlyRent && !price) {
    priceLabel = priceLabel || `£${monthlyRent.toLocaleString()} pcm`;
  }

  let address = null;
  const addrMatch = d.match(/for\s+(?:sale|rent)\s+in\s+(.+?)\s+for\s+/i)
    || d.match(/in\s+([A-Za-z0-9 ,.'&\-]+?)\s+for\s+(?:£|Coming Soon)/i);
  if (addrMatch) address = decode(addrMatch[1])?.replace(/\s+/g, ' ');

  const postcodeMatch = text.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i)
    || text.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/);
  const postcode = postcodeMatch?.[1]?.toUpperCase().replace(/\s+/, ' ') || null;

  let tenure = null;
  if (/\bleasehold\b/i.test(text)) tenure = 'Leasehold';
  else if (/\bfreehold\b/i.test(text)) tenure = 'Freehold';

  const epcMatch = text.match(/EPC\s*(?:rating)?[:\s]*([A-G])/i);
  const epc = epcMatch?.[1]?.toUpperCase() || null;

  const agentMatch = d.match(/Marketed by\s+(.+?)(?:\.|$)/i);
  const agent = agentMatch ? decode(agentMatch[1]) : null;

  const cleaned = cleanTitle(t);
  const hasUseful = Boolean(
    (cleaned && !/^rightmove\.co\.uk$/i.test(cleaned))
    || price
    || monthlyRent
    || beds
    || address,
  );

  return {
    title: cleaned,
    description: d || null,
    price,
    monthlyRent,
    priceLabel,
    beds,
    baths,
    floorArea,
    serviceCharge,
    groundRent,
    councilTaxBand,
    propertyType,
    listingType,
    address,
    postcode,
    tenure,
    epc,
    agent,
    fetched: hasUseful,
  };
}

export function parseListingHtml(html, url = '') {
  if (!html) return null;

  // Blocked / empty shells
  if (/<title>\s*403 Forbidden\s*<\/title>/i.test(html) || html.length < 400) {
    return { fetched: false, blocked: true };
  }

  const title = metaTag(html, 'og:title')
    || decode(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]);
  const description = metaTag(html, 'og:description') || metaTag(html, 'description');
  const image = metaTag(html, 'og:image');

  const fromText = parseListingText(title, description, url);

  // JSON-LD / embedded price fallbacks for HTML when OG is thin
  if (!fromText.price && fromText.listingType !== 'rent') {
    const patterns = [
      /"price"\s*:\s*"?([\d,]+)"?/i,
      /"amount"\s*:\s*([\d]+)/i,
      /£\s*([\d,]+)/,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) {
        const p = parseMoney(m[1]);
        if (p > 20000 && p < 50_000_000) {
          fromText.price = p;
          fromText.priceLabel = `£${p.toLocaleString()}`;
          break;
        }
      }
    }
  }

  if (!fromText.beds) {
    const bedsMatch = html.slice(0, 50000).match(/"bedrooms"\s*:\s*(\d+)/i)
      || html.slice(0, 50000).match(/(\d+)\s*bed/i);
    if (bedsMatch) fromText.beds = parseInt(bedsMatch[1], 10);
  }

  if (!fromText.postcode) {
    const pc = html.slice(0, 50000).match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/);
    if (pc) fromText.postcode = pc[1].toUpperCase();
  }

  fromText.image = image || null;
  // Gallery images from JSON blobs / img tags (never invent — only URLs found)
  const found = new Set(image ? [image] : []);
  const imgRe = /https?:\/\/[^"'\\s>]+\.(?:jpg|jpeg|png|webp)/gi;
  const slice = html.slice(0, 120000);
  let m;
  while ((m = imgRe.exec(slice)) && found.size < 10) {
    const u = m[0];
    if (/rightmove|zoocdn|onthemarket|ctfassets/i.test(u) && !/logo|icon|sprite|placeholder/i.test(u)) {
      found.add(u.split('?')[0]);
    }
  }
  fromText.images = [...found];
  fromText.fetched = Boolean(
    fromText.fetched || fromText.price || fromText.monthlyRent || fromText.title,
  );
  return fromText;
}

export function parseMicrolinkPayload(payload, url) {
  const data = payload?.data || payload;
  if (!data) return null;
  const parsed = parseListingText(data.title, data.description, url || data.url);
  parsed.image = data.image?.url || data.image || null;
  parsed.images = parsed.image ? [parsed.image] : [];
  parsed.source = 'microlink';
  return parsed;
}

export function parseJinaPayload(payload, url) {
  let title = null;
  let description = null;
  let content = '';

  if (typeof payload === 'string') {
    content = payload;
    title = payload.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || null;
    // Pull a useful paragraph that looks like the listing blurb
    const pcm = payload.match(/£\s*[\d,]+\s*pcm/i);
    const sale = payload.match(/\d+\s*bedroom[\s\S]{0,120}?for\s+£\s*[\d,]+/i);
    description = (sale?.[0] || pcm?.[0] || '').trim() || null;
    if (!description) {
      const para = payload.match(/A modern[\s\S]{20,280}|[\d]+\s*bedroom[\s\S]{10,200}/i);
      description = para?.[0]?.slice(0, 280) || null;
    }
  } else if (payload?.data) {
    title = payload.data.title;
    description = payload.data.description;
    content = payload.data.content || '';
  }

  const combinedDesc = [description, content.slice(0, 4000)].filter(Boolean).join('\n');
  const parsed = parseListingText(title, combinedDesc, url);
  parsed.source = 'jina';
  return parsed;
}

export function isUsableListingMeta(meta) {
  if (!meta?.fetched) return false;
  const hasPrice = Boolean(
    (meta.price && meta.price >= 20000)
    || (meta.monthlyRent && meta.monthlyRent >= 100),
  );
  const hasBeds = meta.beds != null && meta.beds >= 0;
  // Require a real price/rent from the listing — never invent one
  return hasPrice && (hasBeds || Boolean(meta.title || meta.address));
}
