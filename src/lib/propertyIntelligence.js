/**
 * Analysis pipeline orchestrator.
 *
 * Golden rule: nothing here invents property data. Every number comes from:
 *  - the live listing (extraction)
 *  - real external datasets (HM Land Registry, postcodes.io)
 *  - deterministic calculation (finance, score, refurb rules)
 * The "AI summary" is a deterministic analyst narrative that only cites
 * values computed above it. Missing data is reported as Unknown.
 */
import { resolveLocation } from './ukMarketData';
import { getInvestorPrefs } from './investor';
import { getMarketData } from './engine/marketData';
import { computeDealFinancials } from './engine/finance';
import { classifyCondition, mergeCondition } from './engine/condition';
import { classifyConditionFromImages } from './engine/visionCondition';
import { analyseComparables } from './engine/comparables';
import { estimateRent } from './engine/rental';
import { computeInvestmentScore, scoreGrade } from './engine/score';
import { scoreBriefMatch } from './discover/investmentBrief';

export { scoreGrade };

const PROPERTY_TYPES = {
  studio: { emoji: '🛋️', hmo: false },
  flat: { emoji: '🏢', hmo: false },
  terraced: { emoji: '🏘️', hmo: true },
  semi: { emoji: '🏡', hmo: true },
  detached: { emoji: '🏠', hmo: false },
  bungalow: { emoji: '🏡', hmo: false },
  house: { emoji: '🏠', hmo: true },
};

const STRATEGIES = {
  btl: { label: 'Buy-to-Let', key: 'btl' },
  hmo: { label: 'HMO', key: 'hmo' },
  flip: { label: 'Refurb & Flip', key: 'flip' },
  demo: { label: 'Development', key: 'demo' },
};

const PREF_STRATEGY = {
  'buy-to-let': 'btl',
  btl: 'btl',
  hmo: 'hmo',
  flip: 'flip',
  brr: 'flip',
  development: 'demo',
};

export function inferPropertyType(title = '', description = '', beds = null) {
  const text = `${title} ${description}`.toLowerCase();

  if (/\bstudio\b/i.test(text)) return 'studio';
  if (/\bflat\b|\bapartment\b|\bmaisonette\b|\bpenthouse\b/i.test(text)) return 'flat';
  if (/\bterraced?\b|\bterrace\b/i.test(text)) return 'terraced';
  if (/\bsemi[- ]?detached\b/i.test(text)) return 'semi';
  if (/\bdetached\b/i.test(text) && !/semi/i.test(text)) return 'detached';
  if (/\bbungalow\b/i.test(text)) return 'bungalow';
  if (/\bhouse\b/i.test(text)) return 'house';
  if (beds === 1 && !/\bhouse\b/i.test(text)) return 'flat';
  if (beds >= 4) return 'terraced';
  return 'house';
}

export function inferStrategy({ title, description, beds, price, propertyType, cityMarket, preferredKey, condition }) {
  const text = `${title} ${description}`.toLowerCase();

  // Explicit brief / investor preference wins first (Discover "refurb opportunities" must not become HMO)
  if (preferredKey === 'flip') return STRATEGIES.flip;
  if (preferredKey === 'hmo') return STRATEGIES.hmo;
  if (preferredKey === 'btl') return STRATEGIES.btl;
  if (preferredKey === 'demo') return STRATEGIES.demo;

  if (/\bhmo\b|house in multiple|multi.?let/i.test(text)) return STRATEGIES.hmo;
  if (
    condition === 'Poor'
    || condition === 'Fair'
    || /\brefurb|renovation|doer.?upper|needs? (?:work|updating|modernisation)|in need of/i.test(text)
  ) {
    return STRATEGIES.flip;
  }
  if (/\bflip\b/i.test(text)) return STRATEGIES.flip;
  if (/\bdemolition\b|\brebuild\b|\bplot\b|\bplanning permission\b/i.test(text)) return STRATEGIES.demo;
  if (beds >= 4 && propertyType !== 'flat' && price < (cityMarket?.avgPrice || 250000) * 1.1) {
    return STRATEGIES.hmo;
  }
  return STRATEGIES.btl;
}

function flipEconomics({ price, comps, condition, refurbCost }) {
  const gdv = comps?.available && comps.median
    ? comps.median
    : null;
  const works = refurbCost || Math.round(((condition.refurbLow || 0) + (condition.refurbHigh || 0)) / 2);
  const totalIn = price + works;
  const uplift = gdv != null ? gdv - totalIn : null;
  const upliftPct = gdv != null && totalIn > 0
    ? Math.round((uplift / totalIn) * 1000) / 10
    : null;
  const discountPct = comps?.deviationPct != null ? -comps.deviationPct : null; // + = below market
  return {
    gdv,
    works,
    refurbLow: condition.refurbLow || 0,
    refurbHigh: condition.refurbHigh || 0,
    totalIn,
    uplift,
    upliftPct,
    discountPct,
    condition: condition.overall,
  };
}

