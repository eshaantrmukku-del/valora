/**
 * Comparable sales + value verdict.
 * Below-market claims ONLY from HM Land Registry sold comps — never regional averages.
 */

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * @param {Array} comparables from marketData.fetchSoldComparables
 * @param {number} askingPrice
 * @param {string|null} outcode preferred outcode for proximity
 */
export function analyseComparables(comparables, askingPrice, outcode = null) {
  if (!comparables?.length) {
    return {
      available: false,
      count: 0,
      sample: [],
      median: null,
      average: null,
      deviationPct: null,
      undervalued: null,
      confidence: 'none',
      note: 'No sold comparables available for this district',
      verdict: valueVerdict(null, null, false, 'none'),
    };
  }

  // Exclude new builds — they inflate medians vs older stock investors buy
  const cleaned = comparables.filter((c) => c.price && !c.newBuild);
  const pool = cleaned.length >= 4 ? cleaned : comparables.filter((c) => c.price);

  if (!pool.length) {
    return {
      available: false,
      count: 0,
      sample: [],
      median: null,
      average: null,
      deviationPct: null,
      undervalued: null,
      confidence: 'none',
      note: 'No usable sold comparables after filtering',
      verdict: valueVerdict(null, null, false, 'none'),
    };
  }

  // Prefer same-outcode; take up to 12 for a stabler median
  const sameOut = outcode ? pool.filter((c) => c.outcode === outcode) : [];
  const sample = (sameOut.length >= 4 ? sameOut : pool).slice(0, 12);
  const prices = sample.map((c) => c.price);
  const med = median(prices);
  const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);

  const deviationPct = med && askingPrice
    ? Math.round(((askingPrice - med) / med) * 1000) / 10
    : null;

  const sameOutcodeCount = outcode
    ? sample.filter((c) => c.outcode === outcode).length
    : 0;

  // Confidence from sample quality
  let confidence = 'low';
  if (sample.length >= 8 && sameOutcodeCount >= 4) confidence = 'high';
  else if (sample.length >= 5 && sameOutcodeCount >= 2) confidence = 'medium';
  else if (sample.length >= 5) confidence = 'medium';

  let undervalued = null;
  if (deviationPct != null) {
    // Stronger bar when confidence is low
    if (confidence === 'low') {
      if (deviationPct <= -12) undervalued = 'strong';
      else if (deviationPct <= -7) undervalued = 'possible';
      else undervalued = 'no';
    } else if (confidence === 'medium') {
      if (deviationPct <= -10) undervalued = 'strong';
      else if (deviationPct <= -5) undervalued = 'possible';
      else undervalued = 'no';
    } else {
      if (deviationPct <= -8) undervalued = 'strong';
      else if (deviationPct <= -4) undervalued = 'possible';
      else undervalued = 'no';
    }
  }

  const note = sameOutcodeCount > 0
    ? `${sameOutcodeCount} of ${sample.length} sales in the same outcode · ${confidence} confidence`
    : `District-level sales (${sample.length}) · ${confidence} confidence — confirm street-level with an agent`;

  return {
    available: true,
    count: pool.length,
    sample,
    sameOutcodeCount,
    median: med,
    average: avg,
    deviationPct,
    undervalued,
    confidence,
    note,
    verdict: valueVerdict(deviationPct, undervalued, true, confidence, med, askingPrice),
  };
}

/**
 * Human verdict for cheap / fair / expensive vs Land Registry only.
 */
export function valueVerdict(
  deviationPct,
  undervalued,
  available,
  confidence = 'none',
  medianPrice = null,
  askingPrice = null,
) {
  if (!available || deviationPct == null) {
    return {
      label: 'Price vs market unclear',
      tone: 'unknown',
      summary: 'No reliable HM Land Registry sold comps for this area/type — Valora will not claim this is cheap.',
      discountPct: null,
      evidence: [],
    };
  }

  const abs = Math.abs(deviationPct);
  const evidence = [
    medianPrice != null ? `Sold median £${Number(medianPrice).toLocaleString()}` : null,
    askingPrice != null ? `Asking £${Number(askingPrice).toLocaleString()}` : null,
    `${deviationPct > 0 ? '+' : ''}${deviationPct}% vs sold median`,
    `Comp confidence: ${confidence}`,
  ].filter(Boolean);

  if (undervalued === 'strong') {
    return {
      label: 'Appears cheap vs sold comps',
      tone: 'cheap',
      summary: `Asking is about ${abs}% below the recent sold median — a strong below-market signal. Confirm condition, lease, and exact street before offering.`,
      discountPct: abs,
      evidence,
    };
  }
  if (undervalued === 'possible') {
    return {
      label: 'Possible below-market entry',
      tone: 'possible',
      summary: `Asking is about ${abs}% below the sold median — worth investigating, but check why (condition, tenure, location within the district).`,
      discountPct: abs,
      evidence,
    };
  }
  if (deviationPct >= 8) {
    return {
      label: 'Above recent sold prices',
      tone: 'expensive',
      summary: `Asking is about ${abs}% above the sold median — thin entry discount unless the home is clearly superior.`,
      discountPct: -abs,
      evidence,
    };
  }
  if (deviationPct > 2) {
    return {
      label: 'Slightly above sold median',
      tone: 'fair',
      summary: `Asking is modestly above recent sold prices (${abs}%).`,
      discountPct: -abs,
      evidence,
    };
  }
  return {
    label: 'In line with sold comps',
    tone: 'fair',
    summary: 'Asking is close to the recent sold median for this type in the area.',
    discountPct: abs < 1 ? 0 : -deviationPct,
    evidence,
  };
}
