/**
 * Investment Brief helpers — naming, match %, and checklist reasons.
 * Scores are deterministic from verified property fields + brief intent.
 * Hard criteria never get soft credit. Soft cues can warn.
 */

import { parseIntent, summarizeIntent } from './parseIntent.js';

export function nameInvestmentBrief(intentOrQuery, queryFallback = '') {
  const intent = typeof intentOrQuery === 'string'
    ? parseIntent(intentOrQuery)
    : intentOrQuery;
  const q = (intent?.raw || queryFallback || '').toLowerCase();
  const loc = intent?.location
    || (intent?.regions?.[0]
      ? intent.regions[0].charAt(0).toUpperCase() + intent.regions[0].slice(1)
      : null);

  const isRefurb = intent?.strategy === 'flip' || intent?.boosts?.preferRefurb;
  const isHmo = intent?.strategy === 'hmo' || intent?.boosts?.preferStudent;
  const isDemo = intent?.strategy === 'demo';
  const isRental = intent?.strategy === 'btl'
    || intent?.boosts?.preferHighYield
    || intent?.boosts?.preferCashFlow
    || intent?.boosts?.preferRentalDemand
    || /rental|tenant|cash flow|monthly return/i.test(q);

  let theme;
  if (isRefurb) {
    theme = /extend|extension/i.test(q) ? 'Extension & Renovation' : 'Renovation Projects';
  } else if (isHmo) {
    theme = 'Student Accommodation';
  } else if (isDemo) {
    theme = 'Development Opportunities';
  } else if (isRental && (/long.?term|reliable|portfolio/i.test(q) || intent?.boosts?.preferGrowth)) {
    theme = 'Long-Term Rental Portfolio';
  } else if (isRental) {
    theme = 'Rental Investments';
  } else if (intent?.boosts?.preferSchools || /family/i.test(q)) {
    theme = 'Family Homes';
  } else if (intent?.boosts?.preferGrowth) {
    theme = 'Long-Term Growth';
  } else {
    theme = 'Investment Opportunities';
  }

  if (loc && theme === 'Long-Term Rental Portfolio') return `${loc} Long-Term Rentals`;
  if (loc) return `${loc} ${theme}`;
  return theme;
}

export function briefCriteria(intent) {
  if (!intent) return [];
  const items = summarizeIntent(intent);
  const q = (intent.raw || '').toLowerCase();
  if (intent.boosts?.preferPlot) items.push('Large plot');
  if (intent.boosts?.preferExtend) items.push('Extension potential');
  if (intent.boosts?.preferModernise) items.push('Needs modernising');
  if (intent.boosts?.preferCashFlow) items.push('Positive cash flow');
  if (intent.boosts?.preferRentalDemand) items.push('Strong rental demand');
  if (/garden|plot/i.test(q) && !items.some((i) => /plot|garden/i.test(i))) items.push('Outdoor space');
  return [...new Set(items)];
}

function isBmv(property) {
  const u = property?.comparables?.undervalued;
  return u === 'strong' || u === 'possible';
}

function listingText(property) {
  return `${property.description || ''} ${property.title || ''} ${property.name || ''} ${property.address || ''}`.toLowerCase();
}

function locationMatches(property, location) {
  if (!location) return true;
  const needle = location.toLowerCase();
  const parts = [
    property.location,
    property.district,
    property.address,
    property.postcode,
    property.name,
  ].filter(Boolean).map((s) => String(s).toLowerCase());
  if (parts.some((p) => p.includes(needle))) return true;
  // Token match for multi-word places (e.g. "Little Chalfont" vs address "Chalfont")
  const tokens = needle.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length >= 2) {
    const blob = parts.join(' ');
    return tokens.every((t) => blob.includes(t));
  }
  return false;
}

/**
 * Personalized match score (0–100) vs an Investment Brief.
 * Hard misses get zero credit. Soft unknowns can warn at partial credit.
 */
