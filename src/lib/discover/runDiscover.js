/**
 * Discover deal engine — search live listings, run the same analysis
 * pipeline as Analyse, filter by brief, rank by investment quality.
 *
 * Rules:
 * - Portal search = hard filters only (location, beds, price, type)
 * - Soft strategy cues rank after fetch — never Rightmove keyword AND
 * - BMV only via Land Registry undervalued flags (same as Analyse)
 * - AI never invents listings
 */
import { analyseProperty } from '../propertyIntelligence';
import { parseIntent, summarizeIntent, REGIONS } from './parseIntent';
import { searchLiveListings } from './searchListings';
import { scoreBriefMatch, briefMode, nameInvestmentBrief, isBmv } from './investmentBrief';
import { fetchListingMetadata } from '../fetchListing';

const MAX_ANALYSE = 20;
const PREFETCH_POOL = 48; // cards considered before picking analyse set

function floorAreaFromText(text = '') {
  if (!text) return null;
  const sqm = text.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*m|m²|sqm)\b/i);
  if (sqm) return Math.round(parseFloat(sqm[1].replace(/,/g, '')));
  const sqft = text.match(/([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*(?:ft|feet)|ft²)\b/i);
  if (sqft) return Math.round(parseFloat(sqft[1].replace(/,/g, '')) * 0.0929);
  return null;
}

function cardBlob(card) {
  return `${card.title || ''} ${card.summary || ''} ${card.propertySubType || ''} ${card.address || ''}`.toLowerCase();
}

function cardToMeta(card) {
  const blob = `${card.title || ''} ${card.summary || ''} ${card.propertySubType || ''}`;
  const floorArea = card.floorArea ?? floorAreaFromText(blob);
  return {
    fetched: true,
    source: 'rightmove-search',
    title: card.title,
    description: blob.trim(),
    price: card.price,
    beds: card.beds,
    baths: card.baths,
    propertyType: card.propertyType,
    address: card.address,
    postcode: card.postcode,
    tenure: card.tenure,
    listingType: 'sale',
    image: card.image,
    images: card.images?.length ? card.images : (card.image ? [card.image] : []),
    agent: card.agent,
    priceLabel: card.priceLabel,
    floorArea,
    epc: card.epc || null,
  };
}

function cardToParsed(card) {
  return {
    valid: true,
    portal: card.portal || 'Rightmove',
    listingId: card.listingId,
    city: null,
    postcode: card.postcode,
  };
}

function investmentRating(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Weak';
}

/** Cheap hard filters on search cards before expensive analyse */
function passesCardHardFilters(card, intent) {
  if (intent.maxPrice != null && card.price != null && card.price > intent.maxPrice) return false;
  if (intent.minPrice != null && card.price != null && card.price < intent.minPrice) return false;
  if (intent.minBedrooms != null && card.beds != null && card.beds < intent.minBedrooms) return false;
  if (intent.propertyTypes?.length && card.propertyType) {
    const type = String(card.propertyType).toLowerCase();
    const ok = intent.propertyTypes.some((t) => (
      type.includes(t)
      || (t === 'house' && /terraced|semi|detached|house|bungalow/.test(type))
      || (t === 'flat' && /flat|apartment|maisonette|studio/.test(type))
    ));
    if (!ok) return false;
  }
  return true;
}

/**
 * Score search cards for analyse priority using soft rankHints + novelty.
 * Higher = analyse first.
 */
function preRankCard(card, intent) {
  let score = 0;
  const blob = cardBlob(card);
  const hints = intent.rankHints || [];

  for (const hint of hints) {
    if (blob.includes(hint.toLowerCase())) score += 8;
  }

  // Penalise obvious turn-key marketing on refurb briefs
  const isRefurb = intent.strategy === 'flip' || intent.boosts?.preferRefurb;
  if (isRefurb) {
    if (/\b(?:newly|recently|fully)\s+refurbished\b|\bimmaculately presented\b|\bno(?:\s+onward)?\s+chain\b.*\b(?:immaculate|refurbished|modern)\b|\bbeautifully presented\b/i.test(blob)
      && !/needs|require|dated|modernis|tlc|updating/i.test(blob)) {
      score -= 20;
    }
    if (/needs modern|in need of|dated|tlc|updating|refurbishment opportunity|doer.?upper/i.test(blob)) {
      score += 18;
    }
  }

  if (card.beds != null && intent.minBedrooms != null && card.beds >= intent.minBedrooms) score += 4;
  if (card.price != null && intent.maxPrice != null && card.price <= intent.maxPrice) score += 3;
  if (card.listedAt && Date.now() - card.listedAt < 72 * 3600 * 1000) score += 3;

  return score;
}