/** Deterministic analyst narrative. Cites only values passed in — never new figures. */
function buildAnalystSummary({
  city, beds, propertyType, price, deal, comps, condition, rentEstimate, market, prefs, strategy,
  priceIsEstimated, priceEstimateSource, flip,
}) {
  const typeLabel = beds === 0 ? 'studio' : `${beds}-bed ${propertyType}`;
  const isFlip = strategy.key === 'flip';

  const priceBit = priceIsEstimated
    ? `is a rental listing — the modelled purchase price of £${price.toLocaleString()} comes from the ${priceEstimateSource}`
    : `is listed at £${price.toLocaleString()}`;
  const opening = isFlip
    ? `This ${typeLabel} in ${city} ${priceBit}. Assessed as a refurb / flip opportunity using live listing text, HM Land Registry sold comps, and a rule-based works estimate — not as a buy-to-let cash-flow play.`
    : `This ${typeLabel} in ${city} ${priceBit}. Valora read the live listing, pulled ${comps.available ? `${comps.count} sold transactions from HM Land Registry` : 'regional benchmarks'}, and ran a deterministic financial model.`;

  let yieldLine;
  let strategyLine;
  let valueLine;
  let conditionLine = '';
  let prefsLine = '';

  if (isFlip) {
    const worksRange = condition.refurbHigh
      ? `£${condition.refurbLow.toLocaleString()}–£${condition.refurbHigh.toLocaleString()}`
      : 'unknown (no refurb signals in the listing text)';
    yieldLine = condition.overall !== 'Unknown'
      ? `Condition reads as ${condition.overall}${condition.signals?.[0] ? ` (“${condition.signals[0]}”)` : ''}. Rule-based works estimate: ${worksRange}.`
      : `No clear condition signals in the listing text — treat works as unknown until viewing. If it is a true doer-upper, budget using a survey, not this model.`;

    const gdvBit = flip?.gdv
      ? `Sold median (GDV proxy) is £${flip.gdv.toLocaleString()}. Purchase + mid-point works (£${flip.works.toLocaleString()}) = £${flip.totalIn.toLocaleString()} all-in${flip.uplift != null ? `, leaving an illustrative equity gap of £${flip.uplift.toLocaleString()} (${flip.upliftPct}% on cost)` : ''}.`
      : `No sold median available to set a GDV — do not assume a flip profit until you have local comps.`;
    strategyLine = `Refurb economics: ${gdvBit} Cash to complete (deposit, stamp duty, fees, works): £${deal.totalCashRequired.toLocaleString()}.`;

    if (comps.available && comps.deviationPct != null) {
      const dir = comps.deviationPct <= 0 ? 'below' : 'above';
      valueLine = `Asking is ${Math.abs(comps.deviationPct)}% ${dir} the sold median for recent ${propertyType} sales (${comps.sample.length} comps). ${comps.undervalued === 'strong' || comps.undervalued === 'possible' ? 'That discount is the core of the flip thesis — confirm it survives after works and fees.' : 'Little or no entry discount versus sold prices, so the flip needs cheap works or a higher exit to work.'}`;
    } else {
      valueLine = 'Comparable sold prices were limited — verify exit value with a local agent before offering.';
    }

    conditionLine = 'Rental yield is secondary on this brief. Focus on entry discount, works scope, and achievable GDV after refurb.';

    if (prefs?.maxBudget) {
      prefsLine = price <= prefs.maxBudget
        ? `Fits your £${prefs.maxBudget.toLocaleString()} budget. Strategy locked to Refurb & Flip from your brief.`
        : `£${(price - prefs.maxBudget).toLocaleString()} over your £${prefs.maxBudget.toLocaleString()} budget. Strategy locked to Refurb & Flip from your brief.`;
    } else {
      prefsLine = 'Strategy locked to Refurb & Flip from your brief — ranking prioritises BMV and condition, not rental yield.';
    }
  } else {
    const rentBit = rentEstimate.confidence === 'high'
      ? `the advertised rent of £${deal.monthlyRent.toLocaleString()}/month`
      : `a modelled rent of £${deal.monthlyRent.toLocaleString()}/month (low confidence — verify against local listings)`;
    yieldLine = `Gross yield is ${deal.grossYield}% on ${rentBit}, against a ${market.avgYield}% area baseline. Net yield after ${deal.annualCostsPct}% running costs is ${deal.netYield}%.`;

    strategyLine = `Cash required: £${deal.totalCashRequired.toLocaleString()} (${deal.depositPct}% deposit £${deal.deposit.toLocaleString()}, stamp duty £${deal.stampDuty.toLocaleString()}, fees £${deal.legalFees.toLocaleString()}${deal.refurbCost ? `, refurb £${deal.refurbCost.toLocaleString()}` : ''}). At ${deal.interestRate}% ${deal.interestOnly ? 'interest-only' : 'repayment'}, cash flow is £${deal.monthlyCashFlow.toLocaleString()}/month — a ${deal.cashOnCash}% cash-on-cash return. Break-even rent is £${deal.breakEvenRent.toLocaleString()}/month.`;

    if (comps.available && comps.deviationPct != null) {
      const dir = comps.deviationPct <= 0 ? 'below' : 'above';
      valueLine = `Against ${comps.sample.length} recent ${propertyType} sales in the district (median £${comps.median.toLocaleString()}), the asking price is ${Math.abs(comps.deviationPct)}% ${dir} the sold median. ${comps.undervalued === 'strong' ? 'That is a meaningful discount worth investigating.' : comps.undervalued === 'possible' ? 'Possibly under market — check condition and exact location.' : 'No discount versus recent sold prices.'}`;
    } else if (comps.available) {
      valueLine = `Recent ${propertyType} sales in the district have a median of £${comps.median.toLocaleString()} (${comps.sample.length} comps). No discount claim is made because the purchase price is itself estimated.`;
    } else {
      valueLine = 'No sold comparables were available for this district, so no market-discount claim is made.';
    }

    if (condition.overall !== 'Unknown') {
      conditionLine = condition.overall === 'Good'
        ? `The listing describes the property as in good condition ("${condition.signals[0] || 'well presented'}").`
        : `Listing text signals ${condition.overall.toLowerCase()} condition ("${condition.signals[0] || ''}") — the rule-based estimate is £${condition.refurbLow.toLocaleString()}–£${condition.refurbHigh.toLocaleString()} of works.`;
    }

    if (prefs) {
      const bits = [];
      if (prefs.targetYield) {
        bits.push(deal.grossYield >= prefs.targetYield
          ? `meets your ${prefs.targetYield}% yield target`
          : `is ${Math.round((prefs.targetYield - deal.grossYield) * 10) / 10}pp short of your ${prefs.targetYield}% target`);
      }
      if (prefs.maxBudget) {
        bits.push(price <= prefs.maxBudget
          ? `fits your £${prefs.maxBudget.toLocaleString()} budget`
          : `is £${(price - prefs.maxBudget).toLocaleString()} over budget`);
      }
      if (bits.length) prefsLine = `Against your investor profile, this deal ${bits.join(' and ')}. Suggested strategy: ${strategy.label}.`;
    }
  }

  return { opening, yieldLine, strategyLine, valueLine, conditionLine, prefsLine };
}

