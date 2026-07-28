import { resolveLocation, NATIONAL, normalizeOutcode } from './ukMarketData';

export function parseAreaQuery(query) {
  const trimmed = query.trim();
  const postcodeMatch = trimmed.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/i);
  const outcodeMatch = trimmed.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/i);
  const cityMatch = trimmed.replace(/[^a-zA-Z\s]/g, ' ').trim();

  return {
    raw: trimmed,
    fullPostcode: postcodeMatch?.[1]?.toUpperCase() || null,
    outcode: postcodeMatch
      ? normalizeOutcode(postcodeMatch[1])
      : outcodeMatch?.[1]?.toUpperCase() || normalizeOutcode(trimmed),
    cityHint: cityMatch.length > 2 && !/^[A-Z]\d/i.test(cityMatch) ? cityMatch : null,
  };
}

/** Regional baseline report — no random jitter. */
export function generateAreaReport(query) {
  const parsed = parseAreaQuery(query);
  const key = parsed.fullPostcode || parsed.outcode || query.trim().toUpperCase();
  const location = resolveLocation({
    postcode: parsed.fullPostcode || parsed.outcode,
    city: parsed.cityHint,
  });

  const m = location.market;
  const outcode = parsed.outcode || key.split(' ')[0];

  const yieldPct = m.avgYield;
  const growth = m.growth5yr;
  const avgPrice = m.avgPrice;
  const vacancy = m.demand === 'very high' ? '1.8' : m.demand === 'high' ? '2.2' : '3.0';
  const score = Math.max(
    45,
    Math.min(
      92,
      55
        + Math.round((yieldPct - NATIONAL.avgYield) * 8)
        + (growth > 18 ? 8 : growth < 14 ? -4 : 0)
        + (m.demand === 'high' || m.demand === 'very high' ? 6 : 0),
    ),
  );
  const marketTemp = Math.min(85, 35 + growth + (m.demand === 'high' || m.demand === 'very high' ? 12 : 0));

  const areaName = parsed.cityHint
    ? `${parsed.cityHint} (${outcode})`
    : location.city !== 'UK'
      ? `${location.city} · ${outcode}`
      : `${outcode} district`;

  const strengths = [];
  const watchouts = [];

  if (yieldPct >= NATIONAL.avgYield) strengths.push(`Yields (${yieldPct}%) competitive vs national ${NATIONAL.avgYield}%`);
  if (growth >= 18) strengths.push(`Strong ${growth}% 5-year price growth trend`);
  if (m.demand === 'high' || m.demand === 'very high') strengths.push('High tenant demand');
  if (m.transport === 'Excellent') strengths.push('Excellent transport connectivity');
  if (m.crime === 'Low') strengths.push('Relatively low crime vs national average');

  if (yieldPct < 4.5) watchouts.push('Lower yields — typical of higher-value markets');
  if (parseFloat(vacancy) > 2.8) watchouts.push('Moderate vacancy risk in some sub-markets');
  if (m.crime === 'Moderate') watchouts.push('Crime levels warrant street-level checks');
  if (avgPrice > 350000) watchouts.push('Higher entry price — stress-test at higher LTV');

  const insight = buildAreaInsight({
    areaName, location, outcode, score, yieldPct, growth, avgPrice, vacancy, strengths, watchouts,
  });

  return {
    postcode: key,
    areaName,
    subtitle: `${outcode} · ${location.city} · regional baseline`,
    score,
    scoreLabel: score >= 75 ? 'High potential' : score >= 60 ? 'Moderate potential' : 'Mixed signals',
    marketTemp,
    avgPrice,
    growth: `+${growth}%`,
    yieldPct: `${yieldPct}%`,
    vacancy: `${vacancy}%`,
    rentalDemand: m.demand === 'very high' ? 'Very high' : m.demand === 'high' ? 'High' : 'Moderate',
    metrics: [
      { label: 'Rental demand', value: m.demand === 'very high' || m.demand === 'high' ? 'High' : 'Moderate', color: 'var(--green)' },
      { label: '5yr price growth', value: `+${growth}%`, color: growth >= 18 ? 'var(--green)' : 'var(--amber)' },
      { label: 'Avg gross yield', value: `${yieldPct}%`, color: 'var(--blue)' },
      { label: 'Vacancy (est.)', value: `${vacancy}%`, color: parseFloat(vacancy) < 3 ? 'var(--green)' : 'var(--amber)' },
    ],
    strengths: strengths.slice(0, 4),
    watchouts: watchouts.slice(0, 3),
    insight,
    city: location.city,
    region: m.region,
    isPrototype: false,
    source: 'Regional baseline table (illustrative)',
  };
}

function buildAreaInsight({ areaName, location, outcode, score, yieldPct, growth, avgPrice, vacancy, strengths, watchouts }) {
  const m = location.market;
  const demandWord = m.demand === 'high' || m.demand === 'very high' ? 'strong' : 'steady';

  const opening = `${areaName} sits in the ${location.city} market where typical entry is around £${avgPrice.toLocaleString()} with gross yields near ${yieldPct}%.`;

  const trend = growth >= 20
    ? `Price growth has run at ~${growth}% over five years — above the national average — suggesting ${demandWord} buyer and tenant interest.`
    : `Price growth of ~${growth}% over five years is ${growth >= 15 ? 'healthy' : 'modest'} for the region.`;

  const investor = score >= 72
    ? `For investors, the area scores well on yield and demand. ${strengths[0] || 'Rental fundamentals look solid'}.`
    : score >= 58
      ? `Mixed signals — workable for the right asset, but cherry-pick streets and property types. ${watchouts[0] || 'Due diligence essential'}.`
      : `Caution advised — ${watchouts[0] || 'returns may be tight'}. Focus on value-add or off-market deals.`;

  const closing = `Indicative vacancy around ${vacancy}%. Cross-reference with local agents and your target strategy before committing.`;

  return { opening, trend, investor, closing, summary: `${opening} ${investor}` };
}