async function enrichMetaFromListing(card) {
  const base = cardToMeta(card);
  if (!card.url) return base;
  try {
    const result = await fetchListingMetadata(card.url);
    if (!result?.ok || !result.meta) return base;
    const m = result.meta;
    return {
      ...base,
      fetched: true,
      source: m.source || base.source,
      title: m.title || base.title,
      description: [m.description, base.description].filter(Boolean).join('\n').slice(0, 8000),
      price: m.price || base.price,
      beds: m.beds ?? base.beds,
      baths: m.baths ?? base.baths,
      propertyType: m.propertyType || base.propertyType,
      address: m.address || base.address,
      postcode: m.postcode || base.postcode,
      tenure: m.tenure || base.tenure,
      image: m.image || base.image,
      images: (m.images?.length ? m.images : base.images) || [],
      agent: m.agent || base.agent,
      priceLabel: m.priceLabel || base.priceLabel,
      floorArea: m.floorArea ?? base.floorArea,
      epc: m.epc || base.epc,
    };
  } catch {
    return base;
  }
}

async function analyseCard(card, strategyOverride = null) {
  try {
    const meta = await enrichMetaFromListing(card);
    const property = await analyseProperty({
      url: card.url,
      id: card.id,
      meta,
      parsed: cardToParsed(card),
      strategyOverride,
    });
    return {
      ...property,
      title: meta.title || property.name,
      description: meta.description || '',
      listedAt: card.listedAt,
      addedOrReduced: card.addedOrReduced,
      discoverSource: 'live-search',
    };
  } catch (err) {
    return { error: err.message, card };
  }
}

function confidenceOf(property, intent) {
  if (intent?.strategy === 'flip' || intent?.boosts?.preferRefurb) {
    if (property.comparables?.available && property.condition?.overall !== 'Unknown') return 'High';
    if (property.comparables?.available) return 'Medium';
    return 'Low';
  }
  if (property.comparables?.available && property.rentEstimate?.confidence === 'high') return 'High';
  if (property.comparables?.available || property.hasLiveData) return 'Medium';
  return 'Low';
}

/**
 * Refurb briefs: keep real projects / real BMV.
 * Drop turn-key Good homes unless Land Registry says undervalued.
 * Cap Unknown holdouts — they are last resort, not the product.
 */
function passesRefurbFilter(property, intent) {
  if (!(intent?.strategy === 'flip' || intent?.boosts?.preferRefurb)) return true;
  const cond = property.condition?.overall;
  const bmv = isBmv(property);
  if (cond === 'Poor' || cond === 'Fair') return true;
  if (bmv) return true;
  if (cond === 'Good') return false;
  // Unknown: keep only if there is at least a weak project cue in listing text
  const text = `${property.description || ''} ${property.title || ''}`.toLowerCase();
  return /modernis|moderniz|refurb|renovat|dated|tired|tlc|updating|needs work|in need|doer|project|cash buyer/i.test(text);
}

/** Rank by investment quality + brief boosts */
export function rankOpportunity(property, intent) {
  let score = property.score || 0;
  const yieldPct = property.deal?.grossYield ?? 0;
  const cashFlow = property.deal?.monthlyCashFlow ?? 0;
  const discount = property.comparables?.deviationPct;
  const growth = property.areaIntel?.priceGrowth
    ? parseFloat(String(property.areaIntel.priceGrowth).replace(/[^\d.]/g, '')) || 0
    : 0;
  const isRefurb = intent?.strategy === 'flip' || intent?.boosts?.preferRefurb;
  const bmv = isBmv(property);

  if (isRefurb) {
    if (bmv && discount != null) score += Math.min(28, Math.abs(discount) * 1.4);
    else if (discount != null && discount > 5) score -= 12;

    const cond = property.condition?.overall;
    if (cond === 'Poor') score += 24;
    else if (cond === 'Fair') score += 16;
    else if (cond === 'Good') score -= 22;
    else score -= 6; // Unknown

    if (property.flip?.uplift != null && property.flip.uplift > 0) {
      score += Math.min(18, property.flip.uplift / 6000);
    } else if (property.flip?.uplift != null && property.flip.uplift < 0) {
      score -= 10;
    }
    score += Math.min(6, growth / 5);
  } else {
    score += Math.min(20, yieldPct * 1.5);
    if (cashFlow > 0) score += Math.min(12, cashFlow / 40);
    if (cashFlow < 0) score -= 8;
    if (bmv && discount != null) score += Math.min(15, Math.abs(discount) * 0.7);
    if (discount != null && discount > 10) score -= 10;
    score += Math.min(8, growth / 4);
  }

  const b = intent?.boosts || {};
  if (b.preferHighYield && !isRefurb) score += yieldPct * 0.8;
  if (b.preferBmv && bmv) score += 10;
  if (b.preferRefurb && (property.condition?.overall === 'Poor' || property.condition?.overall === 'Fair')) {
    score += 12;
  }
  if (b.preferGrowth) score += growth * 0.3;
  if (b.preferStudent && (property.beds || 0) >= 3) score += 6;
  if (b.preferMultiBed && (property.beds || 0) >= 4) score += 5;
  if (intent?.strategy && property.strategyKey === intent.strategy) score += 10;
  if (!isRefurb && intent?.minGrossYield && yieldPct >= intent.minGrossYield) score += 10;

  if (property.listedAt && Date.now() - property.listedAt < 48 * 3600 * 1000) score += 4;

  return score;
}