function buildProsCons({ deal, comps, condition, market, strategy, beds, propertyType, prefs, price, meta, flip }) {
  const pros = [];
  const cons = [];
  const isFlip = strategy.key === 'flip';

  if (isFlip) {
    if (comps.undervalued === 'strong' || comps.undervalued === 'possible') {
      pros.push(`${Math.abs(comps.deviationPct)}% below sold median (entry discount)`);
    }
    if (condition.overall === 'Poor' || condition.overall === 'Fair') {
      pros.push(`Clear refurb signal (${condition.overall})`);
    }
    if (flip?.uplift != null && flip.uplift > 0) {
      pros.push(`Illustrative uplift ~£${flip.uplift.toLocaleString()} vs sold median after works`);
    }
    if (condition.signals?.length) pros.push(`Listing cue: “${condition.signals[0]}”`);

    if (condition.overall === 'Good' || condition.overall === 'Unknown') {
      cons.push(condition.overall === 'Good'
        ? 'Listing reads as already finished — weak refurb angle'
        : 'No condition signals — confirm works scope on viewing');
    }
    if (comps.available && comps.deviationPct > 0) cons.push('Asking above sold median — thinner flip margin');
    if (flip?.works) cons.push(`Works budget ${condition.refurbHigh ? `£${condition.refurbLow.toLocaleString()}–£${condition.refurbHigh.toLocaleString()}` : `~£${flip.works.toLocaleString()}`}`);
    if (!comps.available) cons.push('No sold comps — GDV uncertain');
  } else {
    if (deal.grossYield >= market.avgYield + 0.3) pros.push(`${deal.grossYield}% yield beats the ${market.avgYield}% area baseline`);
    if (deal.monthlyCashFlow > 100) pros.push(`Positive cash flow: £${deal.monthlyCashFlow.toLocaleString()}/month`);
    if (comps.undervalued === 'strong' || comps.undervalued === 'possible') pros.push(`${Math.abs(comps.deviationPct)}% below sold median (Land Registry)`);
    if (condition.overall === 'Good') pros.push('Listing indicates good condition');
    if (market.demand === 'high' || market.demand === 'very high') pros.push('Strong rental demand locally');
    if (strategy.key === 'hmo' && beds >= 4) pros.push('Room count supports HMO strategy');
    if (prefs?.targetYield && deal.grossYield >= prefs.targetYield) pros.push(`Meets your ${prefs.targetYield}% yield target`);

    if (deal.monthlyCashFlow != null && deal.monthlyCashFlow < 0) cons.push(`Negative cash flow: £${Math.abs(deal.monthlyCashFlow).toLocaleString()}/month`);
    if (deal.grossYield < market.avgYield - 0.5) cons.push('Yield below area baseline');
    if (comps.available && comps.deviationPct > 5) cons.push(`${comps.deviationPct}% above sold median for the district`);
    if (condition.overall === 'Poor' || condition.overall === 'Fair') cons.push(`Refurb needed: est. £${condition.refurbLow.toLocaleString()}–£${condition.refurbHigh.toLocaleString()}`);
    if (!comps.available) cons.push('No sold comparables found — value check incomplete');
    if (prefs?.targetYield && deal.grossYield < prefs.targetYield) cons.push(`Below your ${prefs.targetYield}% yield target`);
  }

  if (propertyType === 'flat') cons.push('Service charge / leasehold costs may apply');
  if (meta?.epc && ['E', 'F', 'G'].includes(meta.epc)) cons.push(`EPC ${meta.epc} — upgrade may be required`);
  if (prefs?.maxBudget && price > prefs.maxBudget) cons.push(`Over your £${prefs.maxBudget.toLocaleString()} budget`);

  return {
    pros: pros.slice(0, 5),
    cons: cons.slice(0, 5).length ? cons.slice(0, 5) : ['Standard due diligence still required'],
  };
}

