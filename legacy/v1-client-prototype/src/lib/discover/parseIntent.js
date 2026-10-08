/**
 * Intent parser — converts natural-language investment briefs into
 * structured search filters. Deterministic (no LLM).
 *
 * Portal search uses HARD filters only (location, beds, price, type).
 * Soft strategy cues (modernising, plot, extend) are ranking hints —
 * never Rightmove keyword AND traps.
 */

const CITIES = [
  'manchester', 'birmingham', 'leeds', 'sheffield', 'liverpool', 'bristol',
  'nottingham', 'newcastle', 'london', 'cardiff', 'edinburgh', 'glasgow',
  'leicester', 'cambridge', 'oxford', 'reading', 'southampton', 'plymouth',
  'bradford', 'coventry', 'hull', 'stoke', 'wolverhampton', 'derby',
  'milton keynes', 'watford', 'amersham', 'chesham', 'high wycombe',
  'beaconsfield', 'aylesbury', 'slough', 'maidenhead', 'guildford',
  'brighton', 'bath', 'york', 'norwich', 'exeter', 'bournemouth',
  'cheltenham', 'swindon', 'luton', 'bedford', 'hemel hempstead',
  'st albans', 'rickmansworth', 'chorleywood', 'gerrards cross',
  'little chalfont', 'chalfont st peter', 'chalfont st giles',
];

const REGIONS = {
  north: ['manchester', 'liverpool', 'leeds', 'sheffield', 'newcastle', 'bradford', 'hull'],
  midlands: ['birmingham', 'nottingham', 'leicester', 'coventry', 'stoke', 'wolverhampton', 'derby'],
  south: ['london', 'bristol', 'reading', 'southampton', 'oxford', 'cambridge'],
  scotland: ['edinburgh', 'glasgow'],
  wales: ['cardiff'],
};

const WORD_BEDS = {
  studio: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

/** Words that are never part of a place name when stripping free-form locations */
const LOCATION_NOISE = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'near', 'around',
  'within', 'across', 'with', 'that', 'which', 'who', 'from', 'into', 'by', 'my', 'our',
  'some', 'any', 'looking', 'look', 'find', 'show', 'me', 'want', 'need', 'needs', 'needing',
  'seeking', 'search', 'searching', 'please', 'get', 'give',
  'properties', 'property', 'homes', 'home', 'house', 'houses', 'flat', 'flats',
  'apartment', 'apartments', 'studio', 'studios', 'bungalow', 'bungalows', 'terraced',
  'terrace', 'semi', 'detached', 'maisonette', 'maisonettes', 'cottage', 'cottages',
  'bed', 'beds', 'bedroom', 'bedrooms', 'bath', 'baths', 'bathroom', 'bathrooms',
  'buy', 'let', 'btl', 'hmo', 'brrrr', 'brrr', 'refurb', 'refurbishment', 'flip',
  'renovation', 'renovating', 'renovat', 'investment', 'invest', 'investor', 'rental',
  'rent', 'yield', 'yields', 'gross', 'cash', 'flow', 'market', 'below', 'under', 'over',
  'above', 'max', 'maximum', 'min', 'minimum', 'up', 'cheap', 'bargain', 'bmv',
  'modernising', 'modernizing', 'modernisation', 'modernization', 'modernise', 'modernize',
  'extension', 'extend', 'plot', 'garden', 'gardens', 'student', 'university', 'uni',
  'family', 'long', 'term', 'growth', 'positive', 'monthly', 'returns', 'pcm', 'sale',
  'auction', 'doer', 'upper', 'project', 'potential', 'work', 'dated', 'tired', 'update',
  'large', 'good', 'sized', 'big', 'generous', 'rear', 'outdoor', 'space', 'scope',
  'planning', 'appreciation', 'capital', 'price', 'prices', 'score', 'high', 'low',
  'crime', 'safe', 'quiet', 'schools', 'amenities', 'transport', 'station', 'commuter',
  'connectivity', 'tenant', 'demand', 'reliable', 'strong', 'easily', 'easy', 'passive',
  'income', 'undervalued', 'asking', 'value', 'add', 'increase', 'improve', 'sell',
  'profit', 'rebuild', 'demo', 'development', 'knock', 'down', 'multi', 'share',
  'uk', 'region', 'regions', 'area', 'areas', 'town', 'city', 'village', 'county',
  'england', 'scotland', 'wales', 'britain', 'british', 'northern', 'ireland',
  'three', 'two', 'one', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'least', 'most', 'plus', 'percent', 'pct', 'k', 'based', 'something', 'somewhere',
  'opportunities', 'opportunity', 'where', 'can', 'would', 'make', 'after', 'have',
]);

