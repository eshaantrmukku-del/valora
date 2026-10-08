/**
 * Rental estimate — hybrid with explicit confidence.
 * 1. Live listed rent (rental listings) — confidence: high
 * 2. Regional baseline yield applied to real price — confidence: low, labelled
 * There is no free nearby-rentals API, so no comparable-rental tier yet;
 * the structure supports adding one without touching callers.
 */

export function estimateRent({ listedRent, price, areaYield, propertyType, beds }) {
  if (listedRent && listedRent > 0) {
    return {
      monthlyRent: listedRent,
      confidence: 'high',
      source: 'Listed rent from the live listing',
    };
  }

  if (price && areaYield) {
    // Type adjustment mirrors long-run yield spreads between stock types
    const typeAdj = { studio: 0.3, flat: 0, terraced: 0.4, semi: -0.2, detached: -0.5, bungalow: -0.3, house: 0.1 }[propertyType] ?? 0;
    const hmoBoost = beds >= 4 ? 0.4 : 0;
    const yieldPct = Math.max(2.5, areaYield + typeAdj + hmoBoost);
    return {
      monthlyRent: Math.round((price * yieldPct) / 100 / 12),
      confidence: 'low',
      source: `Modelled from ${areaYield}% regional baseline yield — verify against local rental listings`,
    };
  }

  return { monthlyRent: null, confidence: 'none', source: 'Insufficient data' };
}