function collectRiskFlags({ meta, condition, deal, prefs, propertyType, price, strategy }) {
  const flags = [];
  if (meta?.tenure === 'Leasehold') flags.push('Leasehold — check lease length and ground rent');
  if (meta?.epc && ['E', 'F', 'G'].includes(meta.epc)) flags.push(`EPC ${meta.epc} — potential upgrade cost`);
  if (condition.overall === 'Poor') flags.push('Listing indicates significant refurbishment required');
  if (strategy?.key !== 'flip' && deal.monthlyCashFlow != null && deal.monthlyCashFlow < 0) {
    flags.push(`Negative cash flow of £${Math.abs(deal.monthlyCashFlow).toLocaleString()}/month at current assumptions`);
  }
  if (strategy?.key === 'flip' && (condition.overall === 'Good' || condition.overall === 'Unknown')) {
    flags.push('Weak or unclear refurb signal — verify works on viewing');
  }
  if (prefs?.maxBudget && price > prefs.maxBudget) flags.push(`£${(price - prefs.maxBudget).toLocaleString()} over your max budget`);
  if (propertyType === 'flat' && meta?.tenure !== 'Freehold') flags.push('Service charge and ground rent not confirmed — check before offering');
  return flags;
}

function buildScoreBreakdown(scoreResult, { deal, comps, condition, market, prefs }) {
  const { parts, weights } = scoreResult;
  const items = [
    {
      label: `Yield (${weights.yield})`,
      impact: parts.yield >= weights.yield * 0.6 ? 'positive' : parts.yield <= weights.yield * 0.3 ? 'negative' : 'neutral',
      text: `${deal.grossYield}% gross${prefs?.targetYield ? ` vs your ${prefs.targetYield}% target` : ''} → ${parts.yield}/${weights.yield}`,
    },
    {
      label: `Growth (${weights.growth})`,
      impact: parts.growth >= weights.growth * 0.6 ? 'positive' : 'neutral',
      text: `${market.growth5yr}% 5-yr area growth → ${parts.growth}/${weights.growth}`,
    },
    {
      label: `Demand (${weights.demand})`,
      impact: parts.demand >= weights.demand * 0.7 ? 'positive' : 'neutral',
      text: `${market.demand} rental demand → ${parts.demand}/${weights.demand}`,
    },
    {
      label: `Discount (${weights.discount})`,
      impact: parts.discount >= weights.discount * 0.6 ? 'positive' : parts.discount <= weights.discount * 0.3 ? 'negative' : 'neutral',
      text: comps.available && comps.deviationPct != null
        ? `${comps.deviationPct > 0 ? '+' : ''}${comps.deviationPct}% vs sold median → ${parts.discount}/${weights.discount}`
        : `No comparables — neutral → ${parts.discount}/${weights.discount}`,
    },
    {
      label: `Cash flow (${weights.cashFlow})`,
      impact: parts.cashFlow >= weights.cashFlow * 0.6 ? 'positive' : parts.cashFlow <= weights.cashFlow * 0.3 ? 'negative' : 'neutral',
      text: `£${deal.monthlyCashFlow.toLocaleString()}/month → ${parts.cashFlow}/${weights.cashFlow}`,
    },
    {
      label: `Condition (${weights.condition})`,
      impact: condition.overall === 'Good' ? 'positive' : condition.overall === 'Poor' ? 'negative' : 'neutral',
      text: `${condition.overall}${condition.refurbHigh ? ` (est. up to £${condition.refurbHigh.toLocaleString()} works)` : ''} → ${parts.condition}/${weights.condition}`,
    },
  ];
  return items;
}