function titleCasePlace(s) {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/^(upon|and|on|the|le|la|de|st)$/i.test(w)) {
        return w.toLowerCase() === 'st' ? 'St' : w.toLowerCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/** UK full postcode or outcode */
function extractPostcodeLocation(q) {
  const full = q.match(/\b([a-z]{1,2}\d{1,2}[a-z]?\s*\d[a-z]{2})\b/i);
  if (full) return full[1].toUpperCase().replace(/\s+/, ' ');
  const out = q.match(/\b([a-z]{1,2}\d{1,2}[a-z]?)\b/i);
  if (out) return out[1].toUpperCase();
  return null;
}

function extractFreeformLocation(q) {
  const pc = extractPostcodeLocation(q);
  if (pc) return pc;

  const prep = q.match(
    /\b(?:in|near|around|within|across|based\s+in|looking\s+in)\s+([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,4})/i,
  );
  if (prep) {
    let place = prep[1].trim();
    const cut = place.search(/\s+(?:under|over|below|above|with|that|which|for|up|max|min|at|needing|need|£|\d)/i);
    if (cut > 0) place = place.slice(0, cut).trim();
    const words = place.split(/\s+/).filter((w) => !LOCATION_NOISE.has(w.toLowerCase()));
    if (words.length >= 1 && words.join(' ').length >= 3) {
      return titleCasePlace(words.join(' '));
    }
  }

  let rest = q
    .replace(/£\s*[\d,]+(?:\s*k)?/gi, ' ')
    .replace(/\b[\d,]+\s*k\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*%/gi, ' ')
    .replace(/\b(?:one|two|three|four|five|six|seven|eight|studio|\d+)\s*-?\s*beds?(?:rooms?)?\b/gi, ' ')
    .replace(/\b(?:under|over|below|above|max(?:imum)?|min(?:imum)?|up\s+to|at\s+least)\b/gi, ' ')
    .replace(/\b(?:buy[-\s]?to[-\s]?let|doer[-\s]?upper|semi[-\s]?detached|value[-\s]?add|cash[-\s]?flow|below[-\s]?market)\b/gi, ' ')
    .replace(/[^a-z\s'\-]/gi, ' ');

  rest = rest
    .split(/\s+/)
    .filter((w) => w && !LOCATION_NOISE.has(w.toLowerCase()) && !/^\d+$/.test(w))
    .join(' ')
    .trim();

  const words = rest.split(/\s+/).filter(Boolean);
  if (words.length >= 1 && words.length <= 5 && rest.length >= 3) {
    if (words.every((w) => LOCATION_NOISE.has(w.toLowerCase()))) return null;
    return titleCasePlace(rest);
  }
  return null;
}

function parseBedrooms(q) {
  const bedsPlus = q.match(/(?:at\s+least|min(?:imum)?)\s+(\d+)\s*-?\s*beds?|(\d+)\s*\+\s*beds?|(\d+)\s*beds?\s*\+/i);
  if (bedsPlus) {
    return parseInt(bedsPlus[1] || bedsPlus[2] || bedsPlus[3], 10);
  }

  const digit = q.match(/\b(\d+)\s*-?\s*beds?(?:rooms?)?\b/i);
  if (digit) return parseInt(digit[1], 10);

  const word = q.match(
    /\b(studio|one|two|three|four|five|six|seven|eight)\s*-?\s*(?:bed(?:room)?s?|bed)\b/i,
  );
  if (word) {
    const key = word[1].toLowerCase();
    return WORD_BEDS[key] ?? null;
  }

  if (/\bstudio\b/i.test(q)) return 0;
  return null;
}

const PROPERTY_TYPES = {
  flat: /\bflats?\b|\bapartments?\b|\bstudios?\b|\bmaisonettes?\b/i,
  house: /\bhouses?\b|\bhomes?\b|\bfamily home/i,
  terraced: /\bterraced?\b|\bterraces?\b/i,
  semi: /\bsemis?\b|\bsemi[- ]?detached\b/i,
  detached: /\bdetached\b/i,
  bungalow: /\bbungalows?\b/i,
};

const RM_TYPES = {
  flat: 'flat',
  terraced: 'terraced',
  semi: 'semi-detached',
  detached: 'detached',
  bungalow: 'bungalow',
  house: 'terraced,semi-detached,detached',
  studio: 'flat',
};

function parseMoney(raw, suffix) {
  if (!raw) return null;
  const n = parseInt(String(raw).replace(/,/g, ''), 10);
  if (Number.isNaN(n)) return null;
  if (suffix === 'k' || (n < 1000 && !suffix)) return n * 1000;
  return n;
}

function extractBoosts(q) {
  const boosts = {
    preferHighYield: false,
    preferBmv: false,
    preferRefurb: false,
    preferGrowth: false,
    preferStudent: false,
    preferMultiBed: false,
    preferSchools: false,
    preferLowCrime: false,
    preferPlot: false,
    preferExtend: false,
    preferModernise: false,
    preferCashFlow: false,
    preferRentalDemand: false,
  };

  if (/cheap|bargain|under.?market|bmv|below market|below.?asking/i.test(q)) boosts.preferBmv = true;
  if (/high.?yield|cash.?flow|passive income|monthly returns?/i.test(q)) {
    boosts.preferHighYield = true;
    boosts.preferCashFlow = true;
  }
  if (/positive monthly|monthly cash|good monthly/i.test(q)) boosts.preferCashFlow = true;
  if (/tenant demand|rental demand|reliable tenant|strong rental|let easily|easy to let/i.test(q)) {
    boosts.preferRentalDemand = true;
    boosts.preferHighYield = true;
  }
  if (/brrrr?|refurb|flip|renovation|renovat|doer.?upper|project|modernis|moderniz|value.?add|add value|increase.{0,24}value|improve.{0,20}sell|sell for a profit|needs work|dated|tired/i.test(q)) {
    boosts.preferRefurb = true;
  }
  if (/modernis|moderniz|needs work|dated|tired|update|needs modern/i.test(q)) {
    boosts.preferModernise = true;
    boosts.preferRefurb = true;
  }
  if (/large.?plot|good.?sized plot|big plot|generous plot|large garden|good.?sized garden|rear garden|outdoor space/i.test(q)) {
    boosts.preferPlot = true;
  }
  if (/extend|extension|potential to extend|scope to extend/i.test(q)) {
    boosts.preferExtend = true;
    boosts.preferRefurb = true;
  }
  if (/appreciation|long.?term|capital growth|family home|price growth/i.test(q)) boosts.preferGrowth = true;
  if (/student|university|uni\b/i.test(q)) {
    boosts.preferStudent = true;
    boosts.preferMultiBed = true;
    boosts.preferHighYield = true;
  }
  if (/school|family|amenities/i.test(q)) boosts.preferSchools = true;
  if (/safe|low crime|quiet/i.test(q)) boosts.preferLowCrime = true;
  if (/hmo|multi.?let|house.?share/i.test(q)) boosts.preferMultiBed = true;
  if (/transport|station|commuter|connectivity/i.test(q)) boosts.preferGrowth = true;

  return boosts;
}

/**
 * Soft listing-text cues used to pre-rank cards before full analysis.
 * Never sent to Rightmove as keywords.
 */
function buildRankHints(boosts, strategy) {
  const hints = [];
  if (boosts.preferRefurb || boosts.preferModernise || strategy === 'flip') {
    hints.push('modernis', 'moderniz', 'refurb', 'renovat', 'doer', 'tlc', 'updating', 'dated', 'tired', 'needs work', 'in need');
  }
  if (boosts.preferExtend) hints.push('extend', 'extension', 'planning');
  if (boosts.preferPlot) hints.push('garden', 'plot', 'grounds', 'acre');
  if (boosts.preferStudent) hints.push('student', 'university', 'uni');
  if (boosts.preferBmv) hints.push('reduced', 'auction', 'motivated');
  return [...new Set(hints)];
}

/**
 * @returns {object} Structured filters for search + ranking
 */
export function parseIntent(query) {
  const q = (query || '').toLowerCase();
  if (!q.trim()) {
    return emptyIntent(query);
  }

  const yieldMatch = q.match(/(\d+(?:\.\d+)?)\s*%\+?\s*(?:gross\s+)?yield|yield[^\d]*(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*\+/);
  // Only set yield floor when the user stated a number — never invent 7%
  const minGrossYield = yieldMatch ? parseFloat(yieldMatch[1] || yieldMatch[2] || yieldMatch[3]) : null;

  const maxBudgetMatch = q.match(/under\s*£?\s*([\d,]+)\s*(k)?|below\s*£?\s*([\d,]+)\s*(k)?|max(?:imum)?\s*£?\s*([\d,]+)\s*(k)?|up\s*to\s*£?\s*([\d,]+)\s*(k)?/i);
  let maxPrice = null;
  if (maxBudgetMatch) {
    const idx = [1, 3, 5, 7].find((i) => maxBudgetMatch[i]);
    maxPrice = parseMoney(maxBudgetMatch[idx], maxBudgetMatch[idx + 1]);
  }

  const minBudgetMatch = q.match(/over\s*£?\s*([\d,]+)\s*(k)?|above\s*£?\s*([\d,]+)\s*(k)?|min(?:imum)?\s*£?\s*([\d,]+)\s*(k)?/i);
  let minPrice = null;
  if (minBudgetMatch) {
    const idx = [1, 3, 5].find((i) => minBudgetMatch[i]);
    minPrice = parseMoney(minBudgetMatch[idx], minBudgetMatch[idx + 1]);
  }

  let minBedrooms = parseBedrooms(q);

  const scoreMatch = q.match(/score\s*(\d+)\+|(\d+)\+\s*score|investment\s*score\s*(\d+)/i);
  const minScore = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2] || scoreMatch[3], 10) : null;

  const cities = CITIES
    .filter((c) => {
      const re = new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i');
      return re.test(q);
    })
    .sort((a, b) => b.length - a.length);
  const regions = Object.keys(REGIONS).filter((r) => new RegExp(`\\b${r}\\b`, 'i').test(q));

  let propertyTypes = Object.keys(PROPERTY_TYPES).filter((t) => PROPERTY_TYPES[t].test(q));
  if (propertyTypes.includes('terraced') || propertyTypes.includes('semi') || propertyTypes.includes('detached')) {
    propertyTypes = propertyTypes.filter((t) => t !== 'house');
  }

  let strategy = null;
  if (/\bhmo\b|house in multiple|multi.?let|student/i.test(q)) strategy = 'hmo';
  else if (/brrrr?|refurb|flip|renovation|renovat|doer.?upper|modernis|moderniz|extend|value.?add|increase.{0,24}value|improve.{0,20}sell|sell for a profit|needs work|dated/i.test(q)) strategy = 'flip';
  else if (/buy.to.let|btl|rental income|let out|rental investment|tenant demand|monthly returns?/i.test(q)) strategy = 'btl';
  else if (/demo|rebuild|development site|knock.?down/i.test(q)) strategy = 'demo';
  else if (/appreciation|family home|long.?term/i.test(q)) strategy = 'btl';

  const boosts = extractBoosts(q);

  if (boosts.preferStudent && minBedrooms == null) minBedrooms = 3;
  if (boosts.preferMultiBed && minBedrooms == null) minBedrooms = 3;
  if (boosts.preferStudent && propertyTypes.length === 0) {
    propertyTypes = ['house'];
  }
  if (strategy === 'flip' && propertyTypes.length === 0 && /\bhouse|home\b/i.test(q)) {
    propertyTypes = ['house'];
  }

  let location = null;
  if (cities[0]) {
    location = titleCasePlace(cities[0]);
  } else if (regions[0]) {
    // Don't set location to "North"/"Midlands" — expand in runDiscover
    location = null;
  } else {
    location = extractFreeformLocation(q);
  }

  // Portal keywords: ONLY explicit auction — soft strategy cues stay as rankHints
  const keywords = [];
  if (/\bauction\b/i.test(q)) keywords.push('auction');

  const rankHints = buildRankHints(boosts, strategy);

  return {
    raw: query,
    location,
    cities,
    regions,
    propertyTypes,
    propertyType: propertyTypes[0]
      ? propertyTypes[0].charAt(0).toUpperCase() + propertyTypes[0].slice(1)
      : null,
    maxPrice,
    minPrice,
    minBedrooms,
    minGrossYield,
    minScore,
    strategy,
    strategyLabel: strategy
      ? { btl: 'Buy to Let', hmo: 'HMO', flip: 'Refurb & Flip', demo: 'Development' }[strategy]
      : null,
    boosts,
    keywords,
    rankHints,
    listingChannel: /to rent|for rent|rental listing/i.test(q) ? 'rent' : 'sale',
    radius: null,
  };
}

function emptyIntent(query) {
  return {
    raw: query || '',
    location: null,
    cities: [],
    regions: [],
    propertyTypes: [],
    propertyType: null,
    maxPrice: null,
    minPrice: null,
    minBedrooms: null,
    minGrossYield: null,
    minScore: null,
    strategy: null,
    strategyLabel: null,
    boosts: extractBoosts(''),
    keywords: [],
    rankHints: [],
    listingChannel: 'sale',
    radius: null,
  };
}

/** Human-readable chips for the UI */
export function summarizeIntent(intent) {
  if (!intent) return [];
  const chips = [];
  if (intent.location) chips.push(intent.location);
  else if (intent.regions?.length) chips.push(...intent.regions.map((r) => r.charAt(0).toUpperCase() + r.slice(1)));
  if (intent.propertyType) chips.push(intent.propertyType);
  else if (intent.propertyTypes?.length) chips.push(intent.propertyTypes.join(', '));
  if (intent.maxPrice != null) chips.push(`Under £${intent.maxPrice.toLocaleString()}`);
  if (intent.minPrice != null) chips.push(`Over £${intent.minPrice.toLocaleString()}`);
  if (intent.minBedrooms != null) chips.push(`${intent.minBedrooms}+ beds`);
  if (intent.minGrossYield != null) chips.push(`${intent.minGrossYield}%+ yield`);
  if (intent.minScore != null) chips.push(`Score ${intent.minScore}+`);
  if (intent.strategyLabel) chips.push(intent.strategyLabel);
  if (intent.boosts?.preferBmv) chips.push('Below market');
  if (intent.boosts?.preferRefurb) chips.push('Renovation angle');
  if (intent.boosts?.preferModernise) chips.push('Needs modernising');
  if (intent.boosts?.preferPlot) chips.push('Large plot');
  if (intent.boosts?.preferExtend) chips.push('Extension potential');
  if (intent.boosts?.preferStudent) chips.push('Student / near uni');
  if (intent.boosts?.preferGrowth) chips.push('Long-term growth');
  if (intent.boosts?.preferCashFlow) chips.push('Positive cash flow');
  if (intent.boosts?.preferRentalDemand) chips.push('Strong rental demand');
  return chips;
}

/** Map intent → Rightmove find.html query params (hard filters only) */
export function intentToSearchParams(intent) {
  const params = {
    channel: intent.listingChannel === 'rent' ? 'rent' : 'sale',
    location: intent.location || intent.cities?.[0] || intent.regions?.[0] || null,
    maxPrice: intent.maxPrice,
    minPrice: intent.minPrice,
    minBedrooms: intent.minBedrooms,
    propertyTypes: (intent.propertyTypes || [])
      .map((t) => RM_TYPES[t])
      .filter(Boolean)
      .join(',') || null,
    keywords: intent.keywords?.length ? intent.keywords.join(' ') : null,
  };
  return params;
}

export { CITIES, REGIONS, RM_TYPES, parseBedrooms };