export function scoreBriefMatch(property, intent) {
  if (!property || !intent) {
    return { matchPct: 0, checklist: [] };
  }

  const checklist = [];
  let points = 0;
  let weight = 0;

  /** Hard criterion — fail = 0 credit */
  const hard = (w, ok, passText, failText) => {
    weight += w;
    if (ok) points += w;
    checklist.push({ ok: Boolean(ok), warn: false, text: ok ? passText : failText, hard: true });
  };

  /** Soft criterion — warn gets partial credit */
  const soft = (w, ok, passText, failText, warn = false, warnCredit = 0.35) => {
    weight += w;
    if (ok) points += w;
    else if (warn) points += w * warnCredit;
    checklist.push({
      ok: Boolean(ok),
      warn: Boolean(warn) && !ok,
      text: ok ? passText : failText,
      hard: false,
    });
  };

  const isRefurb = intent.strategy === 'flip' || intent.boosts?.preferRefurb;
  const price = Number(property.price) || 0;
  const beds = property.beds;
  const yieldPct = property.deal?.grossYield
    ?? (parseFloat(property.rental?.grossYield || '') || null);
  const cashFlow = property.deal?.monthlyCashFlow;
  const disc = property.comparables?.deviationPct;
  const cond = property.condition?.overall;
  const bmv = isBmv(property);
  const text = listingText(property);

  if (intent.maxPrice != null) {
    const within = price > 0 && price <= intent.maxPrice;
    const slightOver = price > intent.maxPrice && price <= intent.maxPrice * 1.03;
    if (within) hard(20, true, `Within budget (≤ £${intent.maxPrice.toLocaleString()})`, '');
    else if (slightOver) soft(20, false, '', `Slightly over budget (£${price.toLocaleString()})`, true, 0.4);
    else hard(20, false, '', `Over budget (£${price.toLocaleString()})`);
  }

  if (intent.minPrice != null) {
    hard(6, price >= intent.minPrice,
      `Above minimum £${intent.minPrice.toLocaleString()}`,
      'Below minimum price');
  }

  if (intent.minBedrooms != null) {
    const ok = beds != null && beds >= intent.minBedrooms;
    hard(16, ok,
      ok ? `${beds === 0 ? 'Studio' : `${beds} bed`} meets ${intent.minBedrooms}+ target` : '',
      beds == null
        ? 'Bedrooms not confirmed'
        : `${beds} bed — below ${intent.minBedrooms}+ target`);
  }

  if (intent.location) {
    const ok = locationMatches(property, intent.location);
    soft(14, ok,
      `In / near ${intent.location}`,
      `Location may not match ${intent.location}`,
      !ok,
      0.25);
  }

  if (intent.propertyTypes?.length) {
    const type = String(property.propertyType || '').toLowerCase();
    const ok = intent.propertyTypes.some((t) => (
      type.includes(t)
      || (t === 'house' && /terraced|semi|detached|house|bungalow/.test(type))
      || (t === 'flat' && /flat|apartment|maisonette|studio/.test(type))
    ));
    if (!type) soft(8, false, '', 'Property type not confirmed', true, 0.3);
    else hard(8, ok, `${property.propertyType} matches brief`, 'Property type differs from brief');
  }

  if (isRefurb) {
    const remodel = cond === 'Poor' || cond === 'Fair';
    const unknown = !cond || cond === 'Unknown';
    const turnkey = cond === 'Good';

    if (remodel) {
      hard(18, true, `${cond} condition — renovation opportunity`, '');
    } else if (unknown) {
      soft(18, false, '', 'Condition unclear — confirm on viewing', true, 0.3);
    } else if (turnkey) {
      hard(18, false, '', 'Good condition — limited modernisation need');
    }

    if (intent.boosts?.preferModernise) {
      soft(6, remodel, 'Needs modernising', turnkey ? 'Looks already modernised' : 'Modernisation not confirmed', unknown, 0.25);
    }

    if (bmv) {
      soft(12, true, `${Math.abs(disc)}% below sold median (Land Registry)`, '');
    } else if (disc != null && property.comparables?.available) {
      soft(12, false,
        '',
        disc <= 2 ? 'Near sold median — not a clear BMV' : `${disc}% above sold median`,
        disc <= 2,
        0.2);
    }

    if (property.flip?.uplift != null) {
      soft(10, property.flip.uplift > 0,
        `Illustrative uplift ~£${property.flip.uplift.toLocaleString()} vs GDV`,
        'Limited / negative uplift vs GDV after works');
    }

    if (intent.boosts?.preferExtend || intent.boosts?.preferPlot) {
      const garden = /garden|plot|grounds|acre|rear|outdoor/.test(text)
        || (property.floorArea && property.floorArea > 110);
      soft(8, garden,
        'Outdoor space / plot signals present',
        'Large plot / extension not confirmed from listing',
        true,
        0.2);
    }
  } else {
    if (intent.minGrossYield != null && yieldPct != null) {
      const ok = yieldPct >= intent.minGrossYield;
      const close = !ok && yieldPct >= intent.minGrossYield * 0.92;
      if (ok) hard(16, true, `${yieldPct}% yield meets ${intent.minGrossYield}%+ target`, '');
      else soft(16, false, '', `${yieldPct}% yield vs ${intent.minGrossYield}%+ target`, close, 0.4);
    } else if (yieldPct != null && (intent.boosts?.preferHighYield || intent.boosts?.preferCashFlow)) {
      soft(12, yieldPct >= 6, `${yieldPct}% gross yield`, `${yieldPct}% gross yield (modest)`, yieldPct >= 5, 0.35);
    }

    if (intent.boosts?.preferCashFlow || intent.boosts?.preferHighYield || intent.boosts?.preferRentalDemand) {
      if (cashFlow == null) soft(12, false, '', 'Cash flow not modelled', true, 0.2);
      else hard(12, cashFlow >= 0,
        `Positive cash flow (+£${Number(cashFlow).toLocaleString()}/mo)`,
        `Negative cash flow (£${cashFlow.toLocaleString()}/mo)`);
    }

    if (intent.boosts?.preferGrowth) {
      const growth = property.areaIntel?.priceGrowth
        ? parseFloat(String(property.areaIntel.priceGrowth).replace(/[^\d.]/g, '')) || 0
        : 0;
      soft(8, growth >= 2, `Local price growth ~${growth}%`, 'Limited growth signal in area data', growth > 0, 0.3);
    }

    if (intent.boosts?.preferRentalDemand || intent.boosts?.preferHighYield) {
      const conf = property.rentEstimate?.confidence;
      soft(8, conf === 'high' || conf === 'medium',
        conf === 'high' ? 'Reliable rental estimate' : 'Moderate rental confidence',
        'Rental demand not strongly confirmed',
        conf === 'medium',
        0.4);
    }

    if (intent.boosts?.preferBmv) {
      soft(10, bmv,
        bmv ? `${Math.abs(disc)}% below sold median` : '',
        'No clear below-market discount vs Land Registry');
    }
  }

  if (property.score != null) {
    soft(5, property.score >= 65,
      `Investment score ${property.score}/100`,
      `Investment score ${property.score}/100`,
      property.score >= 50,
      0.4);
  }

  const raw = weight > 0 ? (points / weight) * 100 : 0;
  let matchPct = Math.round(Math.min(98, Math.max(0, raw)));

  // Hard fails can never look like a strong fit
  if (checklist.some((c) => c.hard && !c.ok)) {
    matchPct = Math.min(matchPct, 48);
  }

  // Show fails first when weak, otherwise passes then warns then fails
  checklist.sort((a, b) => {
    if (matchPct < 55) return Number(a.ok) - Number(b.ok) || Number(a.warn) - Number(b.warn);
    return Number(b.ok) - Number(a.ok) || Number(b.warn) - Number(a.warn);
  });

  return { matchPct, checklist: checklist.slice(0, 8) };
}

export function briefMode(intent) {
  if (intent?.strategy === 'flip' || intent?.boosts?.preferRefurb) return 'refurb';
  if (intent?.strategy === 'demo') return 'development';
  if (intent?.strategy === 'hmo') return 'hmo';
  return 'rental';
}

export { isBmv, locationMatches, listingText };