function whyMatches(property, intent) {
  const reasons = [];
  const y = property.deal?.grossYield;
  const cf = property.deal?.monthlyCashFlow;
  const disc = property.comparables?.deviationPct;
  const isRefurb = intent?.strategy === 'flip' || intent?.boosts?.preferRefurb;
  const bmv = isBmv(property);

  if (intent.location && `${property.location} ${property.address}`.toLowerCase().includes(intent.location.toLowerCase())) {
    reasons.push(`In ${intent.location}`);
  }

  if (isRefurb) {
    if (property.condition?.overall === 'Poor' || property.condition?.overall === 'Fair') {
      reasons.push(`${property.condition.overall} condition — refurb angle`);
    } else if (property.condition?.overall === 'Unknown') {
      reasons.push('Few photo/text cues — confirm condition on viewing');
    }
    if (bmv && disc != null) {
      reasons.push(`${Math.abs(disc)}% below sold median`);
    }
    if (property.flip?.works) {
      reasons.push(`Works ~£${property.flip.works.toLocaleString()}`);
    }
    if (property.flip?.uplift != null && property.flip.uplift > 0) {
      reasons.push(`Uplift ~£${property.flip.uplift.toLocaleString()} vs GDV`);
    }
    reasons.push('Refurb & Flip');
    return reasons.slice(0, 4);
  }

  if (intent.minGrossYield != null && y != null) {
    if (y >= intent.minGrossYield) reasons.push(`${y}% yield meets ${intent.minGrossYield}%+ target`);
    else reasons.push(`${y}% yield vs ${intent.minGrossYield}% target`);
  } else if (y != null) {
    reasons.push(`${y}% gross yield`);
  }
  if (intent.maxPrice != null && property.price <= intent.maxPrice) {
    reasons.push(`£${property.price.toLocaleString()} within budget`);
  }
  if (cf != null && cf > 0) reasons.push(`+£${cf.toLocaleString()}/mo cash flow`);
  if (bmv && disc != null) reasons.push(`${Math.abs(disc)}% below sold median`);
  if (intent.strategyLabel && property.strategy) reasons.push(property.strategy);

  return reasons.slice(0, 4);
}

function passesYieldFilter(property, intent) {
  if (intent.minGrossYield == null) return true;
  if (intent.strategy === 'flip' || intent.boosts?.preferRefurb) return true;
  const y = property.deal?.grossYield ?? parseFloat(property.rental?.grossYield || '0');
  // Only hard-cut when rent confidence is high; otherwise keep and let match % show it
  if (property.rentEstimate?.confidence === 'high') {
    return y >= intent.minGrossYield * 0.9;
  }
  return true;
}

function passesScoreFilter(property, intent) {
  if (intent.minScore == null) return true;
  return (property.score || 0) >= intent.minScore;
}

function passesHardPropertyFilters(property, intent) {
  if (intent.maxPrice != null && property.price > intent.maxPrice) return false;
  if (intent.minPrice != null && property.price < intent.minPrice) return false;
  if (intent.minBedrooms != null && property.beds != null && property.beds < intent.minBedrooms) return false;
  return true;
}

/**
 * Run a full Discover search.
 */