function buildRisks({ riskFlags, comps, condition, meta, city, market, rentEstimate }) {
  const risks = [{ type: 'ok', text: 'Live listing data used' }];
  if (comps.available) {
    risks.push({ type: 'ok', text: `${comps.count} sold records from HM Land Registry` });
  } else {
    risks.push({ type: 'info', text: 'No sold comparables — deviation not scored' });
  }
  if (rentEstimate.confidence === 'low') {
    risks.push({ type: 'info', text: 'Rent is modelled, not listed — low confidence' });
  }
  for (const f of riskFlags) risks.push({ type: 'warn', text: f });
  if (meta?.epc && ['A', 'B', 'C'].includes(meta.epc)) {
    risks.push({ type: 'ok', text: `EPC ${meta.epc} — efficient property` });
  }
  if (condition.overall === 'Unknown') {
    risks.push({ type: 'info', text: 'Condition unknown from listing text — assess on viewing' });
  }
  risks.push({ type: 'warn', text: 'Verify tenure, EPC, and condition on viewing' });
  risks.push({ type: 'ok', text: `${city} · ${market.demand} rental demand` });
  return risks;
}

export async function analyseProperty({
  url, id, meta, parsed, strategyOverride = null, prefs: prefsOverride = null, brief = null,
}) {
  const basePrefs = getInvestorPrefs();
  const prefs = {
    ...basePrefs,
    ...(prefsOverride || {}),
    maxBudget: prefsOverride?.maxBudget ?? basePrefs.maxBudget,
    targetYield: prefsOverride?.targetYield ?? basePrefs.targetYield,
  };
  const title = meta?.title || '';
  const description = meta?.description || '';
  const listingType = meta?.listingType || (meta?.monthlyRent ? 'rent' : 'sale');
  const hasLiveData = Boolean(meta?.fetched && (meta?.title || meta?.price || meta?.monthlyRent));

  // ── Step 1–2: Extraction. Never fabricate; refuse instead. ──
  if (!hasLiveData) {
    throw new Error('No live listing data — refuse to invent property details');
  }
  const beds = meta?.beds ?? null;
  if (beds == null) {
    throw new Error('Could not read bedroom count from the listing');
  }
  const bedsLabel = beds === 0 ? 'Studio' : `${beds} bed`;

  const location = resolveLocation({
    postcode: meta?.postcode || parsed.postcode,
    city: parsed.city,
    title: `${title} ${meta?.address || ''}`,
    description,
  });

  let price = meta?.price && meta.price > 10000 ? meta.price : null;
  if (!price && !(listingType === 'rent' && meta?.monthlyRent)) {
    throw new Error('Could not read asking price from the listing');
  }

  const propertyType = meta?.propertyType || inferPropertyType(title, description, beds);

  // ── Step 3: Real external market data (Land Registry + postcodes.io) ──
  const marketData = await getMarketData({
    postcode: meta?.postcode || parsed.postcode,
    propertyType,
  });

  // Rental listings have no purchase price. Estimate from the real sold
  // median when available; regional baseline otherwise — always flagged.
  let priceIsEstimated = false;
  let priceEstimateSource = null;
  if (!price) {
    const soldPrices = (marketData.sold.comparables || []).map((c) => c.price).sort((a, b) => a - b);
    if (soldPrices.length >= 5) {
      const mid = Math.floor(soldPrices.length / 2);
      price = soldPrices.length % 2 ? soldPrices[mid] : Math.round((soldPrices[mid - 1] + soldPrices[mid]) / 2);
      priceEstimateSource = `sold median of ${soldPrices.length} ${propertyType} sales (HM Land Registry)`;
    } else {
      price = Math.round(location.market.avgPrice);
      priceEstimateSource = 'regional baseline average';
    }
    priceIsEstimated = true;
  }

  // ── Step 5–6: Condition from listing text + EPC + listing photos ──
  const textCondition = classifyCondition({
    title,
    description,
    epc: meta?.epc || null,
  });
  const imageUrls = [
    ...(meta?.images || []),
    meta?.image,
  ].filter(Boolean);
  let visionCondition = null;
  try {
    visionCondition = await classifyConditionFromImages(imageUrls);
  } catch {
    visionCondition = null;
  }
  const condition = mergeCondition(textCondition, visionCondition);

  // Works cost ONLY from rule table — never invent % of purchase price
  let refurbCost = Math.round((condition.refurbLow + condition.refurbHigh) / 2);
  if (!refurbCost || Number.isNaN(refurbCost)) refurbCost = 0;

  // ── Step 7: Rental estimate with explicit confidence ──
  const rentEstimate = estimateRent({
    listedRent: meta?.monthlyRent || null,
    price,
    areaYield: location.market.avgYield,
    propertyType,
    beds,
  });
  if (!rentEstimate.monthlyRent) {
    throw new Error('Could not estimate rent — insufficient data');
  }

  // ── Step 8: Comparable sales analysis (real transactions) ──
  const comps = analyseComparables(
    marketData.sold.comparables,
    price,
    marketData.geo?.outcode || null,
  );
  // An estimated price derived from these comps can't be compared back to them
  if (priceIsEstimated) {
    comps.deviationPct = null;
    comps.undervalued = null;
    comps.verdict = {
      label: 'Price vs market unclear',
      tone: 'unknown',
      summary: 'Purchase price was estimated — Valora will not claim a below-market discount.',
      discountPct: null,
      evidence: [],
    };
  }

  // ── Step 4: Deterministic financial engine ──
  const deal = computeDealFinancials({
    price,
    monthlyRent: rentEstimate.monthlyRent,
    depositPct: prefs.depositPct || 25,
    interestRate: prefs.interestRate || 4.5,
    termYears: prefs.termYears || 25,
    interestOnly: true,
    refurbCost,
    annualCostsPct: 25,
  });

  // Prefer explicit Discover/brief strategy, then investor prefs
  const preferredKey = strategyOverride || PREF_STRATEGY[prefs.strategy];
  const strategy = inferStrategy({
    title, description, beds, price, propertyType,
    cityMarket: location.market, preferredKey, condition: condition.overall,
  });

  const flip = flipEconomics({ price, comps, condition, refurbCost });

  // ── Step 10: Deterministic weighted score ──
  // Flip briefs are scored on discount + condition, not rental yield targets
  const riskFlags = collectRiskFlags({ meta, condition, deal, prefs, propertyType, price, strategy });
  const scoreResult = computeInvestmentScore({
    grossYield: deal.grossYield,
    areaGrowth5yr: location.market.growth5yr,
    rentalDemand: location.market.demand,
    condition: condition.overall,
    comparableDeviationPct: comps.deviationPct,
    monthlyCashFlow: strategy.key === 'flip'
      ? (flip.uplift != null ? Math.round(flip.uplift / 24) : 0) // map uplift into cash-flow slot
      : deal.monthlyCashFlow,
    riskFlags,
    targetYield: strategy.key === 'flip' ? null : (prefs.targetYield || null),
  });
  const score = scoreResult.score;

  // ── Step 9 + 11: Analyst narrative + report assembly ──
  const city = marketData.geo?.district || location.city;
  const aiInsight = buildAnalystSummary({
    city, beds, propertyType, price, deal, comps, condition, rentEstimate,
    market: location.market, prefs, strategy,
    priceIsEstimated, priceEstimateSource, flip,
  });
  const { pros, cons } = buildProsCons({
    deal, comps, condition, market: location.market, strategy, beds, propertyType, prefs, price, meta, flip,
  });
  const scoreBreakdown = buildScoreBreakdown(scoreResult, {
    deal, comps, condition, market: location.market, prefs,
  });
  const risks = buildRisks({
    riskFlags, comps, condition, meta, city: location.city, market: location.market, rentEstimate,
  });

  const portalLabel = parsed.portal || 'Listing';
  const listingRef = parsed.listingId ? `#${parsed.listingId}` : '';
  const name = title
    || [meta?.address, `${beds}-bed ${propertyType}`].filter(Boolean).join(' · ')
    || `${beds}-bed ${propertyType}${listingRef ? ` ${listingRef}` : ''}`;
  const postcode = meta?.postcode || parsed.postcode;
  const typeMeta = PROPERTY_TYPES[propertyType] || PROPERTY_TYPES.house;
  const displayAddress = meta?.address
    || `${location.city}${postcode ? ` · ${postcode}` : ''}`;

  const fitTags = [];
  if (strategy.key === 'flip') {
    fitTags.push('Refurb & Flip');
    if (comps.undervalued === 'strong' || comps.undervalued === 'possible') fitTags.push('BMV angle');
    if (condition.overall === 'Poor' || condition.overall === 'Fair') fitTags.push(`${condition.overall} condition`);
  } else {
    if (prefs.targetYield && deal.grossYield >= prefs.targetYield) fitTags.push('Hits yield target');
  }
  if (prefs.maxBudget && price <= prefs.maxBudget) fitTags.push('In budget');
  if (prefs.maxBudget && price > prefs.maxBudget) fitTags.push('Over budget');

  const marketValue = comps.available && comps.median ? comps.median : null;
  // NEVER claim below-market vs regional baseline averages — only Land Registry
  const valuePanel = comps.available && comps.deviationPct != null && !priceIsEstimated
    ? {
        title: `Sold median (${comps.sample.length} comps): £${comps.median.toLocaleString()}`,
        desc: comps.verdict?.summary
          || (comps.undervalued === 'strong' || comps.undervalued === 'possible'
            ? `Asking is ~${Math.abs(comps.deviationPct)}% below the Land Registry sold median.`
            : comps.deviationPct > 2
              ? `Asking is ~${comps.deviationPct}% above the Land Registry sold median.`
              : 'Asking is close to the Land Registry sold median.'),
        badge: comps.undervalued === 'strong'
          ? `−${Math.abs(comps.deviationPct)}% vs sold`
          : comps.undervalued === 'possible'
            ? `−${Math.abs(comps.deviationPct)}% vs sold`
            : comps.deviationPct > 2
              ? `+${comps.deviationPct}% vs sold`
              : 'Near sold median',
        tone: comps.verdict?.tone || (comps.undervalued === 'strong' || comps.undervalued === 'possible' ? 'cheap' : 'fair'),
      }
    : {
        title: 'Sold comps unavailable',
        desc: 'No reliable HM Land Registry sold median for this district/type — Valora will not claim this asking price is cheap.',
        badge: 'No BMV claim',
        tone: 'unknown',
      };

  const flipFacts = strategy.key === 'flip'
    ? [
      { label: 'Asking Price', value: `£${price.toLocaleString()}` },
      { label: 'Condition', value: condition.overall },
      {
        label: 'Works est.',
        value: condition.refurbHigh
          ? `£${condition.refurbLow.toLocaleString()}–£${condition.refurbHigh.toLocaleString()}`
          : `£${refurbCost.toLocaleString()}`,
      },
      {
        label: 'GDV (sold median)',
        value: flip.gdv ? `£${flip.gdv.toLocaleString()}` : '—',
      },
      {
        label: 'Illustrative uplift',
        value: flip.uplift != null ? `£${flip.uplift.toLocaleString()}` : '—',
      },
    ]
    : null;

  return {
    id,
    name,
    title: title || name,
    description: description || '',
    address: `${displayAddress} · via ${portalLabel}`,
    location: location.city,
    district: marketData.geo?.district || null,
    postcode,
    propertyType,
    beds,
    baths: meta?.baths ?? null,
    floorArea: meta?.floorArea ?? null,
    tenure: meta?.tenure || 'Unknown',
    epc: meta?.epc || 'Unknown',
    strategy: strategy.label,
    strategyKey: strategy.key,
    emoji: typeMeta.emoji,
    price,
    priceIsEstimated,
    listingType,
    listedRent: meta?.monthlyRent || null,
    priceLabel: meta?.priceLabel || null,
    image: meta?.image || null,
    images: imageUrls.length ? [...new Set(imageUrls)].slice(0, 10) : (meta?.image ? [meta.image] : []),
    agent: meta?.agent || null,
    marketValue,
    score,
    grade: scoreGrade(score),

    // Deterministic financial engine output (full deal model)
    deal,
    // Backwards-compatible finance summary
    finance: {
      depositPct: deal.depositPct,
      deposit: deal.deposit,
      loan: deal.loan,
      interestRate: deal.interestRate,
      termYears: deal.termYears,
      monthlyPayment: deal.monthlyMortgage,
      interestOnlyPayment: deal.monthlyMortgage,
    },

    // Real comparable sales (HM Land Registry)
    comparables: {
      available: comps.available,
      count: comps.count,
      median: comps.median,
      average: comps.average,
      deviationPct: comps.deviationPct,
      undervalued: comps.undervalued,
      confidence: comps.confidence || 'none',
      note: comps.note,
      source: marketData.sold.source,
      district: marketData.geo?.district || null,
      verdict: comps.verdict || null,
      sample: comps.sample.slice(0, 6).map((c) => ({
        price: c.price, date: c.date, postcode: c.postcode, street: c.street, propertyType: c.propertyType, newBuild: c.newBuild,
      })),
    },

    // Condition classification + rule-based refurb (text + vision)
    condition: {
      overall: condition.overall,
      rooms: condition.rooms || {},
      items: condition.items,
      refurbLow: condition.refurbLow,
      refurbHigh: condition.refurbHigh,
      lineItems: condition.lineItems || [],
      signals: condition.signals,
      source: condition.source,
      confidence: condition.confidence || 'low',
      verdict: condition.verdict || null,
      vision: condition.vision || null,
    },

    rentEstimate: {
      confidence: rentEstimate.confidence,
      source: rentEstimate.source,
    },

    investorFit: {
      targetYield: prefs.targetYield,
      maxBudget: prefs.maxBudget,
      meetsYield: deal.grossYield >= (prefs.targetYield || 0),
      inBudget: price <= (prefs.maxBudget || Infinity),
    },
    tags: [
      strategy.label,
      propertyType.charAt(0).toUpperCase() + propertyType.slice(1),
      'Live listing',
      listingType === 'rent' ? 'To rent' : 'For sale',
      bedsLabel,
      ...(comps.available ? ['Land Registry comps'] : []),
      ...fitTags,
    ],
    facts: flipFacts || [
      {
        label: priceIsEstimated ? 'Est. purchase (sold data)' : 'Asking Price',
        value: `£${price.toLocaleString()}`,
      },
      { label: 'Bedrooms', value: bedsLabel },
      {
        label: comps.available ? 'Sold median (comps)' : 'Area avg (illustrative)',
        value: marketValue
          ? `£${(marketValue / 1000).toFixed(0)}k`
          : `£${Math.round(location.market.avgPrice / 1000)}k*`,
      },
      { label: 'Gross Yield', value: `${deal.grossYield}%` },
      { label: 'Cash flow / mo', value: `£${deal.monthlyCashFlow.toLocaleString()}` },
    ],
    metrics: strategy.key === 'flip'
      ? {
        land: `£${(price / 1000).toFixed(0)}k`,
        build: `£${refurbCost.toLocaleString()}`,
        total: `£${Math.round(flip.totalIn / 1000)}k all-in`,
        return: flip.upliftPct != null ? `${flip.upliftPct}%` : '—',
        returnLabel: 'Uplift vs GDV',
      }
      : {
        land: `£${(price / 1000).toFixed(0)}k`,
        build: refurbCost ? `£${refurbCost.toLocaleString()}` : '£0',
        total: `£${Math.round(deal.totalCashRequired / 1000)}k cash`,
        return: `${deal.cashOnCash}%`,
        returnLabel: 'Cash-on-cash',
      },
    flip: strategy.key === 'flip' ? flip : null,
    undervalued: valuePanel,
    valueVerdict: comps.verdict || valuePanel,
    rental: {
      conservative: Math.round(deal.monthlyRent * 0.9),
      expected: deal.monthlyRent,
      optimistic: Math.round(deal.monthlyRent * 1.08),
      grossYield: `${deal.grossYield}%`,
      netYield: `${deal.netYield}%`,
      confidence: rentEstimate.confidence,
    },
    risks,
    areaIntel: {
      schools: location.market.schools,
      crime: location.market.crime,
      transport: location.market.transport,
      priceGrowth: `+${location.market.growth5yr}% (5yr est.)`,
      avgYield: `${location.market.avgYield}%`,
      demand: location.market.demand,
      vsPropertyYield: deal.grossYield >= location.market.avgYield ? 'Above area avg' : 'Below area avg',
    },
    aiInsight,
    scoreBreakdown,
    scoreParts: scoreResult.parts,
    scoreWeights: scoreResult.weights,
    pros,
    cons,
    provenance: {
      listing: meta?.source || 'live listing',
      soldPrices: comps.available ? 'HM Land Registry Price Paid Data' : 'unavailable',
      geo: marketData.geo ? 'postcodes.io' : 'unavailable',
      rent: rentEstimate.source,
      areaStats: 'Regional baseline table (illustrative)',
      financials: 'Deterministic calculation',
      score: 'Weighted formula (yield 25 · growth 20 · demand 15 · condition 10 · discount 15 · cash flow 10 · risk 5)',
    },
    isDevelopment: strategy.key === 'demo',
    sourceUrl: url,
    sourcePortal: parsed.portal,
    listingId: parsed.listingId,
    dataSource: meta?.source || null,
    isPrototype: false,
    hasLiveData: true,
    analysedAt: Date.now(),
    brief: brief
      ? {
          id: brief.id || null,
          name: brief.name || null,
          query: brief.query || null,
        }
      : null,
    briefMatch: brief?.intent
      ? (() => {
          const draft = {
            price,
            beds,
            location: location.city,
            address: displayAddress,
            postcode,
            propertyType,
            score,
            deal,
            rental: { grossYield: `${deal.grossYield}%` },
            condition,
            comparables: comps,
            flip: strategy.key === 'flip' ? flip : null,
            areaIntel: {
              priceGrowth: `+${location.market.growth5yr}% (5yr est.)`,
            },
            rentEstimate,
            title,
            description,
            floorArea: meta?.floorArea ?? null,
          };
          const { matchPct, checklist } = scoreBriefMatch(draft, brief.intent);
          return { matchPct, checklist, briefName: brief.name || null };
        })()
      : null,
  };
}
