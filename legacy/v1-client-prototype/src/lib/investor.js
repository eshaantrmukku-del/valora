import { getProfile, saveProfile } from './storage';

const PREFS_KEY = 'valora_investor_prefs';

const DEFAULTS = {
  strategy: 'buy-to-let',
  targetYield: 7,
  maxBudget: 350000,
  depositPct: 25,
  interestRate: 4.5,
  termYears: 25,
  regions: [],
  riskTolerance: 'balanced',
};

export function getInvestorPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveInvestorPrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...DEFAULTS, ...prefs }));
  window.dispatchEvent(new Event('valora-store-change'));
}

export function getPortfolioMeta() {
  try {
    return JSON.parse(localStorage.getItem('valora_portfolio_meta') || '{}');
  } catch {
    return {};
  }
}

export function setPortfolioMeta(propertyId, patch) {
  const all = getPortfolioMeta();
  all[propertyId] = { ...(all[propertyId] || {}), ...patch, updatedAt: Date.now() };
  localStorage.setItem('valora_portfolio_meta', JSON.stringify(all));
  window.dispatchEvent(new Event('valora-store-change'));
}

export function getPortfolioStatus(propertyId) {
  return getPortfolioMeta()[propertyId]?.status || 'watching';
}

export function getPortfolioNote(propertyId) {
  return getPortfolioMeta()[propertyId]?.note || '';
}

/**
 * England residential SDLT (illustrative).
 * @param {number} price
 * @param {{ firstTimeBuyer?: boolean, additionalDwelling?: boolean }} opts
 */
export function stampDutyEngland(price, opts = {}) {
  const firstTimeBuyer = typeof opts === 'boolean' ? opts : Boolean(opts.firstTimeBuyer);
  const additionalDwelling = typeof opts === 'boolean' ? false : opts.additionalDwelling !== false;
  const p = Math.max(0, Number(price) || 0);

  // FTB relief: 0% to £300k, 5% £300k–£500k; no relief above £500k
  if (firstTimeBuyer && !additionalDwelling && p <= 500000) {
    if (p <= 300000) return 0;
    return Math.round((p - 300000) * 0.05);
  }

  const bands = [
    [125000, 0],
    [250000, 0.02],
    [925000, 0.05],
    [1500000, 0.1],
    [Infinity, 0.12],
  ];
  let tax = 0;
  let prev = 0;
  for (const [limit, rate] of bands) {
    const slice = Math.min(p, limit) - prev;
    if (slice > 0) tax += slice * rate;
    prev = limit;
    if (p <= limit) break;
  }

  // Higher rates for additional dwellings (approx +5pp on each band)
  if (additionalDwelling) {
    const surchargeBands = [
      [125000, 0.05],
      [250000, 0.07],
      [925000, 0.1],
      [1500000, 0.15],
      [Infinity, 0.17],
    ];
    tax = 0;
    prev = 0;
    for (const [limit, rate] of surchargeBands) {
      const slice = Math.min(p, limit) - prev;
      if (slice > 0) tax += slice * rate;
      prev = limit;
      if (p <= limit) break;
    }
  }

  return Math.round(tax);
}

export function mortgagePayment(principal, annualRatePct, years, interestOnly = false) {
  const P = Math.max(0, Number(principal) || 0);
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  const n = Math.max(1, Math.round((Number(years) || 25) * 12));
  if (interestOnly) return P * r;
  if (r === 0) return P / n;
  return (P * r * (1 + r) ** n) / ((1 + r) ** n - 1);
}

export function yieldMetrics({ price, monthlyRent, costsAnnual = 0 }) {
  const p = Math.max(1, Number(price) || 0);
  const rent = Math.max(0, Number(monthlyRent) || 0);
  const annual = rent * 12;
  const gross = (annual / p) * 100;
  const net = ((annual - (Number(costsAnnual) || 0)) / p) * 100;
  return {
    annualRent: Math.round(annual),
    grossYield: Math.round(gross * 10) / 10,
    netYield: Math.round(net * 10) / 10,
  };
}

export { getProfile, saveProfile };