export async function runDiscover(query, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const maxAnalyse = opts.maxAnalyse ?? MAX_ANALYSE;

  const intent = parseIntent(query);
  onProgress({ phase: 'parse', intent, chips: summarizeIntent(intent) });

  // Region-only / region label: expand to a real search town
  const regionKeys = new Set(Object.keys(REGIONS));
  if (intent.regions.length && (!intent.location || regionKeys.has(String(intent.location).toLowerCase()))) {
    const first = REGIONS[intent.regions[0]]?.[0];
    if (first) intent.location = first.charAt(0).toUpperCase() + first.slice(1);
  }

  if (!intent.location && !intent.cities.length) {
    return {
      ok: false,
      error: 'Include a UK town, city, area or postcode — e.g. “3 bed houses in Little Chalfont under £500k”',
      intent,
      chips: summarizeIntent(intent),
      opportunities: [],
      resultCount: 0,
      analysedCount: 0,
      filteredOut: 0,
    };
  }

  const strategyOverride = intent.strategy || null;
  const isRefurb = strategyOverride === 'flip' || intent.boosts?.preferRefurb;
  const analyseMsg = isRefurb
    ? `Scoring renovation angles on up to ${maxAnalyse} listings…`
    : `Analysing up to ${maxAnalyse} listings…`;

  onProgress({ phase: 'search', message: `Searching live listings in ${intent.location}…` });
  const search = await searchLiveListings(intent);

  if (!search.ok || !search.cards?.length) {
    return {
      ok: false,
      error: search.error || 'No live listings found for this brief — try a nearby town or wider budget',
      intent,
      chips: summarizeIntent(intent),
      opportunities: [],
      resultCount: search.resultCount || 0,
      analysedCount: 0,
      filteredOut: 0,
      searchMeta: search,
    };
  }

  // Hard filter + pre-rank before spending analyse budget
  const eligible = search.cards
    .filter((c) => passesCardHardFilters(c, intent))
    .map((c) => ({ card: c, pre: preRankCard(c, intent) }))
    .sort((a, b) => b.pre - a.pre)
    .slice(0, PREFETCH_POOL);

  const slice = eligible.slice(0, maxAnalyse).map((x) => x.card);

  if (!slice.length) {
    return {
      ok: false,
      error: `Found ${search.resultCount.toLocaleString()} listings in ${intent.location}, but none matched beds / price / type filters from your brief`,
      intent,
      chips: summarizeIntent(intent),
      opportunities: [],
      resultCount: search.resultCount || 0,
      analysedCount: 0,
      filteredOut: 0,
      searchMeta: search,
    };
  }

  onProgress({
    phase: 'analyse',
    message: `${analyseMsg} (${search.resultCount.toLocaleString()} on portal · ${slice.length} shortlisted)`,
    total: slice.length,
    done: 0,
  });

  const analysed = [];
  const batchSize = 4;
  for (let i = 0; i < slice.length; i += batchSize) {
    const batch = slice.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((card) => analyseCard(card, strategyOverride)));
    for (const r of results) {
      if (r && !r.error) analysed.push(r);
    }
    onProgress({
      phase: 'analyse',
      done: Math.min(i + batchSize, slice.length),
      total: slice.length,
      message: `Analysed ${Math.min(i + batchSize, slice.length)} / ${slice.length}`,
    });
  }

  const afterHard = analysed.filter((p) => passesHardPropertyFilters(p, intent));
  const afterStrategy = afterHard
    .filter((p) => passesYieldFilter(p, intent))
    .filter((p) => passesScoreFilter(p, intent))
    .filter((p) => passesRefurbFilter(p, intent));

  // For refurb: prefer real condition hits; allow a few Unknown with cues (already filtered)
  let candidates = afterStrategy;
  if (isRefurb) {
    const strong = afterStrategy.filter((p) => p.condition?.overall === 'Poor' || p.condition?.overall === 'Fair' || isBmv(p));
    const weak = afterStrategy.filter((p) => !(p.condition?.overall === 'Poor' || p.condition?.overall === 'Fair' || isBmv(p)));
    candidates = [...strong, ...weak.slice(0, 4)];
  }

  const filteredOut = analysed.length - candidates.length;

  const opportunities = candidates
    .map((property) => {
      const { matchPct, checklist } = scoreBriefMatch(property, intent);
      return {
        property,
        rankScore: rankOpportunity(property, intent) + matchPct * 0.4,
        matchPct,
        checklist,
        reasons: checklist.filter((c) => c.ok).map((c) => c.text).slice(0, 5),
        warnings: checklist.filter((c) => !c.ok).map((c) => c.text).slice(0, 4),
        rating: investmentRating(property.score),
        confidence: confidenceOf(property, intent),
        mode: briefMode(intent),
      };
    })
    .filter((o) => o.matchPct >= 35) // drop obvious non-fits instead of pretending
    .sort((a, b) => (b.matchPct - a.matchPct) || (b.rankScore - a.rankScore));

  onProgress({ phase: 'done', count: opportunities.length });

  const briefName = nameInvestmentBrief(intent, query);

  let error = null;
  if (!opportunities.length) {
    error = analysed.length
      ? `Analysed ${analysed.length} listings but none fitted this brief tightly enough. Try widening beds/budget, or drop “needs modernising” if you want turn-key stock.`
      : 'Could not analyse listings for this brief — try again in a moment';
  }

  return {
    ok: opportunities.length > 0,
    intent,
    briefName,
    chips: summarizeIntent(intent),
    opportunities,
    analysedCount: analysed.length,
    filteredOut,
    resultCount: search.resultCount,
    searchMeta: {
      location: search.location,
      source: search.source,
      searchUrl: search.searchUrl,
      shortlisted: slice.length,
    },
    error,
    ranAt: Date.now(),
  };
}

export { summarizeIntent, parseIntent, investmentRating, confidenceOf, whyMatches, scoreBriefMatch, nameInvestmentBrief };
